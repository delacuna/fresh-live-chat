/**
 * 軽量ハッシュ関数。
 *
 * キャッシュキー生成用途。暗号学的強度は不要（衝突耐性のみが目的）。
 * Chrome拡張・Cloudflare Workers の両環境で動作するため、Web Crypto を使わず
 * pure な JS 実装を採用する。
 */

/**
 * FNV-1a 32-bit ハッシュ。
 * UTF-16 コードユニット単位で計算するため、サロゲートペアを含む文字列でも
 * 「同じ文字列なら同じハッシュ」になる。
 *
 * @param input ハッシュ対象の文字列
 * @returns 8桁の16進文字列
 */
export function hashString(input: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // FNV prime: 0x01000193 — 32-bit乗算でラップさせるため Math.imul を使う
    hash = Math.imul(hash, 0x01000193);
  }
  // 符号なし32bitに変換し16進化
  return (hash >>> 0).toString(16).padStart(8, '0');
}
