/**
 * Stage 1 モジュール（ブラウザ内で完結する高速フィルタ層）。
 *
 * 公開API:
 * - {@link runStage1} — 高水準エントリ。`Message` + `JudgmentContext` から filter/pass/gray を返す
 * - 下層の純粋関数群（`matchesKeyword`, `matchesCustomNGWord` 等）も
 *   再エクスポートし、リグレッションテスト・Chrome拡張の filter-orchestrator 等から利用可能にする
 *
 * 設計原則:
 * - DOM / chrome.* には依存しない（純粋関数）
 * - 既存 `apps/chrome-ext/src/content/filter.ts` の挙動と完全互換
 */

import type { Message, JudgmentContext } from '../types.js';
import type { FilterMode, GameProgress } from './keyword-matcher.js';
import { buildKeywordSet, buildDescriptionPhraseSet, matchesKeyword } from './keyword-matcher.js';
import { matchCustomBlocklist } from './custom-blocklist.js';

/**
 * Stage 1 判定結果。
 *
 * - `filter`: Stage 1 で確定的にブロック対象と判定（Stage 2 を通さない）
 * - `pass`: Stage 1 で確定的に安全と判定（Stage 2 を通さない）
 * - `gray`: Stage 1 では判断できず、Stage 2 に委ねる
 */
export type Stage1Result =
  | { outcome: 'filter'; reason: 'custom_blocklist' | 'keyword_match'; label: 'spoiler' }
  | { outcome: 'pass'; reason: 'obviously_safe' }
  | { outcome: 'gray'; reason: 'needs_stage2' };

/**
 * `FilterSettings.categories.spoiler.strength` (`'loose' | 'standard' | 'strict'`) を
 * 既存 KB マッチが期待する {@link FilterMode} (`'strict' | 'standard' | 'lenient' | 'off'`) に変換する。
 */
function strengthToFilterMode(
  strength: 'loose' | 'standard' | 'strict',
  enabled: boolean,
): FilterMode {
  if (!enabled) return 'off';
  if (strength === 'loose') return 'lenient';
  return strength;
}

/**
 * v2 の {@link import('@fresh-chat-keeper/shared').GameContext} を、KB マッチが期待する
 * 既存形 {@link GameProgress} に変換する。`progressType === 'none'` のときは未指定扱い。
 */
function toGameProgress(
  game: JudgmentContext['game'],
): GameProgress | undefined {
  if (!game || game.progressType === 'none') return undefined;
  return {
    progressModel: game.progressType,
    currentChapterId: game.currentChapter,
    completedEventIds: game.completedEvents,
  };
}

/**
 * `草`/`www`/`88888` 等の短い定型リアクションを「明らかに安全」と判定する。
 * filter.ts には対応する処理がないが、設計書（phase-2-engine-split.md §Stage 1の移植）に
 * 明記されているため新規導入する。これは Stage 1 で `pass` を返す唯一の経路。
 *
 * 既存 filter.ts との挙動差:
 * - 旧（filter.ts）: 同じ入力で `matchesKeyword` 等が null → Stage 2 へ送られて LLM 判定（コスト発生）
 * - 新（runStage1）: outcome:'pass' を返して Stage 2 をスキップ（コスト削減）
 * この差分は意図的な最適化であり、parity test の対象外（直接の単体テストは
 * `tests/stage1/obviously-safe.test.ts` でカバー）。
 *
 * ★ 仕様確認の余地（Phase 3 以降の引き継ぎ事項）:
 * - `length <= 2` ルールは「2文字以下なら無条件 safe」という強い前提。
 *   例: `犯人`(2文字)、`死ね`(2文字、Phase 3 で harassment 対象)が KB 未登録時に
 *   Stage 2 をスキップする。Phase 2 では spoiler のみが関心なので問題は表面化しないが、
 *   Phase 3 でマルチラベル化する際に本ルールを見直す可能性あり。
 * - `/^[w草ｗ]{1,10}$/` の上限 10 は経験則。11 文字以上の `wwwwwwwwwww` は
 *   gray 扱い（Stage 2 へ）になるが、実害は小さい（Stage 2 でも safe 判定される）。
 */
export function isObviouslySafe(text: string): boolean {
  const normalized = text.trim();
  if (/^[w草ｗ]{1,10}$/.test(normalized)) return true;
  if (/^[8８]{3,}$/.test(normalized)) return true;
  if (normalized.length <= 2) return true;
  return false;
}

/**
 * Stage 1 の高水準エントリポイント。
 *
 * 評価順:
 * 1. カスタムNGワード（FilterSettings.customBlockWords）→ filter
 * 2. 知識ベースのキーワード/フレーズマッチ（GameContext がある場合のみ）→ filter
 * 3. 明らかに安全（短い定型リアクション）→ pass
 * 4. それ以外 → gray（Stage 2 に委ねる）
 *
 * @param message 判定対象メッセージ
 * @param context 判定コンテキスト（ユーザー設定 + ゲーム情報）
 */
export function runStage1(message: Message, context: JudgmentContext): Stage1Result {
  const { settings } = context;

  // 1. カスタムNGワード
  const customHit = matchCustomBlocklist(message.text, settings.customBlockWords);
  if (customHit !== null) {
    return { outcome: 'filter', reason: 'custom_blocklist', label: 'spoiler' };
  }

  // 2. 知識ベースのキーワードマッチ（gameId が設定されている場合のみ）
  if (context.game?.gameId) {
    const filterMode = strengthToFilterMode(
      settings.categories.spoiler.strength,
      settings.categories.spoiler.enabled,
    );
    if (filterMode !== 'off') {
      const progress = toGameProgress(context.game);
      const keywords = buildKeywordSet(context.game.gameId, filterMode, progress);
      const descPhrases = buildDescriptionPhraseSet(context.game.gameId);
      const kwHit = matchesKeyword(message.text, keywords, descPhrases);
      if (kwHit !== null) {
        return { outcome: 'filter', reason: 'keyword_match', label: 'spoiler' };
      }
    }
  }

  // 3. 明らかに安全
  if (isObviouslySafe(message.text)) {
    return { outcome: 'pass', reason: 'obviously_safe' };
  }

  // 4. グレーゾーン → Stage 2
  return { outcome: 'gray', reason: 'needs_stage2' };
}

// ─── 下層関数の再エクスポート（Chrome拡張・テスト用）───────────────────────
export type { FilterMode, GameProgress, MatchReason, MatchResult } from './keyword-matcher.js';
export type { CustomNGWord } from './custom-blocklist.js';
export {
  buildKeywordSet,
  buildDescriptionPhraseSet,
  matchesKeyword,
  matchesKeywordForStage2,
} from './keyword-matcher.js';
export { matchesCustomNGWord, matchCustomBlocklist } from './custom-blocklist.js';
export {
  buildActiveGenreTemplates,
  matchesGenreTemplate,
  matchesGameplayHintForStage2,
  matchesGenreKeywordForStage2,
} from './genre-template.js';
