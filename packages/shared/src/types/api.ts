import type { FilterResult, UserProgress } from "./chat.js";

/**
 * プロキシ → LLM 判定リクエスト
 */
export interface JudgeRequest {
  messages: Array<{
    id: string;
    text: string;
  }>;
  /** ゲームKB使用時に指定。ジャンルテンプレートのみの場合は省略可 */
  gameId?: string | null;
  /** ゲームKB使用時に指定。ジャンルテンプレートのみの場合は省略可 */
  progress?: UserProgress | null;
  /** フィルタモード */
  filterMode?: string;
  /** 有効化されているジャンルテンプレートのIDリスト */
  selectedGenreTemplates?: string[];
  /** YouTubeの動画タイトル（ゲーム自動推測に使用） */
  videoTitle?: string;
}

/**
 * プロキシ → LLM 判定レスポンス
 */
export interface JudgeResponse {
  results: FilterResult[];
}

/**
 * Result 型パターン
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
