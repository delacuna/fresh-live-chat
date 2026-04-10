/**
 * Stage 1 フィルタ: キーワードマッチ（ブラウザ内で完結）
 *
 * 設定（filterMode・progress）に基づいてブロック対象のキーワードセットを構築する。
 * - filterMode: spoiler_level でブロック対象を絞り込む
 * - progress: 現在の進行状況より後のネタバレのみブロック（解禁済みはスルー）
 * - 進行状況未設定の場合は安全側に倒して全キーワードをブロック対象とする
 */

import type { KBGame } from '@spoilershield/knowledge-base';
import aceAttorney1 from '@kb-data/ace-attorney-1.json';
import { getBlockedLevels, type FilterMode, type GameProgress } from '../shared/settings.js';
import { matchesSpoilerContext } from '@spoilershield/shared';

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

  // 現在のチャプターのインデックス（未設定なら -1 → 全てブロック）
  const currentChapterIdx =
    progress?.currentChapterId
      ? chapters.findIndex((c) => c.id === progress.currentChapterId)
      : -1;

  const shouldBlock = (entity: {
    keywords: string[];
    spoiler_level?: string;
    unlocked_after_chapter?: string;
  }): boolean => {
    // spoiler_level がブロック対象かチェック
    if (entity.spoiler_level && !blockedLevels.includes(entity.spoiler_level)) return false;

    // チャプターモデル: 進行状況が設定されている場合は解禁済みはスキップ
    if (progress?.progressModel === 'chapter' && entity.unlocked_after_chapter && currentChapterIdx !== -1) {
      const unlockedIdx = chapters.findIndex((c) => c.id === entity.unlocked_after_chapter);
      // ユーザーが既にそのチャプターを超えていれば解禁済み → ブロック不要
      if (unlockedIdx !== -1 && currentChapterIdx > unlockedIdx) return false;
    }

    return true;
  };

  for (const entity of [...game.spoiler_entities, ...game.global_spoilers]) {
    if (shouldBlock(entity)) {
      for (const kw of entity.keywords) keywords.add(kw);
    }
  }

  return keywords;
}

export interface MatchResult {
  keyword: string;
  contextPattern: string;
}

/**
 * キーワード AND ネタバレ文脈表現の両方がテキストに含まれる場合のみフィルタ対象とする。
 * どちらか片方のみのヒットはスルー（誤検出削減）。
 * @returns 両方マッチした場合は { keyword, contextPattern }、それ以外は null
 */
export function matchesKeyword(text: string, keywords: Set<string>): MatchResult | null {
  const contextPattern = matchesSpoilerContext(text);
  if (contextPattern === null) return null;

  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      return { keyword: kw, contextPattern };
    }
  }
  return null;
}
