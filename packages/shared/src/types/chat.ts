/**
 * チャットメッセージ（YouTube チャットリプレイ / ライブチャット共通）
 */
export interface ChatMessage {
  id: string;
  videoId: string;
  authorId: string;
  authorName: string;
  text: string;
  /** アーカイブモード: 動画内のオフセット（ミリ秒） */
  videoOffsetMs?: number;
  /** ライブモード: 投稿タイムスタンプ（Unix ms） */
  timestampMs?: number;
  /** スーパーチャット等の強調メッセージかどうか */
  isHighlighted?: boolean;
}

/**
 * フィルタ判定結果
 */
export interface FilterResult {
  messageId: string;
  verdict: FilterVerdict;
  /** Stage 1 でマッチしたキーワード */
  matchedKeywords?: string[];
  /** Stage 2 LLM が判定したカテゴリ */
  spoilerCategory?: "direct_spoiler" | "foreshadowing_hint" | "gameplay_hint" | "safe";
  /** 信頼スコア（0–1） */
  confidence?: number;
  /** 処理ステージ（1 = キーワード/ベクトル, 2 = LLM） */
  stage: 1 | 2;
}

export type FilterVerdict = "block" | "allow" | "uncertain";

/**
 * フィルタモード（ユーザー設定）
 */
export type FilterMode = "strict" | "standard" | "lenient" | "off";

/**
 * ユーザーのゲーム進行状況
 */
export interface UserProgress {
  gameId: string;
  progressModel: "chapter" | "event";
  /** チャプターモード: 現在のチャプターID */
  currentChapterId?: string;
  /** イベントモード: 完了済みイベントIDのセット */
  completedEventIds?: string[];
}
