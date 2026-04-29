/**
 * Stage 2 判定結果のキャッシュ（Chrome 拡張側実装）。
 *
 * 旧 `stage2.ts` のキャッシュ部分をそのまま継承。
 * judgment-engine の `JudgmentCache` / `CacheStorage` インターフェースは使わず、
 * **既存のキャッシュキー仕様（gameId + 進行状況 + テキスト）と保存キー
 * `fck_judge_cache` を維持**する。これにより v0.2.0 ユーザーの既存キャッシュが
 * 拡張更新後も再利用される。
 *
 * 設計判断（INTEG-01 時点）:
 * - judgment-engine の `JudgmentCache.buildKey` は `normalize + hash` で
 *   別キー体系のため、移行すると既存キャッシュが破棄される
 * - 互換性最優先のため、既存キー体系をそのまま維持し、judgment-engine 側の
 *   キャッシュ抽象は **chrome-ext からは利用しない**
 * - Phase 4 以降で動画別キャッシュ（`fck_cache:{video_id}`）に移行する場合は
 *   この時点で互換性を切る
 */

import type { GameProgress, FilterMode } from '../shared/settings.js';

/** proxy の LLM が返す spoiler_category 値 */
export type LLMSpoilerCategory = 'direct_spoiler' | 'foreshadowing_hint' | 'gameplay_hint' | 'safe';

const LLM_CATEGORY_SET = new Set<string>([
  'direct_spoiler',
  'foreshadowing_hint',
  'gameplay_hint',
  'safe',
]);

export type Stage2Verdict = 'block' | 'allow';

export interface JudgeCacheEntry {
  /**
   * LLM が判定したカテゴリ。
   * null は LLM 判定失敗（API エラー・JSON パース失敗）を表す。
   */
  spoilerCategory: LLMSpoilerCategory | null;
  confidence?: number;
}

/** Stage 2 判定待ちコメントの情報 */
export interface Stage2Candidate {
  text: string;
  el: WeakRef<Element>;
  cacheKey: string;
  matchedKeyword: string;
}

export type OnStage2Result = (candidate: Stage2Candidate, entry: JudgeCacheEntry) => void;

/**
 * キャッシュエントリと現在のフィルタモードから verdict を導出する。
 * フィルタモードを変更しても proxy に再リクエストせずに正しい判定が得られる。
 *
 * - spoilerCategory が null（LLM 判定失敗）の場合: lenient → allow、それ以外 → block
 */
export function verdictFromCache(entry: JudgeCacheEntry, filterMode: FilterMode): Stage2Verdict {
  const { spoilerCategory } = entry;
  if (spoilerCategory === null) {
    return filterMode === 'lenient' ? 'allow' : 'block';
  }
  switch (spoilerCategory) {
    case 'direct_spoiler':
      return 'block';
    case 'foreshadowing_hint':
      return filterMode === 'lenient' ? 'allow' : 'block';
    case 'gameplay_hint':
      return filterMode === 'strict' ? 'block' : 'allow';
    case 'safe':
      return 'allow';
  }
}

/**
 * proxy レスポンスの `spoilerCategory` 文字列を {@link LLMSpoilerCategory} へ
 * narrowing する。未知の値は null（LLM 判定失敗）扱い。
 */
export function parseSpoilerCategory(raw: string | undefined | null): LLMSpoilerCategory | null {
  if (raw == null) return null;
  return LLM_CATEGORY_SET.has(raw) ? (raw as LLMSpoilerCategory) : null;
}

// ─── キャッシュ ────────────────────────────────────────────────────────────────

export const JUDGE_CACHE_KEY = 'fck_judge_cache';

let _cache: Record<string, JudgeCacheEntry> = {};
let _cacheLoaded = false;

/** 起動時に一度だけ呼び出す。chrome.storage から判定キャッシュをメモリに読み込む。 */
export async function initStage2Cache(): Promise<void> {
  if (_cacheLoaded) return;
  const result = await chrome.storage.local.get(JUDGE_CACHE_KEY);
  _cache = (result[JUDGE_CACHE_KEY] as Record<string, JudgeCacheEntry> | undefined) ?? {};
  _cacheLoaded = true;
}

/** キャッシュから判定結果を同期的に取得する（initStage2Cache 呼び出し後に使用可能）。 */
export function getCachedVerdict(cacheKey: string): JudgeCacheEntry | null {
  return _cache[cacheKey] ?? null;
}

/** 判定結果をメモリキャッシュと chrome.storage の両方に保存する。 */
export async function saveJudgeCacheEntry(
  cacheKey: string,
  entry: JudgeCacheEntry,
): Promise<void> {
  _cache[cacheKey] = entry;
  await chrome.storage.local.set({ [JUDGE_CACHE_KEY]: _cache });
}

/**
 * キャッシュキーを生成する。
 * ゲームID + 進行状況 + テキストの組み合わせで一意にする。
 * 同じ動画を同じ進行状況で再視聴した場合にキャッシュが有効になる。
 */
export function buildStage2CacheKey(
  gameId: string,
  progress: GameProgress | undefined,
  text: string,
): string {
  let progressKey = 'none';
  if (progress?.progressModel === 'chapter') {
    progressKey = progress.currentChapterId ?? 'none';
  } else if (progress?.progressModel === 'event') {
    progressKey = [...(progress.completedEventIds ?? [])].sort().join(',') || 'none';
  }
  return `${gameId}|${progressKey}|${text}`;
}
