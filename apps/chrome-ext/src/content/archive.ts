/**
 * アーカイブモード: YouTube チャットリプレイの監視
 *
 * 知見（Phase -1 より）:
 * - チャットリプレイは iframe 内にある（all_frames: true で対応済み）
 * - #items 要素は遅延初期化されるため MutationObserver で出現を検知する
 * - setTimeout ポーリングは使用しない
 *
 * フィルタ 2 段構成:
 * - Stage 1: キーワードマッチ（即時、ブラウザ内完結）
 * - Stage 2: プロキシ経由 LLM 判定（非同期、判定中は通常表示を維持）
 */

import { buildKeywordSet, buildDescriptionPhraseSet, matchesKeyword, matchesKeywordForStage2, matchesCustomNGWord, buildActiveGenreTemplates, matchesGenreTemplate } from './filter.js';
import type { GenreTemplate } from '@spoilershield/knowledge-base';
import { filterMessageElement, restoreMessageElement, switchDisplayMode, ATTR_FALSE_POSITIVE } from './chat-dom.js';
import {
  loadSettings,
  STORAGE_KEY,
  FILTER_COUNT_KEY,
  getOrCreateAnonToken,
  getStage2Usage,
  incrementStage2Usage,
  STAGE2_MONTHLY_LIMIT,
  saveMisreport,
  type Settings,
} from '../shared/settings.js';
import type { MisreportEntry } from '@spoilershield/shared';
import {
  initStage2Cache,
  getCachedVerdict,
  buildStage2CacheKey,
  sendStage2Batch,
  verdictFromCache,
  type Stage2Candidate,
  type JudgeCacheEntry,
} from './stage2.js';

/** YouTube チャットリプレイのメッセージコンテナ */
const ITEMS_SELECTOR = '#items';

/** 各チャットメッセージのテキスト要素 */
const MSG_TEXT_SELECTOR = '#message';

/** フィルタ済みメッセージを検索するセレクタ（revealed も含む） */
const FILTERED_SELECTOR = '[data-spoilershield-filtered]';

/** chat-dom.ts と同じ属性名（DOM チェック用） */
const ATTR_FILTERED = 'data-spoilershield-filtered';

// ─── コンテキスト有効性チェック ───────────────────────────────────────────────

/**
 * 拡張機能のコンテキストがまだ有効かどうかを確認する。
 * 拡張がリロード・更新・無効化されると chrome.runtime.id が undefined になる。
 * Content Script はページが残っている限り生き続けるため、このチェックが必要。
 */
function isContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/**
 * コンテキスト無効を検知したときの終了処理。
 * Observer を止め、Stage 2 キューをクリアしてこれ以上 Chrome API を呼ばないようにする。
 */
function shutdownOnInvalidContext(): void {
  console.log('[SpoilerShield] 拡張コンテキストが無効になりました。監視を停止します。');
  itemsObserver?.disconnect();
  itemsObserver = null;
  stage2Queue = [];
}

// ─── モジュールスコープ状態 ───────────────────────────────────────────────────

let currentSettings: Settings | null = null;
let currentKeywords: Set<string> = new Set();
let currentDescriptionPhrases: Set<string> = new Set();
let currentGenreTemplates: GenreTemplate[] = [];
let itemsContainerRef: Element | null = null;

/** #items の childList を監視する Observer（pause/resume のために保持） */
let itemsObserver: MutationObserver | null = null;

/**
 * 表示方式の切り替え処理中フラグ。
 * reprocessAll 実行中は MutationObserver のコールバックをスキップすることで、
 * DOM 更新と chrome.storage.onChanged ハンドラの競合を防ぐ。
 */
let isUpdatingDisplayMode = false;

/**
 * ユーザーがクリックして展開したコメントのオリジナルテキストを記憶する。
 * YouTube が DOM を差し替えて新しい要素が追加された場合でも、
 * 同じテキストを再フィルタしないために使用する。
 */
const revealedTexts = new Set<string>();

// ─── Stage 2 状態 ─────────────────────────────────────────────────────────────

/** Stage 2 判定待ちキュー */
let stage2Queue: Stage2Candidate[] = [];

/** Stage 2 判定を実行中かどうか（再入防止） */
let isDraining = false;

/** キュー蓄積用デバウンスタイマー */
let drainDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** 起動時に取得した匿名トークン */
let anonToken = '';

// ─── エントリポイント ─────────────────────────────────────────────────────────

