/**
 * アーカイブモード: YouTube チャットリプレイの監視
 *
 * 知見（Phase -1 より）:
 * - チャットリプレイは iframe 内にある（all_frames: true で対応済み）
 * - #items 要素は遅延初期化されるため MutationObserver で出現を検知する
 * - setTimeout ポーリングは使用しない
 */

import { buildKeywordSet, matchesKeyword } from './filter.js';
import { filterMessageElement, restoreMessageElement } from './chat-dom.js';
import {
  loadSettings,
  STORAGE_KEY,
  type Settings,
} from '../shared/settings.js';

/** YouTube チャットリプレイのメッセージコンテナ */
const ITEMS_SELECTOR = '#items';

/** 各チャットメッセージのテキスト要素 */
const MSG_TEXT_SELECTOR = '#message';

/** フィルタ済みメッセージを検索するセレクタ */
const FILTERED_SELECTOR = '[data-spoilershield-filtered="true"]';

let currentSettings: Settings | null = null;
let currentKeywords: Set<string> = new Set();
let itemsContainerRef: Element | null = null;

export function startArchiveMode(): void {
  console.log('[SpoilerShield] アーカイブモード開始:', location.href);

  // 設定を読み込んでから監視開始
  loadSettings().then((settings) => {
    currentSettings = settings;
    currentKeywords = buildKeywordsFromSettings(settings);

    // 設定変更をリアルタイムに反映
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      const next = changes[STORAGE_KEY].newValue as Settings;
      currentSettings = next;
      currentKeywords = buildKeywordsFromSettings(next);

      // 既存フィルタを全リセットして再適用
      if (itemsContainerRef) {
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
  return buildKeywordSet(settings.gameId, settings.filterMode, progress);
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

  // #items はユーザーがチャットを開いた後に遅延初期化されるため、
  // documentElement 全体を監視して出現を検知する
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

  // ページ表示時点でレンダリング済みのメッセージを処理
  itemsContainer.querySelectorAll(MSG_TEXT_SELECTOR).forEach((el) => {
    processMessage(el);
  });

  // 以降に追加されるメッセージを監視
  const observer = new MutationObserver((mutations) => {
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

  observer.observe(itemsContainer, { childList: true });
}

/**
 * 既存の全メッセージを復元してから設定に基づいて再フィルタする。
 * 設定変更（有効/無効・フィルタモード・進行状況）時に呼ばれる。
 */
function reprocessAll(itemsContainer: Element): void {
  // まず全フィルタを解除
  itemsContainer.querySelectorAll(FILTERED_SELECTOR).forEach((el) => {
    restoreMessageElement(el);
  });

  // 有効な場合のみ再フィルタ
  if (!currentSettings?.enabled) return;

  itemsContainer.querySelectorAll(MSG_TEXT_SELECTOR).forEach((el) => {
    processMessage(el);
  });
}

function processMessage(el: Element): void {
  if (!currentSettings?.enabled) return;

  const text = el.textContent ?? '';
  if (!text.trim()) return;

  const matchResult = matchesKeyword(text, currentKeywords);
  const debugContext = {
    game: currentSettings.gameId,
    progress: currentSettings.progressByGame[currentSettings.gameId] ?? '未設定',
    filterMode: currentSettings.filterMode,
  };

  if (matchResult !== null) {
    console.log('[SpoilerShield] ✅ フィルタ対象', {
      text,
      matchedKeyword: matchResult.keyword,
      matchedContext: matchResult.contextPattern,
      ...debugContext,
      result: 'フィルタする',
    });
    filterMessageElement(el, currentSettings.displayMode, matchResult.keyword, matchResult.contextPattern);
    // フィルタカウントは非同期でインクリメント（カウント失敗はサイレント無視）
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const stored = result[STORAGE_KEY] as Settings | undefined;
      if (!stored) return;
      chrome.storage.local.set({ [STORAGE_KEY]: { ...stored, filterCount: stored.filterCount + 1 } });
    });
  } else {
    console.log('[SpoilerShield] ⬜ スルー', {
      text,
      matchedKeyword: null,
      matchedContext: null,
      ...debugContext,
      result: 'フィルタしない',
    });
  }
}
