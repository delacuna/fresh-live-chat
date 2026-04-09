/**
 * Stage 1 フィルタ: キーワードマッチ（ブラウザ内で完結）
 *
 * 知識ベース JSON からキーワードを読み込み、チャットメッセージに対して
 * キーワードが含まれるかを判定する。
 *
 * MVP 仕様:
 * - ユーザーの進行状況設定はまだ未実装のため、全キーワードをブロック対象とする
 * - 判定が曖昧な場合はブロック側に倒す（CLAUDE.md: 安全側に倒す）
 */

import type { KBGame } from '@spoilershield/knowledge-base';
import aceAttorney1 from '@kb-data/ace-attorney-1.json';

// ビルド時にバンドルされるゲームデータ
// 将来: chrome.storage からユーザーが選択したゲームIDを読み込む
const ACTIVE_GAMES: KBGame[] = [aceAttorney1 as unknown as KBGame];

/**
 * 全アクティブゲームのキーワードを1つの Set に集約する。
 */
export function buildKeywordSet(): Set<string> {
  const keywords = new Set<string>();

  for (const game of ACTIVE_GAMES) {
    for (const entity of game.spoiler_entities) {
      for (const kw of entity.keywords) {
        keywords.add(kw);
      }
    }
    for (const entity of game.global_spoilers) {
      for (const kw of entity.keywords) {
        keywords.add(kw);
      }
    }
  }

  return keywords;
}

/**
 * テキストがキーワードセットにマッチするか判定する。
 * 大文字小文字を区別しない。
 */
export function matchesKeyword(text: string, keywords: Set<string>): boolean {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) return true;
  }
  return false;
}