export function startArchiveMode(mode: 'archive' | 'live' = 'archive'): void {
  console.log(`[SpoilerShield] ${mode === 'live' ? 'ライブモード' : 'アーカイブモード'}で起動しました`);

  // 動画単位のフィルタカウンターをリセット（リロード・別動画への移動時）
  chrome.storage.local.set({ [FILTER_COUNT_KEY]: 0 });

  // Stage 2 キャッシュの読み込みとトークン取得を並行して初期化
  Promise.all([initStage2Cache(), getOrCreateAnonToken()]).then(([, token]) => {
    anonToken = token;
  });

  loadSettings().then((settings) => {
    currentSettings = settings;
    currentKeywords = buildKeywordsFromSettings(settings);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      const prev = changes[STORAGE_KEY].oldValue as Settings | undefined;
      const next = changes[STORAGE_KEY].newValue as Settings;

      const displayModeChanged = prev?.displayMode !== next.displayMode;
      const onlyDisplayModeChanged =
        displayModeChanged &&
        prev?.enabled === next.enabled &&
        prev?.gameId === next.gameId &&
        prev?.filterMode === next.filterMode &&
        JSON.stringify(prev?.progressByGame) === JSON.stringify(next.progressByGame) &&
        JSON.stringify(prev?.customNgWords) === JSON.stringify(next.customNgWords) &&
        JSON.stringify(prev?.selectedGenreTemplates) === JSON.stringify(next.selectedGenreTemplates);

      currentSettings = next;
      currentKeywords = buildKeywordsFromSettings(next);

      if (!itemsContainerRef) return;

      if (onlyDisplayModeChanged) {
        // displayMode のみ変更: 復元→再フィルタせず、表示方式だけ直接切り替える（フラッシュ防止）
        isUpdatingDisplayMode = true;
        itemsContainerRef.querySelectorAll('[data-spoilershield-filtered="true"]').forEach((el) => {
          switchDisplayMode(el, next.displayMode, () => {
            const text = el.getAttribute('data-spoilershield-original') ?? el.textContent?.trim() ?? '';
            if (text) revealedTexts.add(text);
          });
        });
        isUpdatingDisplayMode = false;
      } else {
        // 設定変更: Stage 2 キューをクリアして再処理
        clearStage2Queue();
        reprocessAll(itemsContainerRef);
      }
    });

    if (settings.enabled) {
      waitForItemsContainer();
    }
  });
}

// ─── 設定・キーワード構築 ─────────────────────────────────────────────────────

function buildKeywordsFromSettings(settings: Settings): Set<string> {
  const progress = settings.progressByGame[settings.gameId];
  currentDescriptionPhrases = buildDescriptionPhraseSet(settings.gameId);
  currentGenreTemplates = buildActiveGenreTemplates(settings.selectedGenreTemplates ?? []);
  return buildKeywordSet(settings.gameId, settings.filterMode, progress);
}

// ─── MutationObserver 管理 ────────────────────────────────────────────────────

function pauseObserver(): void {
  itemsObserver?.disconnect();
}

function resumeObserver(): void {
  if (itemsObserver && itemsContainerRef) {
    itemsObserver.observe(itemsContainerRef, { childList: true });
  }
}

/**
 * #items 要素の出現を MutationObserver で待機する。
 * すでに存在する場合は即座に監視開始する。
 */
