/**
 * YouTube チャットリプレイの DOM 操作ユーティリティ
 *
 * 重要: display:none は Flow Chat 等の他拡張に効かないため、デフォルトはテキスト書き換え方式。
 * displayMode='hidden' の場合のみ行要素に display:none を設定する（Flow Chat との非互換あり）。
 */

import type { DisplayMode } from '../shared/settings.js';

const ATTR_ORIGINAL = 'data-spoilershield-original';
const ATTR_FILTERED = 'data-spoilershield-filtered';
const ATTR_HIDDEN_ROW = 'data-spoilershield-hidden-row';
const PLACEHOLDER = '⚠ ネタバレの可能性があるためフィルタされました（クリックで表示）';

/**
 * メッセージ要素をフィルタする。
 * - placeholder: テキストをプレースホルダーに書き換え、クリックで復元可能
 * - hidden: 行要素に display:none を設定（Flow Chat 等では効かない場合あり）
 */
export function filterMessageElement(
  el: Element,
  displayMode: DisplayMode,
  matchedKeyword?: string,
  matchedContext?: string,
  onReveal?: () => void,
): void {
  if (el.getAttribute(ATTR_FILTERED) === 'true') return;

  const originalText = el.textContent ?? '';
  if (!originalText.trim()) return;

  el.setAttribute(ATTR_FILTERED, 'true');
  if (matchedKeyword) {
    el.setAttribute('data-spoilershield-matched-keyword', matchedKeyword);
  }
  if (matchedContext) {
    el.setAttribute('data-spoilershield-matched-context', matchedContext);
  }

  if (displayMode === 'hidden') {
    // 行コンテナを非表示にする
    const row =
      el.closest('yt-live-chat-text-message-renderer') ??
      el.closest('yt-live-chat-paid-message-renderer') ??
      el.parentElement;
    if (row) {
      row.setAttribute(ATTR_HIDDEN_ROW, 'true');
      (row as HTMLElement).style.display = 'none';
    }
  } else {
    // placeholder モード: テキスト書き換え
    el.setAttribute(ATTR_ORIGINAL, originalText);
    el.textContent = PLACEHOLDER;
    (el as HTMLElement).style.cursor = 'pointer';
    (el as HTMLElement).style.opacity = '0.55';
    el.addEventListener('click', (e: Event) => {
      handleRevealClick(e);
      onReveal?.();
    }, { once: true });
  }
}

/**
 * クリックで元のテキストを復元する（placeholder モード用）。
 * ATTR_FILTERED は保持したまま ATTR_REVEALED を付与し、
 * 同一要素への再フィルタを防ぐ。
 */
function handleRevealClick(e: Event): void {
  const el = e.currentTarget as Element;
  const original = el.getAttribute(ATTR_ORIGINAL);
  if (original === null) return;

  el.textContent = original;
  el.removeAttribute(ATTR_ORIGINAL);
  el.setAttribute(ATTR_FILTERED, 'revealed'); // 'true' から変更して再フィルタをブロック
  (el as HTMLElement).style.cursor = '';
  (el as HTMLElement).style.opacity = '';
}

/**
 * フィルタ済み要素の表示方式を、復元→再フィルタなしで直接切り替える。
 * フラッシュを防ぐため、ユーザーに元テキストが見える瞬間を作らない。
 *
 * placeholder → hidden:
 *   ATTR_ORIGINAL に退避済みのオリジナルテキストを使って行を非表示にする。
 *   テキストをプレースホルダーから元に戻しつつ、行ごと display:none にする。
 *
 * hidden → placeholder:
 *   display:none を解除し、テキストをプレースホルダーに書き換える。
 */
export function switchDisplayMode(el: Element, nextMode: DisplayMode, onReveal?: () => void): void {
  if (el.getAttribute(ATTR_FILTERED) !== 'true') return;

  if (nextMode === 'hidden') {
    // placeholder → hidden
    const original = el.getAttribute(ATTR_ORIGINAL);
    if (original !== null) {
      // テキストを元に戻してから行を非表示にする（プレースホルダーテキストは行と一緒に隠す）
      el.textContent = original;
      el.removeAttribute(ATTR_ORIGINAL);
      (el as HTMLElement).style.cursor = '';
      (el as HTMLElement).style.opacity = '';
    }
    const row =
      el.closest('yt-live-chat-text-message-renderer') ??
      el.closest('yt-live-chat-paid-message-renderer') ??
      el.parentElement;
    if (row) {
      row.setAttribute(ATTR_HIDDEN_ROW, 'true');
      (row as HTMLElement).style.display = 'none';
    }
  } else {
    // hidden → placeholder
    // hidden モードでは ATTR_ORIGINAL がないため、現在の textContent がオリジナル
    const originalText = el.textContent ?? '';

    // 先にテキストをプレースホルダーに書き換えてから行を表示する。
    // 行を表示した瞬間にオリジナルテキストが見えることを防ぐ。
    el.setAttribute(ATTR_ORIGINAL, originalText);
    el.textContent = PLACEHOLDER;
    (el as HTMLElement).style.cursor = 'pointer';
    (el as HTMLElement).style.opacity = '0.55';
    el.addEventListener('click', (e: Event) => {
      handleRevealClick(e);
      onReveal?.();
    }, { once: true });

    const hiddenRow = el.closest(`[${ATTR_HIDDEN_ROW}]`);
    if (hiddenRow) {
      hiddenRow.removeAttribute(ATTR_HIDDEN_ROW);
      (hiddenRow as HTMLElement).style.display = '';
    }
  }
}

/**
 * フィルタ済み要素を元に戻す（設定変更時や手動復元に使用）。
 */
export function restoreMessageElement(el: Element): void {
  const filteredAttr = el.getAttribute(ATTR_FILTERED);
  if (filteredAttr !== 'true' && filteredAttr !== 'revealed') return;

  // hidden モード: 行コンテナの表示を戻す
  const hiddenRow = el.closest(`[${ATTR_HIDDEN_ROW}]`);
  if (hiddenRow) {
    hiddenRow.removeAttribute(ATTR_HIDDEN_ROW);
    (hiddenRow as HTMLElement).style.display = '';
  }

  // placeholder モード: テキストを復元
  const original = el.getAttribute(ATTR_ORIGINAL);
  if (original !== null) {
    el.textContent = original;
    el.removeAttribute(ATTR_ORIGINAL);
    (el as HTMLElement).style.cursor = '';
    (el as HTMLElement).style.opacity = '';
  }

  el.removeAttribute(ATTR_FILTERED);
}
