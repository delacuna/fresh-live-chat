/**
 * ゲームの進行管理モデル
 * チャプターベース: 長編RPG等、明確な章区切りがあるゲーム
 * イベントベース: 短編・インディーズ等、フラグ管理が主体のゲーム
 */
export type ProgressModel = "chapter" | "event";

export interface Game {
  id: string;
  title: string;
  titleAliases?: string[];  // 略称・別表記
  progressModel: ProgressModel;
  chapters?: Chapter[];     // chapterモデル時のみ
  events?: GameEvent[];     // eventモデル時のみ
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  description?: string;
}

export interface GameEvent {
  id: string;
  title: string;
  description?: string;
  /** このイベントより前のコメントに適用するネタバレエンティティのIDリスト */
  spoilerEntityIds: string[];
}

export interface SpoilerEntity {
  id: string;
  gameId: string;
  /** ネタバレが解禁されるチャプターID（chapterモデル） */
  unlockedAfterChapter?: string;
  /** ネタバレが解禁されるイベントID（eventモデル） */
  unlockedAfterEvent?: string;
  /** キーワード（Stage 1 フィルタ用） */
  keywords: string[];
  /** カテゴリ */
  category: SpoilerCategory;
  description?: string;
}

export type SpoilerCategory =
  | "character_death"   // キャラクターの死
  | "plot_twist"        // どんでん返し
  | "boss_encounter"    // ボス・エネミー出現
  | "item_location"     // アイテム・場所の開示
  | "ending"            // エンディング
  | "foreshadowing"     // 伏線・匂わせ
  | "gameplay_hint"     // 攻略ヒント
  | "other";