function waitForItemsContainer(): void {
  const existing = document.querySelector(ITEMS_SELECTOR);
  if (existing) {
    observeItems(existing);
    return;
  }

  const observer = new MutationObserver(() => {
    const el = document.querySelector(ITEMS_SELECTOR);
    if (el) {
      observer.disconnect();
      observeItems(el);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

/**
 * #items コンテナを監視し、追加された子要素に Stage 1 フィルタを適用する。
 */
function observeItems(itemsContainer: Element): void {
  itemsContainerRef = itemsContainer;

  itemsContainer.querySelectorAll(MSG_TEXT_SELECTOR).forEach((el) => {
    processMessage(el);
  });

  itemsObserver = new MutationObserver((mutations) => {
    // 表示方式の切り替え処理中は干渉しない
    if (isUpdatingDisplayMode) return;

    // #items の子要素が削除された = 再生位置変更（シーク）
    // revealedTexts をクリアして、巻き戻し後のコメントを正しく再フィルタする
    const hasRemovals = mutations.some((m) => m.removedNodes.length > 0);
    if (hasRemovals) {
      revealedTexts.clear();
      clearStage2Queue();
    }

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        const msgEl = node.matches(MSG_TEXT_SELECTOR)
          ? node
          : node.querySelector(MSG_TEXT_SELECTOR);
        if (msgEl) processMessage(msgEl);
      }
    }
  });

  itemsObserver.observe(itemsContainer, { childList: true });
}

/**
 * 既存の全フィルタを解除して再フィルタする。
 * Observer を一時停止して干渉を防ぐ。
 */
function reprocessAll(itemsContainer: Element): void {
  isUpdatingDisplayMode = true;
  pauseObserver();

  itemsContainer.querySelectorAll(FILTERED_SELECTOR).forEach((el) => {
    restoreMessageElement(el);
  });

  if (currentSettings?.enabled) {
    itemsContainer.querySelectorAll(MSG_TEXT_SELECTOR).forEach((el) => {
      processMessage(el);
    });
  }

  resumeObserver();
  isUpdatingDisplayMode = false;
}

// ─── メッセージ処理 ────────────────────────────────────────────────────────────

function processMessage(el: Element): void {
  if (!isContextValid()) {
    shutdownOnInvalidContext();
    return;
  }
  if (!currentSettings?.enabled) return;

  // 誤判定報告済みの要素は再フィルタしない
  if (el.getAttribute(ATTR_FALSE_POSITIVE) === 'true') return;

  // DOM 再利用ケース: YouTubeが要素を使い回した場合、古い属性が残っている可能性がある。
  // その場合は属性を一掃して最初から処理する。
  // stale 判定: ATTR_ORIGINAL（元テキスト）が revealedTexts に含まれない revealed 状態 = 使い回し
  if (el.hasAttribute(ATTR_FILTERED)) {
    const storedOriginal = el.getAttribute('data-spoilershield-original');
    const isStale =
      el.getAttribute(ATTR_FILTERED) === 'revealed' &&
      !revealedTexts.has(storedOriginal ?? '');
    const isTrueFiltered = el.getAttribute(ATTR_FILTERED) === 'true';
    if (!isStale && isTrueFiltered) return;
    el.removeAttribute(ATTR_FILTERED);
    el.removeAttribute('data-spoilershield-original');
    el.removeAttribute('data-spoilershield-matched-keyword');
    el.removeAttribute('data-spoilershield-matched-context');
    (el as HTMLElement).style.cursor = '';
    (el as HTMLElement).style.opacity = '';
  }

  const text = el.textContent?.trim() ?? '';
  if (!text) return;

  if (revealedTexts.has(text)) return;

  // ── カスタムNGワード: 即時判定（ゲーム知識ベースと独立） ───────────────────────
  const customNgWords = currentSettings.customNgWords ?? [];
  const matchedNgWord = matchesCustomNGWord(text, customNgWords);
  if (matchedNgWord !== null) {
    console.log(`[SpoilerShield] カスタムNGワード: "${text.slice(0, 20)}" → フィルタ (${matchedNgWord})`);
    applyFilter(el, text, matchedNgWord);
    return;
  }

  // ── ジャンルテンプレート: 即時判定（ゲーム知識ベースと独立） ──────────────────
  const matchedGenre = matchesGenreTemplate(text, currentGenreTemplates);
  if (matchedGenre !== null) {
    console.log(`[SpoilerShield] ジャンルテンプレート: "${text.slice(0, 20)}" → フィルタ (${matchedGenre})`);
    applyFilter(el, text, matchedGenre);
    return;
  }

  // ── Stage 1: 即時判定 ──────────────────────────────────────────────────────
  const matchResult = matchesKeyword(text, currentKeywords, currentDescriptionPhrases);

  if (matchResult !== null) {
    const matchInfo = matchResult.keyword ?? matchResult.phrase ?? matchResult.reason;
    console.log(`[SpoilerShield] Stage 1結果: ${text.slice(0, 20)} → フィルタ (${matchInfo})`);
    applyFilter(el, text, matchResult.keyword, matchResult.verb ?? matchResult.phrase);
    return;
  }

  // ── Stage 2: キーワード単体マッチ → プロキシへ委託 ──────────────────────────
  const stage2keyword = matchesKeywordForStage2(text, currentKeywords);
  if (!stage2keyword) return;
  console.log(`[SpoilerShield] Stage 1結果: ${text.slice(0, 20)} → Stage2候補 (keyword: ${stage2keyword})`);

  const progress = currentSettings.progressByGame[currentSettings.gameId];
  const cacheKey = buildStage2CacheKey(currentSettings.gameId, progress, text);

  // キャッシュ済みなら即時適用
  const cached = getCachedVerdict(cacheKey);
  if (cached !== null) {
    applyStage2Verdict({ text, el: new WeakRef(el), cacheKey, matchedKeyword: stage2keyword }, cached);
    return;
  }

  // 未判定: キューに追加して後送（判定中は通常表示のまま）
  stage2Queue.push({ text, el: new WeakRef(el), cacheKey, matchedKeyword: stage2keyword });
  scheduleDrain();
}

// ─── Stage 2 キュー管理 ────────────────────────────────────────────────────────

function clearStage2Queue(): void {
  stage2Queue = [];
}

/**
 * 新しい候補が追加されたら 200ms のデバウンス後にドレイン開始。
 * 連続する MutationObserver コールバックをまとめてバッチ化する。
 */
function scheduleDrain(): void {
  if (drainDebounceTimer !== null) return;
  drainDebounceTimer = setTimeout(() => {
    drainDebounceTimer = null;
    drainStage2Queue();
  }, 200);
}

/**
 * Stage 2 キューを 5 件ずつプロキシに送信する。
 * バッチ間は 1 秒待機してレート制限に配慮する。
 */
async function drainStage2Queue(): Promise<void> {
  if (isDraining || !currentSettings?.enabled || !anonToken) return;
  if (stage2Queue.length === 0) return;

  isDraining = true;
  try {
    while (stage2Queue.length > 0) {
      // コンテキストが無効になったら中断（拡張リロード時等）
      if (!isContextValid()) {
        shutdownOnInvalidContext();
        break;
      }
      // enabled が途中でオフになったら中断
      if (!currentSettings?.enabled) break;

      // 月間上限チェック: 上限に達していたら Stage 2 を停止し Stage 1 のみで継続
      const usage = await getStage2Usage();
      if (usage.messageCount >= STAGE2_MONTHLY_LIMIT) {
        console.log(`[SpoilerShield] Stage 2月間上限(${STAGE2_MONTHLY_LIMIT}回)に達しました。Stage 1のみで動作を継続します。`);
        stage2Queue = [];
        break;
      }

      const batch = stage2Queue.splice(0, 5);
      console.log(`[SpoilerShield] Stage 2送信: ${batch.length}件`);
      const success = await sendStage2Batch(batch, currentSettings, anonToken, applyStage2Verdict);
      if (success) await incrementStage2Usage(batch.length);

      if (stage2Queue.length > 0) {
        await sleep(1000);
      }
    }
  } finally {
    isDraining = false;
    // ドレイン中に追加されたアイテムがあれば再スケジュール
    if (stage2Queue.length > 0) {
      scheduleDrain();
    }
  }
}

/**
 * Stage 2 判定結果を DOM に適用する。
 * - 'block' または 'uncertain' → フィルタ（安全側に倒す）
 * - 'allow' → 何もしない
 */
function applyStage2Verdict(candidate: Stage2Candidate, entry: JudgeCacheEntry): void {
  if (!currentSettings) return;

  const verdict = verdictFromCache(entry, currentSettings.filterMode);
  if (verdict === 'allow') return;

  const el = candidate.el.deref();
  if (!el) return; // 要素が DOM から消えた

  if (!currentSettings.enabled) return;

  // 誤判定報告済みの要素は再フィルタしない
  if (el.getAttribute(ATTR_FALSE_POSITIVE) === 'true') return;

  // 要素がすでにフィルタ済み（Stage 1 が後から適用された等）
  if (el.hasAttribute(ATTR_FILTERED)) return;

  // YouTube が DOM を差し替えてテキストが変わっていたらスキップ
  if (el.textContent?.trim() !== candidate.text) return;

  // ユーザーが展開済みのテキストはスキップ
  if (revealedTexts.has(candidate.text)) return;

  console.log(`[SpoilerShield] Stage 2 フィルタ: "${candidate.text}" (${entry.spoilerCategory ?? 'uncertain'})`);
  applyFilter(el, candidate.text, candidate.matchedKeyword, undefined, entry.spoilerCategory);
}

/** フィルタを適用して filterCount をインクリメントする共通処理 */
function applyFilter(
  el: Element,
  text: string,
  matchedKeyword?: string,
  matchedContext?: string,
  spoilerCategory?: string | null,
): void {
  if (!currentSettings) return;
  const settings = currentSettings;

  const onMisreport = (): void => {
    const entry: MisreportEntry = {
      text,
      spoilerCategory: spoilerCategory ?? null,
      gameId: settings.gameId,
      progress: settings.progressByGame[settings.gameId] ?? null,
      filterMode: settings.filterMode,
      timestamp: new Date().toISOString(),
    };
    saveMisreport(entry);
  };

  filterMessageElement(
    el,
    settings.displayMode,
    matchedKeyword,
    matchedContext,
    () => { revealedTexts.add(text); },
    onMisreport,
  );
  try {
    chrome.storage.local.get(FILTER_COUNT_KEY, (result) => {
      const prev = (result[FILTER_COUNT_KEY] as number | undefined) ?? 0;
      chrome.storage.local.set({ [FILTER_COUNT_KEY]: prev + 1 });
    });
  } catch {
    // processMessage のチェック直後にコンテキストが無効になった場合のレース条件ガード
    shutdownOnInvalidContext();
  }
}

// ─── ユーティリティ ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
