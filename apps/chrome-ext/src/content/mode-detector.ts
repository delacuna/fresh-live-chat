export type PageMode = 'archive' | 'live' | 'none';

/**
 * 現在のページURL からモードを判定する。
 *
 * チャットリプレイは YouTube の iframe 内にあり、URL に live_chat_replay を含む。
 * ライブチャットは live_chat を含む（replay を含まない）。
 * それ以外（/watch 等のトップページ）は 'none'。
 */
export function detectMode(): PageMode {
  const href = window.location.href;
  if (href.includes('live_chat_replay')) return 'archive';
  if (href.includes('live_chat')) return 'live';
  return 'none';
}
