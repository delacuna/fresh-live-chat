/**
 * `isObviouslySafe` 直接単体テスト。
 *
 * 本テストの存在理由:
 * - リグレッションテスト（stage1-parity.test.ts、61件）は filter.ts のフィクスチャから
 *   生成されており、`isObviouslySafe` が pass を返す経路を1件も含まない
 * - `isObviouslySafe` は新実装で導入された関数のため、別途直接の単体テストで
 *   挙動を保証する必要がある
 *
 * 仕様（src/stage1/index.ts §isObviouslySafe）:
 * 1. trim 後 `/^[w草ｗ]{1,10}$/` にマッチ → safe（短い笑い表現）
 * 2. trim 後 `/^[8８]{3,}$/` にマッチ → safe（複数の 8 連打）
 * 3. trim 後 length <= 2 → safe（2文字以下は無条件 safe）
 * 4. それ以外 → false（grayへ）
 */

import { describe, it, expect } from 'vitest';
import { isObviouslySafe } from '../../src/stage1/index.js';

describe('isObviouslySafe', () => {
  describe('true を返すべき（safe 判定）', () => {
    describe('短い笑い表現（ルール1: /^[w草ｗ]{1,10}$/）', () => {
      it.each([
        ['草', '単一笑い: 草'],
        ['ｗ', '単一笑い: 全角ｗ'],
        ['w', '単一笑い: 半角w'],
        ['www', '連続笑い: www'],
        ['草草草', '連続笑い: 草草草'],
        ['ｗｗｗｗ', '連続笑い: 全角4連'],
        ['wwwwwwwwww', '上限ちょうど10文字'],
      ])('%s (%s)', (input) => {
        expect(isObviouslySafe(input)).toBe(true);
      });
    });

    describe('複数の8（ルール2: /^[8８]{3,}$/）', () => {
      it.each([
        ['888', '半角3連'],
        ['8888', '半角4連'],
        ['８８８', '全角3連'],
      ])('%s (%s)', (input) => {
        expect(isObviouslySafe(input)).toBe(true);
      });
    });

    describe('2文字以下（ルール3: length <= 2）', () => {
      it.each([
        ['🎉', '絵文字 (UTF-16 で2 code unit)'],
        ['👏', '絵文字 (拍手)'],
        ['！', '記号1文字'],
        ['あ', 'ひらがな1文字'],
        ['wa', '英字2文字'],
        ['88', '8が2文字 — ルール2に届かないがルール3で safe'],
        ['', '空文字 (length=0)'],
        ['   ', '空白のみ → trim後空文字'],
      ])('%j (%s)', (input) => {
        expect(isObviouslySafe(input)).toBe(true);
      });
    });
  });

  describe('false を返すべき（gray に倒すべき）', () => {
    it.each([
      ['wwwwwwwwwww', '11文字の w連: ルール1の上限超過、ルール3も超過'],
      ['草いいね', '笑い + 文章: ルール1の文字セット外を含む'],
      ['ww nice play', '笑い + 英文'],
      ['犯人だった', '明らかにネタバレ寄りの文'],
      ['hello world', '一般的な英文'],
      ['今日は楽しかった', '日常の感想（safe だが Stage 2 で判定）'],
    ])('%s (%s)', (input) => {
      expect(isObviouslySafe(input)).toBe(false);
    });
  });
});
