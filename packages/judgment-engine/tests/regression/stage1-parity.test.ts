/**
 * Stage 1 リグレッションテスト（parity test）。
 *
 * 既存 `apps/chrome-ext/src/content/filter.ts` から取得した期待値が
 * `stage1-fixtures.ts` に静的に埋め込まれている。本テストはその期待値に対して
 * judgment-engine 側の **新実装**（packages/judgment-engine/src/stage1/）を実行して
 * 一致を確認する。新旧2つの独立した実装が同じ入力で同じ結果を返すことが
 * 確認できて初めて、parity 検証として意味を持つ。
 *
 * P2-STAGE1-02 で `stage1-impl-snapshot.ts` から新実装に切り替え済み。
 *
 * **検証範囲の限定（重要）**:
 * 本テストは filter.ts から生成された 61 件のフィクスチャに対する新旧 parity を
 * 検証するが、検証範囲は **下層マッチ関数**（`matchesKeyword`,
 * `matchesCustomNGWord`, `matchesGenreTemplate` 等）に限定される。これらは
 * `runStage1` の内部評価で言えば custom_blocklist と keyword_match の2経路に対応する。
 *
 * 新実装で導入された `obviously_safe` 経路（`isObviouslySafe` による短い定型反応・
 * 2文字以下を即 pass する最適化）は本テストの対象外。`runStage1` 全体の動作確認は
 * `tests/stage1/run-stage1.test.ts` と `tests/stage1/obviously-safe.test.ts` で
 * カバーする。
 *
 * 旧 filter.ts は obviously_safe ルールを持たないため、もし parity をこれに拡張
 * すれば必ず差分が出る（旧: null/Stage 2 行き、新: pass/即決）。この差分は
 * 設計書 `dev-docs/phase-2-engine-split.md` §Stage 1の移植 で意図的な最適化として
 * 承認されている。
 */

import { describe, it, expect } from 'vitest';
import {
  MATCHES_KEYWORD_FIXTURES,
  MATCHES_CUSTOM_NG_WORD_FIXTURES,
  MATCHES_GENRE_TEMPLATE_FIXTURES,
  MATCHES_GAMEPLAY_HINT_FIXTURES,
  MATCHES_GENRE_KEYWORD_FIXTURES,
  MATCHES_KEYWORD_FOR_STAGE2_FIXTURES,
  BUILD_KEYWORD_SET_FIXTURES,
  BUILD_DESCRIPTION_PHRASE_SET_FIXTURES,
} from './stage1-fixtures.js';
import {
  matchesKeyword,
  matchesCustomNGWord,
  matchesGenreTemplate,
  matchesGameplayHintForStage2,
  matchesGenreKeywordForStage2,
  matchesKeywordForStage2,
  buildKeywordSet,
  buildDescriptionPhraseSet,
} from '../../src/stage1/index.js';
import { getAllGenreTemplates } from '@fresh-chat-keeper/knowledge-base';

const ALL_GENRES = getAllGenreTemplates();
const templatesByIds = (ids: string[]) => ALL_GENRES.filter((t) => ids.includes(t.id));

describe('Stage 1 parity with filter.ts (v0.2.0 snapshot)', () => {
  describe('A. matchesKeyword', () => {
    it.each(MATCHES_KEYWORD_FIXTURES)('$name', ({ input, expected }) => {
      const result = matchesKeyword(input.text, new Set(input.keywords), new Set(input.descriptionPhrases));
      expect(result).toEqual(expected);
    });
  });

  describe('B. matchesCustomNGWord', () => {
    it.each(MATCHES_CUSTOM_NG_WORD_FIXTURES)('$name', ({ input, expected }) => {
      const result = matchesCustomNGWord(input.text, input.words);
      expect(result).toBe(expected);
    });
  });

  describe('C. matchesGenreTemplate', () => {
    it.each(MATCHES_GENRE_TEMPLATE_FIXTURES)('$name', ({ input, expected }) => {
      const result = matchesGenreTemplate(input.text, templatesByIds(input.templateIds));
      expect(result).toBe(expected);
    });
  });

  describe('D. matchesGameplayHintForStage2', () => {
    it.each(MATCHES_GAMEPLAY_HINT_FIXTURES)('$name', ({ input, expected }) => {
      const result = matchesGameplayHintForStage2(input.text, templatesByIds(input.templateIds));
      expect(result).toBe(expected);
    });
  });

  describe('E. matchesGenreKeywordForStage2', () => {
    it.each(MATCHES_GENRE_KEYWORD_FIXTURES)('$name', ({ input, expected }) => {
      const result = matchesGenreKeywordForStage2(input.text, templatesByIds(input.templateIds));
      expect(result).toBe(expected);
    });
  });

  describe('F. matchesKeywordForStage2', () => {
    it.each(MATCHES_KEYWORD_FOR_STAGE2_FIXTURES)('$name', ({ input, expected }) => {
      const result = matchesKeywordForStage2(input.text, new Set(input.keywords));
      expect(result).toBe(expected);
    });
  });

  describe('G. buildKeywordSet', () => {
    it.each(BUILD_KEYWORD_SET_FIXTURES)('$name', ({ input, expected }) => {
      const result = [...buildKeywordSet(input.gameId, input.filterMode, input.progress)].sort();
      expect(result).toEqual(expected);
    });
  });

  describe('H. buildDescriptionPhraseSet', () => {
    it.each(BUILD_DESCRIPTION_PHRASE_SET_FIXTURES)('$name', ({ input, expected }) => {
      const result = [...buildDescriptionPhraseSet(input.gameId)].sort();
      expect(result).toEqual(expected);
    });
  });
});
