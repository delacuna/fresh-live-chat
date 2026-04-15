/**
 * Stage 2 LLM 判定 — proxy クライアント
 *
 * - Stage 1 でフィルタされなかったが、ゲームキーワードを含むコメントを候補として受け取る
 * - apps/proxy の /api/judge エンドポイントに送信し、LLM 判定結果を取得する
 * - 判定結果は chrome.storage にキャッシュし、同じ動画の再視聴時はプロキシへの送信をスキップする
 */

import type { Settings, GameProgress, FilterMode } from '../shared/settings.js';

// ─── 型定義 ────────────────────────────────────────────────────────────────────

export type Stage2Verdict = 'block' | 'allow';

/** proxy の LLM が返す spoiler_category 値 */
export type LLMSpoilerCategory = 'direct_spoiler' | 'foreshadowing_hint' | 'gameplay_hint' | 'safe';

const LLM_CATEGORY_SET = new Set<string>(['direct_spoiler', 'foreshadowing_hint', 'gameplay_hint', 'safe']);

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
  /** コメント本文（キャッシュキーにも使用） */
  text: string;
  /** DOM 要素への弱参照（要素が削除された場合は deref() が undefined になる） */
  el: WeakRef<Element>;
  /** chrome.storage キャッシュキー */
  cacheKey: string;
  /** マッチしたゲームキーワード（フィルタ時のメタデータ用） */
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
    case 'direct_spoiler':      return 'block';
    case 'foreshadowing_hint':  return filterMode === 'lenient' ? 'allow' : 'block';
    case 'gameplay_hint':       return filterMode === 'strict'  ? 'block' : 'allow';
    case 'safe':                return 'allow';
  }
}

// ─── キャッシュ ────────────────────────────────────────────────────────────────

export const JUDGE_CACHE_KEY = 'spoilershield_judge_cache';

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
export async function saveJudgeCacheEntry(cacheKey: string, entry: JudgeCacheEntry): Promise<void> {
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

// ─── プロキシ送信 ─────────────────────────────────────────────────────────────

/**
 * バッチ（最大5件）をプロキシに送信し、結果を onResult コールバックで返す。
 *
 * - ネットワークエラー・プロキシ停止時はコールバックを呼ばずに終了する
 *   （Stage 1 を通過した候補なので、フィルタしない方が安全）
 * - LLM 判定失敗時の verdict は verdictFromCache が filterMode に応じて決定する
 */
/**
 * @returns プロキシへの HTTP リクエストが成功した場合 true、失敗した場合 false。
 *          呼び出し元はこの戻り値に応じて利用量カウントをインクリメントする。
 */
export async function sendStage2Batch(
  batch: Stage2Candidate[],
  settings: Settings,
  token: string,
  onResult: OnStage2Result,
  videoTitle?: string,
): Promise<boolean> {
  // 'none'/'other' は KB なしの特殊値。プロキシには null で送りゲームID文字列として扱わせない
  const isKBGame = settings.gameId !== 'none' && settings.gameId !== 'other';
  const effectiveGameId = isKBGame ? settings.gameId : null;
  const progress = isKBGame ? settings.progressByGame[settings.gameId] : undefined;

  const body = {
    messages: batch.map((c, i) => ({ id: String(i), text: c.text })),
    gameId: effectiveGameId,
    progress: effectiveGameId ? buildProxyProgress(settings.gameId, progress) : null,
    filterMode: settings.filterMode,
    selectedGenreTemplates: settings.selectedGenreTemplates ?? [],
    videoTitle: videoTitle || undefined,
  };

  try {
    const res = await fetch(`${settings.proxyUrl}/api/judge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-spoilershield-token': token,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`[SpoilerShield] Stage 2エラー: HTTP ${res.status}`);
      return false;
    }

    const data = await res.json() as {
      results: Array<{ messageId: string; verdict: string; spoilerCategory?: string; confidence?: number }>;
    };

    for (const result of data.results) {
      const idx = parseInt(result.messageId, 10);
      const candidate = batch[idx];
      if (!candidate) continue;

      const spoilerCategory: LLMSpoilerCategory | null =
        result.spoilerCategory != null && LLM_CATEGORY_SET.has(result.spoilerCategory)
          ? (result.spoilerCategory as LLMSpoilerCategory)
          : null;

      const entry: JudgeCacheEntry = {
        spoilerCategory,
        confidence: result.confidence,
      };

      const verdict = verdictFromCache(entry, settings.filterMode);
      await saveJudgeCacheEntry(candidate.cacheKey, entry);
      onResult(candidate, entry);
    }

    return true;
  } catch (err) {
    console.error(`[SpoilerShield] Stage 2エラー: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

function buildProxyProgress(gameId: string, progress: GameProgress | undefined) {
  return {
    gameId,
    progressModel: progress?.progressModel ?? 'chapter',
    currentChapterId: progress?.currentChapterId,
    completedEventIds: progress?.completedEventIds,
  };
}
