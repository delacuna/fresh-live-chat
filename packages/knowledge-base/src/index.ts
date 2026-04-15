export type { KBGame, KBChapter, KBSpoilerEntity, ProgressType, SpoilerCategory, SpoilerLevel, GenreTemplate } from "./types.js";
export { getAllGenreTemplates, ALL_GENRE_TEMPLATES } from "./genre-templates.js";

/**
 * 知識ベースJSONをインポートし、IDでアクセスするためのレジストリ
 * MVP: JSONファイルをメモリにロード（DB不要）
 */
import aceAttorney1 from "../data/ace-attorney-1.json" assert { type: "json" };
import type { KBGame } from "./types.js";

const registry: Record<string, KBGame> = {
  "ace-attorney-1": aceAttorney1 as KBGame,
};

export function getGame(id: string): KBGame | undefined {
  return registry[id];
}

export function listGames(): KBGame[] {
  return Object.values(registry);
}
