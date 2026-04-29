/**
 * `migrateSettings` テスト。
 *
 * カバー範囲:
 * - 不正入力 (null/undefined/プリミティブ/配列) → デフォルト v2
 * - 完全な v1 → v2 変換
 * - 部分的に欠けた v1 → 安全に補完
 * - v2 idempotency（再投入で値が変わらない）
 * - 部分的に欠けた v2 → 安全に補完
 * - 不正な型の値（数値が来るべき所に文字列等）→ デフォルトで上書き
 */

import { describe, it, expect } from 'vitest';
import { migrateSettings } from '../src/settings-migration.js';
import type { FilterSettings, FilterSettingsV1, GameContext } from '../src/types/settings.js';

const DEFAULT_V2: FilterSettings = {
  version: 2,
  enabled: true,
  displayMode: 'placeholder',
  filterMode: 'archive',
  categories: { spoiler: { enabled: true, strength: 'standard' } },
  customBlockWords: [],
  userTier: 'free',
};

describe('migrateSettings', () => {
  describe('不正入力 → デフォルト v2', () => {
    it('null → デフォルト', () => {
      expect(migrateSettings(null)).toEqual(DEFAULT_V2);
    });

    it('undefined → デフォルト', () => {
      expect(migrateSettings(undefined)).toEqual(DEFAULT_V2);
    });

    it('数値 → デフォルト', () => {
      expect(migrateSettings(42)).toEqual(DEFAULT_V2);
    });

    it('文字列 → デフォルト', () => {
      expect(migrateSettings('not an object')).toEqual(DEFAULT_V2);
    });

    it('配列 → デフォルト（プレーンオブジェクトでない）', () => {
      expect(migrateSettings([1, 2, 3])).toEqual(DEFAULT_V2);
    });

    it('空オブジェクト → v1 として処理されデフォルトに近い形になる', () => {
      const result = migrateSettings({});
      expect(result.version).toBe(2);
      expect(result.enabled).toBe(true);
      expect(result.categories.spoiler.strength).toBe('standard');
      expect(result.userTier).toBe('free');
      expect(result.customBlockWords).toEqual([]);
    });
  });

  describe('完全な v1 → v2 変換', () => {
    it('全フィールド埋まった v1 を v2 に正しく変換', () => {
      const v1: FilterSettingsV1 = {
        enabled: true,
        displayMode: 'placeholder',
        filterMode: 'live',
        filterStrength: 'strict',
        customBlockWords: ['秘密', 'ネタバレ注意'],
        gameContext: {
          gameId: 'ace-attorney-1',
          progressType: 'chapter',
          currentChapter: 'ch3',
        },
      };
      const result = migrateSettings(v1);
      expect(result).toEqual<FilterSettings>({
        version: 2,
        enabled: true,
        displayMode: 'placeholder',
        filterMode: 'live',
        categories: { spoiler: { enabled: true, strength: 'strict' } },
        customBlockWords: ['秘密', 'ネタバレ注意'],
        userTier: 'free',
        gameContext: {
          gameId: 'ace-attorney-1',
          progressType: 'chapter',
          currentChapter: 'ch3',
        },
      });
    });

    it('v1 enabled: false でも categories.spoiler.enabled は true を維持', () => {
      const v1: FilterSettingsV1 = {
        enabled: false,
        displayMode: 'hidden',
        filterMode: 'archive',
        filterStrength: 'loose',
      };
      const result = migrateSettings(v1);
      expect(result.enabled).toBe(false);
      expect(result.categories.spoiler.enabled).toBe(true);
      expect(result.categories.spoiler.strength).toBe('loose');
    });

    it('v1 customBlockWords 未定義 → 空配列', () => {
      const v1 = {
        enabled: true,
        displayMode: 'placeholder',
        filterMode: 'archive',
        filterStrength: 'standard',
      };
      const result = migrateSettings(v1);
      expect(result.customBlockWords).toEqual([]);
    });
  });

  describe('部分的に欠けた v1 → 安全に補完', () => {
    it('filterStrength のみ → 他はデフォルト', () => {
      const result = migrateSettings({ filterStrength: 'strict' });
      expect(result.categories.spoiler.strength).toBe('strict');
      expect(result.enabled).toBe(true);
      expect(result.displayMode).toBe('placeholder');
      expect(result.filterMode).toBe('archive');
    });

    it('filterStrength が不正値 → standard に倒す', () => {
      const result = migrateSettings({ filterStrength: 'extreme' });
      expect(result.categories.spoiler.strength).toBe('standard');
    });

    it('displayMode が不正値 → placeholder に倒す', () => {
      const result = migrateSettings({ displayMode: 'invalid' });
      expect(result.displayMode).toBe('placeholder');
    });

    it('customBlockWords が string[] でない → 空配列', () => {
      const result = migrateSettings({ customBlockWords: 'not-an-array' });
      expect(result.customBlockWords).toEqual([]);
    });

    it('customBlockWords に非 string が混じる → 空配列', () => {
      const result = migrateSettings({ customBlockWords: ['ok', 42, 'word'] });
      expect(result.customBlockWords).toEqual([]);
    });

    it('gameContext が不正な構造 → undefined（脱落）', () => {
      const result = migrateSettings({
        filterStrength: 'standard',
        gameContext: { foo: 'bar' }, // progressType がない
      });
      expect(result.gameContext).toBeUndefined();
    });

    it('gameContext が妥当 → 保持', () => {
      const game: GameContext = {
        gameId: 'g',
        progressType: 'event',
        completedEvents: ['e1', 'e2'],
      };
      const result = migrateSettings({ filterStrength: 'standard', gameContext: game });
      expect(result.gameContext).toEqual(game);
    });
  });

  describe('v2 idempotency', () => {
    it('v2 を渡しても変わらない', () => {
      const v2: FilterSettings = {
        version: 2,
        enabled: false,
        displayMode: 'hidden',
        filterMode: 'live',
        categories: { spoiler: { enabled: false, strength: 'strict' } },
        customBlockWords: ['a', 'b'],
        userTier: 'premium',
        gameContext: { gameId: 'g', progressType: 'none' },
      };
      const result = migrateSettings(v2);
      expect(result).toEqual(v2);
    });

    it('再マイグレーション（migrate(migrate(v1))）でも安定', () => {
      const v1: FilterSettingsV1 = {
        enabled: true,
        displayMode: 'placeholder',
        filterMode: 'archive',
        filterStrength: 'strict',
      };
      const once = migrateSettings(v1);
      const twice = migrateSettings(once);
      expect(twice).toEqual(once);
    });

    it('Phase 3 の optional カテゴリ（harassment 等）が入った v2 でも保持', () => {
      const v2 = {
        version: 2,
        enabled: true,
        displayMode: 'placeholder',
        filterMode: 'archive',
        categories: {
          spoiler: { enabled: true, strength: 'standard' },
          harassment: { enabled: true, strength: 'strict' },
          spam: { enabled: false },
        },
        customBlockWords: [],
        userTier: 'free',
      };
      const result = migrateSettings(v2);
      expect(result.categories.harassment).toEqual({ enabled: true, strength: 'strict' });
      expect(result.categories.spam).toEqual({ enabled: false });
    });
  });

  describe('部分的に欠けた v2 → 安全に補完', () => {
    it('v2 で categories.spoiler が欠落 → デフォルトで補完', () => {
      const result = migrateSettings({
        version: 2,
        enabled: true,
        displayMode: 'placeholder',
        filterMode: 'archive',
        categories: {},
        customBlockWords: [],
        userTier: 'free',
      });
      expect(result.categories.spoiler).toEqual({ enabled: true, strength: 'standard' });
    });

    it('v2 で userTier が不正値 → free に倒す', () => {
      const result = migrateSettings({
        version: 2,
        enabled: true,
        displayMode: 'placeholder',
        filterMode: 'archive',
        categories: { spoiler: { enabled: true, strength: 'standard' } },
        customBlockWords: [],
        userTier: 'enterprise', // 不正値
      });
      expect(result.userTier).toBe('free');
    });

    it('v2 で gameContext が不正な構造 → 脱落', () => {
      const result = migrateSettings({
        version: 2,
        enabled: true,
        displayMode: 'placeholder',
        filterMode: 'archive',
        categories: { spoiler: { enabled: true, strength: 'standard' } },
        customBlockWords: [],
        userTier: 'free',
        gameContext: 'not-an-object',
      });
      expect(result.gameContext).toBeUndefined();
    });
  });
});
