/**
 * テキスト正規化ユーティリティ。
 *
 * キャッシュキー構築等で「見た目は違うが意味的に同じ」テキストを同一視するための正規化を行う。
 * カナ正規化（ひらがな↔カタカナ、全角↔半角）は `@fresh-chat-keeper/shared` の
 * `normalizeKana` に委譲する。
 */

import { normalizeKana } from '@fresh-chat-keeper/shared';

/**
 * キャッシュキー用の正規化:
 * 1. 前後の空白を削除
 * 2. 連続する空白を1つに圧縮
 * 3. 英字を小文字化
 * 4. 全角・カナの正規化（normalizeKana）
 */
export function normalizeText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalizeKana(trimmed);
}
