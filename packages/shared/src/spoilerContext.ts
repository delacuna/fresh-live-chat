/**
 * ネタバレ文脈表現リスト
 *
 * Stage 1 フィルタでキーワードと組み合わせて使用する。
 * キーワード単体ではフィルタせず、「キーワード + 文脈表現」の両方が
 * 含まれる場合のみフィルタすることで誤検出を減らす。
 *
 * これは Stage 2（LLM）実装までの暫定措置。
 * 将来的に Stage 2 が担う判断のうち、明らかなものだけここで拾う。
 */

/** 結末・展開を直接示す表現 */
const ENDING_PATTERNS: string[] = [
  '死ぬ', '死んだ', '死亡', '殺される', '殺した', '殺す',
  '裏切る', '裏切り', '裏切った',
  '正体は', '実は', '犯人は', '黒幕', 'ラスボス',
  'エンディング', '真犯人', '真相',
];

/** 伏線・匂わせ系表現 */
const FORESHADOWING_PATTERNS: string[] = [
  '覚えておいて', '覚えとけ', '伏線', 'あとで分かる', '後で分かる',
  'ここ大事', '意味深', 'フラグ', 'ここ重要',
];

/** 視聴者への行動指示系表現 */
const INSTRUCTION_PATTERNS: string[] = [
  'した方がいい', 'しない方がいい', 'しとけ', 'するな', 'するんじゃない',
  'やめろ', 'やめた方がいい', '行くな', '選ぶな', '押すな',
];

export const SPOILER_CONTEXT_PATTERNS: string[] = [
  ...ENDING_PATTERNS,
  ...FORESHADOWING_PATTERNS,
  ...INSTRUCTION_PATTERNS,
];

/**
 * テキスト中にネタバレ文脈表現が含まれるか判定する。
 * @returns マッチした文脈表現の文字列、なければ null
 */
export function matchesSpoilerContext(text: string): string | null {
  const lower = text.toLowerCase();
  for (const pattern of SPOILER_CONTEXT_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) return pattern;
  }
  return null;
}
