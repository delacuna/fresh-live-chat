/**
 * Stage 1 フィルタ用ネタバレ動詞リスト
 *
 * キーワードと組み合わせて使用する。
 * 「ゲームキーワード + ネタバレ動詞」の両方が含まれる場合のみフィルタ対象とする。
 *
 * 「実は」「真相」「犯人は」などは逆転裁判のような推理ゲームの配信では
 * 日常的に使われるため意図的に除外している。
 * これら曖昧なケースの判断は Stage 2（LLM）に委ねる。
 *
 * これは Stage 2（LLM）実装までの暫定措置。
 */

import { normalizeKana } from "./normalizeKana.js";

/** 明確なネタバレ動詞（事実として死亡・裏切りを断言する表現のみ） */
export const SPOILER_VERBS: string[] = [
  '死ぬ', '死んだ', '死亡', '殺される', '殺した', '殺す',
  '裏切る', '裏切り', '裏切った',
];

/** 正規化済み動詞リスト（マッチング用） */
const NORMALIZED_VERBS = SPOILER_VERBS.map(normalizeKana);

/**
 * テキスト中に明確なネタバレ動詞が含まれるか判定する。
 * ひらがな・カタカナ・半角カナの表記ゆれを吸収して比較する。
 * @returns マッチした動詞（元の表記）、なければ null
 */
export function matchesSpoilerVerb(text: string): string | null {
  const normalized = normalizeKana(text);
  for (let i = 0; i < NORMALIZED_VERBS.length; i++) {
    if (normalized.includes(NORMALIZED_VERBS[i])) return SPOILER_VERBS[i];
  }
  return null;
}
