/**
 * ジャンルテンプレートによる Stage 1 / Stage 2 候補マッチ。
 *
 * 既存 `apps/chrome-ext/src/content/filter.ts` のロジックを移植。
 * オリジナルとの差分なし（カナ正規化後の部分一致を `@fresh-chat-keeper/knowledge-base`
 * のテンプレート定義に対して行うだけ）。
 *
 * 公開関数:
 * - {@link buildActiveGenreTemplates}
 * - {@link matchesGenreTemplate} — Stage 1 ブロック対象判定
 * - {@link matchesGameplayHintForStage2} — Stage 2 候補（攻略ヒント）
 * - {@link matchesGenreKeywordForStage2} — Stage 2 候補（KBなしモード）
 */

import type { GenreTemplate } from '@fresh-chat-keeper/knowledge-base';
import { getAllGenreTemplates } from '@fresh-chat-keeper/knowledge-base';
import { matchesSpoilerVerb, normalizeKana } from '@fresh-chat-keeper/shared';

/** 有効化されているジャンルテンプレートIDから GenreTemplate[] を構築する */
export function buildActiveGenreTemplates(selectedIds: string[]): GenreTemplate[] {
  if (selectedIds.length === 0) return [];
  const all = getAllGenreTemplates();
  return all.filter((t) => selectedIds.includes(t.id));
}

/**
 * Stage 1 のジャンルテンプレートマッチ。
 *
 * マッチ条件:
 * 1. テンプレートの context_phrases に部分一致（単体でネタバレを示す表現）
 * 2. テンプレートの keywords に部分一致 かつ SPOILER_VERBS にも一致
 *
 * @returns マッチした phrase または keyword、マッチなしは null
 */
export function matchesGenreTemplate(text: string, templates: GenreTemplate[]): string | null {
  if (templates.length === 0) return null;
  const normalized = normalizeKana(text);

  for (const template of templates) {
    for (const phrase of template.context_phrases) {
      if (normalized.includes(normalizeKana(phrase))) {
        return phrase;
      }
    }
    const verb = matchesSpoilerVerb(text);
    if (verb !== null) {
      for (const kw of template.keywords) {
        if (normalized.includes(normalizeKana(kw))) {
          return kw;
        }
      }
    }
  }
  return null;
}

/**
 * 指示・攻略ヒント系フレーズの Stage 2 候補判定。
 * `template.stage2_phrases` に部分マッチした場合、即時フィルタせず Stage 2 に委ねる。
 *
 * @returns マッチしたフレーズ、またはマッチなしは null
 */
export function matchesGameplayHintForStage2(
  text: string,
  templates: GenreTemplate[],
): string | null {
  if (templates.length === 0) return null;
  const normalized = normalizeKana(text);
  for (const template of templates) {
    if (!template.stage2_phrases?.length) continue;
    for (const phrase of template.stage2_phrases) {
      if (normalized.includes(normalizeKana(phrase))) {
        return phrase;
      }
    }
  }
  return null;
}

/**
 * ジャンルテンプレートの Stage 2 候補判定（KBなしモード用）。
 * Stage 1 でフィルタされなかったコメントのうち、ジャンルキーワードに部分マッチしたものを返す。
 * `gameId === 'other'` 等、ゲームKBなしの場合に使用する。
 *
 * @returns マッチしたキーワード、またはマッチなしは null
 */
export function matchesGenreKeywordForStage2(
  text: string,
  templates: GenreTemplate[],
): string | null {
  if (templates.length === 0) return null;
  const normalized = normalizeKana(text);
  for (const template of templates) {
    for (const kw of template.keywords) {
      if (normalized.includes(normalizeKana(kw))) {
        return kw;
      }
    }
  }
  return null;
}
