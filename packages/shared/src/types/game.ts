/**
 * ゲームの進行管理モデル
 * チャプターベース: 長編RPG等、明確な章区切りがあるゲーム
 * イベントベース: 短編・インディーズ等、フラグ管理が主体のゲーム
 */
export type ProgressModel = "chapter" | "event";

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
  /** エンティティ名（人名・アイテム名等） */
  name?: string;
  /** 別名・英語表記・略称 */
  aliases?: string[];
  /** ネタバレが解禁されるチャプターID（chapterモデル） */
  unlockedAfterChapter?: string;
  /** ネタバレが解禁されるイベントID（eventモデル） */
  unlockedAfterEvent?: string;
  /** キーワード（Stage 1 フィルタ用） */
  keywords: string[];
  /** カテゴリ */
  category: SpoilerCategory;
  /** LLMへの判定ヒント: どのレベルのネタバレか */
  spoilerLevel?: SpoilerLevel;
  description?: string;
}

/** Stage 2 LLM 判定カテゴリと連動するネタバレレベル */
export type SpoilerLevel = "direct_spoiler" | "foreshadowing_hint" | "gameplay_hint";

export interface Game {
  id: string;
  title: string;
  titleAliases?: string[];
  progressModel: ProgressModel;
  chapters?: Chapter[];
  events?: GameEvent[];
  spoilerEntities: SpoilerEntity[];
  /** 話をまたぐ伏線・全体ストーリーに関わるネタバレ */
  globalSpoilers?: SpoilerEntity[];
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
