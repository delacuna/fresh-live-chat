/**
 * 進行状況のシグネチャ文字列生成。
 *
 * 「同じ進行状況」を判定するための正規化された文字列キーを返す。
 * - キャッシュキー構築（{@link import('../stage2/cache.js').JudgmentCache.buildKey}）
 * - バッチャーのコンテキストグループ化（{@link import('../stage2/batcher.js').Stage2Batcher}）
 *
 * 両者で同じシグネチャを使うことで、「キャッシュ的に同じ」と「バッチ統合可能」が
 * 一貫した基準で判定される。
 *
 * 仕様:
 * - `progressType: 'event'` の `completedEvents` は順序差を吸収するため sort 後に join
 * - `progressType: 'chapter'` は `currentChapter` をそのまま使う
 * - `progressType: 'none'` は固定値 `'n'`
 * - `game === undefined` は固定値 `'-'`
 */

import type { JudgmentContext } from '../types.js';

export function getProgressSignature(game: JudgmentContext['game']): string {
  if (!game) return '-';
  switch (game.progressType) {
    case 'chapter':
      return `c:${game.currentChapter ?? ''}`;
    case 'event':
      // イベント順序の差はキャッシュ的に意味がないため sort してから join する
      return `e:${(game.completedEvents ?? []).slice().sort().join(',')}`;
    case 'none':
      return 'n';
  }
}
