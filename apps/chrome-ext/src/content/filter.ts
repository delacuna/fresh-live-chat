/**
 * Stage 1 フィルタ: キーワードマッチ（ブラウザ内で完結）
 *
 * 方針: 誤検出を最小限にするため「明らかに安全なコメントを通過させる粗フィルタ」として機能する。
 * 判断が難しいコメントは Stage 2（LLM）に委ねる前提でパスさせる。
 *
 * フィルタ対象とするパターン（この3つのみ）:
 *   1. 「ネタバレ」という単語を含む
 *   2. 知識ベースの description から抽出した固有フレーズ（英数字含む事件名等）が含まれる
 *   3. ゲームキーワード + 明確なネタバレ動詞（死んだ・殺した・裏切った等）の組み合わせ
 *
 * - filterMode: spoiler_level でブロック対象を絞り込む
 * - progress: 現在の進行状況より後のネタバレのみブロック（解禁済みはスルー）
 * - 進行状況未設定の場合は安全側に倒して全キーワードをブロック対象とする
 */

import type { KBGame, GenreTemplate } from '@spoilershield/knowledge-base';
import { getAllGenreTemplates } from '@spoilershield/knowledge-base';
import aceAttorney1 from '@kb-data/ace-attorney-1.json';
import { getBlockedLevels, type FilterMode, type GameProgress, type CustomNGWord } from '../shared/settings.js';
import { matchesSpoilerVerb, normalizeKana } from '@spoilershield/shared';

const ALL_GAMES: KBGame[] = [aceAttorney1 as unknown as KBGame];

export function buildKeywordSet(
  gameId: string,
  filterMode: FilterMode,
  progress?: GameProgress,
): Set<string> {
  const game = ALL_GAMES.find((g) => g.id === gameId);
  if (!game) return new Set();

  const blockedLevels = getBlockedLevels(filterMode);
  const keywords = new Set<string>();
  const chapters = game.chapters ?? [];

  const currentChapterIdx =
    progress?.currentChapterId
      ? chapters.findIndex((c) => c.id === progress.currentChapterId)
      : -1;

  const shouldBlock = (entity: {
    keywords: string[];
    spoiler_level?: string;
    unlocked_after_chapter?: string;
  }): boolean => {
    if (entity.spoiler_level && !blockedLevels.includes(entity.spoiler_level)) return false;

    if (progress?.progressModel === 'chapter' && entity.unlocked_after_chapter && currentChapterIdx !== -1) {
      const unlockedIdx = chapters.findIndex((c) => c.id === entity.unlocked_after_chapter);
      if (unlockedIdx !== -1 && currentChapterIdx > unlockedIdx) return false;
    }

    return true;
  };

  for (const entity of [...game.spoiler_entities, ...(game.global_spoilers ?? [])]) {
    if (shouldBlock(entity)) {
      for (const kw of entity.keywords) keywords.add(kw);
    }
  }

  return keywords;
}

/**
 * 知識ベースの description から固有フレーズを抽出する。
 * 「」で括られた文字列のうち、英数字を含むもの（事件コード等）のみ対象とする。
 * 例: "DL-6号事件"、"SL-9号事件"
 * ゲームタイトル名等の一般的な固有名詞は対象外（誤検出防止）。
 */
export function buildDescriptionPhraseSet(gameId: string): Set<string> {
  const game = ALL_GAMES.find((g) => g.id === gameId);
  if (!game) return new Set();

  const phrases = new Set<string>();
  const QUOTED_RE = /「([^」]+)」/g;
  const HAS_ALPHANUMERIC_RE = /[\d\w]/;

  const extractFromText = (text: string | undefined) => {
    if (!text) return;
    for (const match of text.matchAll(QUOTED_RE)) {
      const phrase = match[1];
      if (HAS_ALPHANUMERIC_RE.test(phrase)) {
        phrases.add(phrase);
      }
    }
  };

  for (const chapter of game.chapters ?? []) {
    extractFromText(chapter.description);
  }
  for (const entity of [...game.spoiler_entities, ...(game.global_spoilers ?? [])]) {
    extractFromText(entity.description);
  }

  return phrases;
}

// ─── マッチ結果 ──────────────────────────────────────────────────────────────

export type MatchReason = 'spoiler_word' | 'description_phrase' | 'keyword_with_verb';

