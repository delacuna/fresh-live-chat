/**
 * アーカイブモード: YouTube チャットリプレイの監視
 *
 * 知見（Phase -1 より）:
 * - チャットリプレイは iframe 内にある（all_frames: true で対応済み）
 * - #items 要素は遅延初期化されるため MutationObserver で出現を検知する
 * - setTimeout ポーリングは使用しない
 */

import { buildKeywordSet, buildDescriptionPhraseSet, matchesKeyword } from './filter.js';
import { filterMessageElement, restoreMessageElement, switchDisplayMode } from './chat-dom.js';
import {
  loadSettings,
  STORAGE_KEY,
  FILTER_COUNT_KEY,
  type Settings,
} from '../shared/settings.js';

/** YouTube チャットリプレイのメッセージコンテナ */
const ITEMS_SELECTOR = '#items';

/** 各チャットメッセージのテキスト要素 */
const MSG_TEXT_SELECTOR = '#message';

/** フィルタ済みメッセージを検索するセレクタ（revealed も含む） */
const FILTERED_SELECTOR = '[data-spoilershield-filtered]';

/** chat-dom.ts と同じ属性名（DOM チェック用） */
const ATTR_FILTERED = 'data-spoilershield-filtered';

let currentSettings: Settings | null = null;
let currentKeywords: Set<string> = new Set();
let currentDescriptionPhrases: Set<string> = new Set();
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

export function startArchiveMode(): void {
  console.log('[SpoilerShield] アーカイブモード開始:', location.href);

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
        JSON.stringify(prev?.progressByGame) === JSON.stringify(next.progressByGame);

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
        reprocessAll(itemsContainerRef);
      }
    });

    if (settings.enabled) {
      waitForItemsContainer();
    }
  });
}

function buildKeywordsFromSettings(settings: Settings): Set<string> {
  const progress = settings.progressByGame[settings.gameId];
  currentDescriptionPhrases = buildDescriptionPhraseSet(settings.gameId);
  return buildKeywordSet(settings.gameId, settings.filterMode, progress);
}

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
  console.log('[SpoilerShield] チャット監視を開始しました');
  itemsContainerRef = itemsContainer;
  console.log(`[SpoilerShield] キーワード数: ${currentKeywords.size}`);

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
      console.log('[SpoilerShield] シークを検知: revealedTexts をリセットしました');
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

function processMessage(el: Element): void {
  if (!currentSettings?.enabled) return;

  // DOM 再利用ケース: YouTubeが要素を使い回した場合、古い属性が残っている可能性がある。
  // その場合は属性を一掃して最初から処理する。
  if (el.hasAttribute(ATTR_FILTERED)) {
    // revealed 状態かつ revealedTexts に該当テキストがない → シーク後の再利用
    const isStale =
      el.getAttribute(ATTR_FILTERED) === 'revealed' && !revealedTexts.has(el.textContent?.trim() ?? '');
    const isTrueFiltered = el.getAttribute(ATTR_FILTERED) === 'true';
    if (!isStale && isTrueFiltered) return; // 正当なフィルタ済みはスキップ
    // それ以外は古い属性をクリアして再処理
    el.removeAttribute(ATTR_FILTERED);
    el.removeAttribute('data-spoilershield-original');
    el.removeAttribute('data-spoilershield-matched-keyword');
    el.removeAttribute('data-spoilershield-matched-context');
    (el as HTMLElement).style.cursor = '';
    (el as HTMLElement).style.opacity = '';
  }

  const text = el.textContent?.trim() ?? '';
  if (!text) return;

  // ユーザーが展開したテキストは YouTube が DOM を差し替えても再フィルタしない
  if (revealedTexts.has(text)) return;

  const matchResult = matchesKeyword(text, currentKeywords, currentDescriptionPhrases);
  const debugContext = {
    game: currentSettings.gameId,
    progress: currentSettings.progressByGame[currentSettings.gameId] ?? '未設定',
    filterMode: currentSettings.filterMode,
  };

  if (matchResult !== null) {
    console.log('[SpoilerShield] ✅ フィルタ対象', {
      text,
      reason: matchResult.reason,
      matchedKeyword: matchResult.keyword ?? null,
      matchedVerb: matchResult.verb ?? null,
      matchedPhrase: matchResult.phrase ?? null,
      ...debugContext,
      result: 'フィルタする',
    });
    filterMessageElement(
      el,
      currentSettings.displayMode,
      matchResult.keyword,
      matchResult.verb ?? matchResult.phrase,
      () => { revealedTexts.add(text); }, // ユーザーが展開したら記録
    );
    // filterCount は専用キーに書き込む（STORAGE_KEY への書き込みと競合させない）
    chrome.storage.local.get(FILTER_COUNT_KEY, (result) => {
      const prev = (result[FILTER_COUNT_KEY] as number | undefined) ?? 0;
      const next = prev + 1;
      console.log('[SpoilerShield][storage.set] filterCount++', { caller: 'content', filterCount: next });
      chrome.storage.local.set({ [FILTER_COUNT_KEY]: next });
    });
  }
}
