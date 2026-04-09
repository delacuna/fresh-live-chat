/**
 * アーカイブモード: YouTube チャットリプレイの監視
 *
 * 知見（Phase -1 より）:
 * - チャットリプレイは iframe 内にある（all_frames: true で対応済み）
 * - #items 要素は遅延初期化されるため MutationObserver で出現を検知する
 * - setTimeout ポーリングは使用しない
 */

import { buildKeywordSet, matchesKeyword } from './filter.js';
import { filterMessageElement } from './chat-dom.js';

/** YouTube チャットリプレイのメッセージコンテナ */
const ITEMS_SELECTOR = '#items';

/** 各チャットメッセージのテキスト要素 */
const MSG_TEXT_SELECTOR = '#message';

export function startArchiveMode(): void {
  console.log('[SpoilerShield] アーカイブモード開始:', location.href);
  waitForItemsContainer();
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
  const keywords = buildKeywordSet();
  console.log(`[SpoilerShield] キーワード数: ${keywords.size}`);

  // ページ表示時点でレンダリング済みのメッセージを処理
  itemsContainer.querySelectorAll(MSG_TEXT_SELECTOR).forEach((el) => {
    processMessage(el, keywords);
  });

  // 以降に追加されるメッセージを監視
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        // 追加されたノード自体が #message の場合と、その子孫に #message がある場合の両方を考慮
        const msgEl = node.matches(MSG_TEXT_SELECTOR)
          ? node
          : node.querySelector(MSG_TEXT_SELECTOR);
        if (msgEl) processMessage(msgEl, keywords);
      }
    }
  });

  observer.observe(itemsContainer, { childList: true });
}

function processMessage(el: Element, keywords: Set<string>): void {
  const text = el.textContent ?? '';
  if (!text.trim()) return;
  if (matchesKeyword(text, keywords)) {
    filterMessageElement(el);
  }
}