export interface MatchResult {
  reason: MatchReason;
  /** パターン3: マッチしたゲームキーワード */
  keyword?: string;
  /** パターン3: マッチしたネタバレ動詞 */
  verb?: string;
  /** パターン2: マッチした固有フレーズ */
  phrase?: string;
}

/**
 * Stage 1 フィルタ判定。3パターンのいずれかにマッチした場合にフィルタ対象とする。
 *
 * @param text       コメント本文
 * @param keywords   buildKeywordSet() が返すゲームキーワードセット
 * @param descriptionPhrases buildDescriptionPhraseSet() が返す固有フレーズセット
 * @returns マッチした場合は MatchResult、マッチなしの場合は null
 */
export function matchesKeyword(
  text: string,
  keywords: Set<string>,
  descriptionPhrases: Set<string>,
): MatchResult | null {
  const normalized = normalizeKana(text);

  // パターン1: 「ネタバレ」という単語そのものを含む（カナ統一後に比較）
  if (normalized.includes('ネタバレ')) {
    return { reason: 'spoiler_word' };
  }

  // パターン2: 知識ベース description の固有フレーズに直接マッチ
  for (const phrase of descriptionPhrases) {
    if (normalized.includes(normalizeKana(phrase))) {
      return { reason: 'description_phrase', phrase };
    }
  }

  // パターン3: ゲームキーワード + 明確なネタバレ動詞の組み合わせ
  const verb = matchesSpoilerVerb(text);
  if (verb !== null) {
    for (const kw of keywords) {
      if (normalized.includes(normalizeKana(kw))) {
        return { reason: 'keyword_with_verb', keyword: kw, verb };
      }
    }
  }

  return null;
}

/**
 * カスタム NG ワードによる即時判定。
 * enabled なワードに部分一致した場合にそのワードを返す。
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
 * 有効なジャンルテンプレートIDリストから GenreTemplate[] を構築する。
 */
export function buildActiveGenreTemplates(selectedIds: string[]): GenreTemplate[] {
  if (selectedIds.length === 0) return [];
  const all = getAllGenreTemplates();
  return all.filter((t) => selectedIds.includes(t.id));
}

/**
 * ジャンルテンプレートによる即時判定。
 *
 * マッチ条件（いずれか）:
 *   1. テンプレートの context_phrases に部分一致（単体でネタバレを示す表現）
 *   2. テンプレートの keywords に部分一致 かつ SPOILER_VERBS にも一致
 *
 * @returns マッチした phrase または keyword、マッチなしは null
 */
export function matchesGenreTemplate(text: string, templates: GenreTemplate[]): string | null {
  if (templates.length === 0) return null;
  const normalized = normalizeKana(text);

  for (const template of templates) {
    // パターン1: 文脈表現の直接マッチ
    for (const phrase of template.context_phrases) {
      if (normalized.includes(normalizeKana(phrase))) {
        return phrase;
      }
    }
    // パターン2: キーワード + ネタバレ動詞の組み合わせ
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
 * template.stage2_phrases に部分マッチした場合、即時フィルタせず Stage 2 に委ねる。
 * gameId !== 'none' であれば全ゲームモードで使用する。
 *
 * @returns マッチしたフレーズ、またはマッチなしは null
 */
export function matchesGameplayHintForStage2(text: string, templates: GenreTemplate[]): string | null {
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
 * ジャンルテンプレートの Stage 2 候補判定。
 * Stage 1 でフィルタされなかったコメントのうち、ジャンルキーワードに部分マッチしたものを返す。
 * gameId === 'other'（ゲームKBなし）の場合のみ使用する。
 *
 * @returns マッチしたキーワード、またはマッチなしは null
 */
export function matchesGenreKeywordForStage2(text: string, templates: GenreTemplate[]): string | null {
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

/**
 * Stage 2 候補判定。
 * Stage 1 でフィルタされなかったコメントのうち、ゲームキーワードに部分マッチしたものを返す。
 * Stage 1 はキーワード + ネタバレ動詞 の組み合わせが必要だが、ここではキーワード単体でヒットさせる。
 *
 * 前提: Stage 1 が null を返した後にのみ呼び出すこと。
 * （ネタバレ単語・description フレーズはすでに Stage 1 で処理済み）
 *
 * @returns マッチしたキーワード、またはマッチなしの場合は null
 */
export function matchesKeywordForStage2(text: string, keywords: Set<string>): string | null {
  const normalized = normalizeKana(text);
  for (const kw of keywords) {
    if (normalized.includes(normalizeKana(kw))) {
      return kw;
    }
  }
  return null;
}
