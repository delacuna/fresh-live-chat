/**
 * マッチング前処理用テキスト正規化。
 *
 * 変換内容（この順序で適用）:
 *   1. NFKC 正規化 — 半角カタカナ→全角カタカナ、全角英数→半角英数
 *   2. ひらがな → カタカナ（U+3041–U+3096）
 *   3. 英字を小文字化
 *
 * 変換しないもの:
 *   - 漢字の読み推測（「米」→「コメ」等）
 *   - 省略形の補完（「コメ」→「コメント」等）
 *
 * @example
 *   normalizeKana('ねたばれ')  // → 'ネタバレ'
 *   normalizeKana('ﾈﾀﾊﾞﾚ')   // → 'ネタバレ'
 *   normalizeKana('Spoiler')  // → 'spoiler'
 */
export function normalizeKana(text: string): string {
  return (
    text
      // ① 半角カナ→全角カナ、全角英数→半角英数 など
      .normalize('NFKC')
      // ② ひらがな（ぁ=U+3041 〜 ゖ=U+3096）→ カタカナ（オフセット +0x60）
      .replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
      // ③ 英字小文字化
      .toLowerCase()
  );
}
