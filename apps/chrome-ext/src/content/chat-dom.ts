/**
 * YouTube チャットリプレイの DOM 操作ユーティリティ
 *
 * 重要: display:none は Flow Chat 等の他拡張に効かないため使用しない。
 * テキスト書き換え方式を採用し、元テキストは data 属性に退避する。
 */

const ATTR_ORIGINAL = 'data-spoilershield-original';
const ATTR_FILTERED = 'data-spoilershield-filtered';
const PLACEHOLDER = '⚠ ネタバレの可能性があるためフィルタされました（クリックで表示）';

/**
 * メッセージ要素がキーワードにマッチした場合にフィルタする。
 * すでにフィルタ済みの場合は何もしない。
 */
export function filterMessageElement(el: Element): void {
  if (el.getAttribute(ATTR_FILTERED) === 'true') return;

  const originalText = el.textContent ?? '';
  if (!originalText.trim()) return;

  el.setAttribute(ATTR_ORIGINAL, originalText);
  el.setAttribute(ATTR_FILTERED, 'true');
  el.textContent = PLACEHOLDER;

  (el as HTMLElement).style.cursor = 'pointer';
  (el as HTMLElement).style.opacity = '0.55';

  el.addEventListener('click', handleRevealClick, { once: true });
}

/**
 * クリックで元のテキストを復元する。
 */
function handleRevealClick(e: Event): void {
  const el = e.currentTarget as Element;
  const original = el.getAttribute(ATTR_ORIGINAL);
  if (original === null) return;

  el.textContent = original;
  el.removeAttribute(ATTR_FILTERED);
  el.removeAttribute(ATTR_ORIGINAL);
  (el as HTMLElement).style.cursor = '';
  (el as HTMLElement).style.opacity = '';
}

/**
 * フィルタ済み要素を元に戻す（手動復元用）。
 */
export function restoreMessageElement(el: Element): void {
  const original = el.getAttribute(ATTR_ORIGINAL);
  if (original === null) return;

  el.textContent = original;
  el.removeAttribute(ATTR_FILTERED);
  el.removeAttribute(ATTR_ORIGINAL);
  (el as HTMLElement).style.cursor = '';
  (el as HTMLElement).style.opacity = '';
}
