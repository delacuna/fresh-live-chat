/**
 * カスタムNGワードによる Stage 1 ブロック判定。
 *
 * 2系統のAPIを公開:
 * - {@link matchesCustomNGWord} — chrome-ext 互換（id/word/enabled の構造体配列）
 * - {@link matchCustomBlocklist} — FilterSettings v2 互換（プレーンな string[]）
 *
 * いずれも内部で同一のマッチロジックを使用（カナ正規化後の部分一致）。
 */

import { normalizeKana } from '@fresh-chat-keeper/shared';

/**
 * 既存 chrome-ext 互換のカスタム NG ワード型。
 * `enabled: false` のエントリは無視される。
 */
export interface CustomNGWord {
  id: string;
  word: string;
  enabled: boolean;
}

/**
 * `CustomNGWord[]` に対する Stage 1 マッチ。
 *
 * @returns マッチしたワード、またはマッチなしの場合は null
 */
export function matchesCustomNGWord(text: string, words: CustomNGWord[]): string | null {
  if (words.length === 0) return null;
  const normalized = normalizeKana(text);
  for (const entry of words) {
    if (!entry.enabled) continue;
    if (normalized.includes(normalizeKana(entry.word))) return entry.word;
  }
  return null;
}

/**
 * FilterSettings v2 の `customBlockWords: string[]` に対する Stage 1 マッチ。
 *
 * @returns マッチしたワード、またはマッチなしの場合は null
 */
export function matchCustomBlocklist(text: string, blockWords: string[]): string | null {
  if (blockWords.length === 0) return null;
  const normalized = normalizeKana(text);
  for (const word of blockWords) {
    if (normalized.includes(normalizeKana(word))) return word;
  }
  return null;
}
