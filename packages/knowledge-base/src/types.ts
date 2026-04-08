/**
 * 知識ベースJSONファイルの構造定義
 * packages/shared の型を知識ベース用に具体化したもの（snake_case）
 */

export type ProgressType = "chapter" | "event";

export type SpoilerCategory =
  | "character_death"
  | "plot_twist"
  | "boss_encounter"
  | "item_location"
  | "ending"
  | "foreshadowing"
  | "gameplay_hint"
  | "other";

export type SpoilerLevel = "direct_spoiler" | "foreshadowing_hint" | "gameplay_hint";

export interface KBChapter {
  id: string;
  number: number;
  title: string;
  description: string;
}

export interface KBSpoilerEntity {
  id: string;
  name: string;
  aliases: string[];
  /** このネタバレが「解禁」されるチャプターID（そのチャプター終了後は表示してよい） */
  unlocked_after_chapter?: string;
  /** キーワード（Stage 1 フィルタ用、日本語・英語両方含める） */
  keywords: string[];
  category: SpoilerCategory;
  spoiler_level: SpoilerLevel;
  description: string;
}

export interface KBGame {
  id: string;
  title: string;
  title_aliases: string[];
  progress_type: ProgressType;
  chapters: KBChapter[];
  /** 各チャプターに紐づくネタバレエンティティ */
  spoiler_entities: KBSpoilerEntity[];
  /** 話をまたぐ伏線・作品全体に関わるネタバレ（最終章クリア後に解禁） */
  global_spoilers: KBSpoilerEntity[];
}
