/**
 * 設定スキーマ v1 → v2 マイグレーション関数。
 *
 * - v1（version フィールドなし、`filterStrength` をトップレベルに持つ）
 * - v2（version: 2、`categories.spoiler.{enabled,strength}` 構造）
 *
 * 設計原則（dev-docs/architecture.md §7.2、phase-2-engine-split.md §設定スキーマ）:
 * - **Idempotent**: v2 がそのまま渡された場合は値を変えずに返す（再マイグレーションの重複防止）
 * - **不正な入力に強い**: undefined / null / 配列 / 部分欠落でもクラッシュせず default にフォールバック
 * - **既存挙動を変えない**: v1 ユーザーの enabled/strength はそのまま継承、新カテゴリは OFF で開始
 * - **新フィールドは安全側のデフォルト**: `userTier` は `'free'`、`customBlockWords` は `[]`
 *
 * バックアップ保存（`fck_settings_v1_backup` への書き込み）は本関数の責務外。
 * Chrome 拡張側（apps/chrome-ext/src/shared/settings.ts）で対応する。
 */

import type { FilterSettings, FilterSettingsV1, GameContext } from './types/settings.js';

/** v2 のデフォルト値（不正入力時のフォールバック）。 */
function getDefaultSettings(): FilterSettings {
  return {
    version: 2,
    enabled: true,
    displayMode: 'placeholder',
    filterMode: 'archive',
    categories: {
      spoiler: { enabled: true, strength: 'standard' },
    },
    customBlockWords: [],
    userTier: 'free',
  };
}

/** プレーンオブジェクトかどうか（null・配列・プリミティブを除外） */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** v1 で許容される displayMode 値か */
function isDisplayMode(value: unknown): value is FilterSettings['displayMode'] {
  return value === 'placeholder' || value === 'hidden';
}

/** v1 で許容される filterMode 値か */
function isFilterMode(value: unknown): value is FilterSettings['filterMode'] {
  return value === 'archive' || value === 'live';
}

/** v1 の filterStrength（loose/standard/strict）か */
function isFilterStrength(value: unknown): value is 'loose' | 'standard' | 'strict' {
  return value === 'loose' || value === 'standard' || value === 'strict';
}

/** v2 の userTier 値か */
function isUserTier(value: unknown): value is FilterSettings['userTier'] {
  return value === 'free' || value === 'premium' || value === 'streamer';
}

/** GameContext として妥当か（progressType だけ最低限チェック） */
function isGameContext(value: unknown): value is GameContext {
  if (!isPlainObject(value)) return false;
  const pt = value.progressType;
  return pt === 'chapter' || pt === 'event' || pt === 'none';
}

/** string[] として妥当か（要素が全て string） */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/**
 * v2 オブジェクトを「正しい形」に整える。
 * 部分的に欠けたフィールドは default で補い、不正な値は default で上書きする。
 * 不明なフィールド（spread の残り）は保持しない（型外なので追加で破棄）が、
 * harassment/spam/offTopic/backseat 等の v2 内 optional は保持する。
 */
function ensureV2Shape(raw: Record<string, unknown>): FilterSettings {
  const defaults = getDefaultSettings();

  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : defaults.enabled;
  const displayMode = isDisplayMode(raw.displayMode) ? raw.displayMode : defaults.displayMode;
  const filterMode = isFilterMode(raw.filterMode) ? raw.filterMode : defaults.filterMode;
  const customBlockWords = isStringArray(raw.customBlockWords)
    ? raw.customBlockWords
    : defaults.customBlockWords;
  const userTier = isUserTier(raw.userTier) ? raw.userTier : defaults.userTier;
  const gameContext = isGameContext(raw.gameContext) ? raw.gameContext : undefined;

  // categories: spoiler は必須。harassment/spam/offTopic/backseat は v2 で optional
  const categoriesRaw = isPlainObject(raw.categories) ? raw.categories : {};
  const spoilerRaw = isPlainObject(categoriesRaw.spoiler) ? categoriesRaw.spoiler : {};
  const categories: FilterSettings['categories'] = {
    spoiler: {
      enabled: typeof spoilerRaw.enabled === 'boolean' ? spoilerRaw.enabled : true,
      strength: isFilterStrength(spoilerRaw.strength) ? spoilerRaw.strength : 'standard',
    },
  };

  // optional な v2 カテゴリは存在すれば保持
  if (isPlainObject(categoriesRaw.harassment)) {
    const h = categoriesRaw.harassment;
    categories.harassment = {
      enabled: typeof h.enabled === 'boolean' ? h.enabled : false,
      strength: isFilterStrength(h.strength) ? h.strength : 'standard',
    };
  }
  if (isPlainObject(categoriesRaw.spam)) {
    categories.spam = {
      enabled: typeof categoriesRaw.spam.enabled === 'boolean' ? categoriesRaw.spam.enabled : false,
    };
  }
  if (isPlainObject(categoriesRaw.offTopic)) {
    categories.offTopic = {
      enabled:
        typeof categoriesRaw.offTopic.enabled === 'boolean' ? categoriesRaw.offTopic.enabled : false,
    };
  }
  if (isPlainObject(categoriesRaw.backseat)) {
    categories.backseat = {
      enabled:
        typeof categoriesRaw.backseat.enabled === 'boolean' ? categoriesRaw.backseat.enabled : false,
    };
  }

  return {
    version: 2,
    enabled,
    displayMode,
    filterMode,
    categories,
    customBlockWords,
    userTier,
    ...(gameContext ? { gameContext } : {}),
  };
}

/**
 * v1 → v2 への変換。
 *
 * - `filterStrength` トップレベル → `categories.spoiler.{enabled: true, strength}`
 * - 新フィールド `userTier` は `'free'` をデフォルト
 * - `customBlockWords` 未定義は `[]`
 * - `gameContext` はそのまま継承（構造変化なし）
 * - `enabled === false` でも `categories.spoiler.enabled` は `true` を保つ
 *   （旧 enabled は「拡張全体の有効/無効」を意味し、新 enabled は「拡張全体」と
 *   「カテゴリ別」の2階建て。v1 ユーザーが『spoiler フィルタを完全に切る』意図で
 *   保存したわけではないので、カテゴリ側は規定通り ON のまま継承する）
 */
function migrateV1ToV2(v1: FilterSettingsV1): FilterSettings {
  const strength: 'loose' | 'standard' | 'strict' = isFilterStrength(v1.filterStrength)
    ? v1.filterStrength
    : 'standard';

  const result: FilterSettings = {
    version: 2,
    enabled: typeof v1.enabled === 'boolean' ? v1.enabled : true,
    displayMode: isDisplayMode(v1.displayMode) ? v1.displayMode : 'placeholder',
    filterMode: isFilterMode(v1.filterMode) ? v1.filterMode : 'archive',
    categories: {
      spoiler: { enabled: true, strength },
    },
    customBlockWords: isStringArray(v1.customBlockWords) ? v1.customBlockWords : [],
    userTier: 'free',
  };

  if (isGameContext(v1.gameContext)) {
    result.gameContext = v1.gameContext;
  }

  return result;
}

/**
 * 任意の入力を v2 の {@link FilterSettings} に正規化する。
 *
 * 入力パターン:
 * - `null` / `undefined` / 非オブジェクト → デフォルト v2
 * - `{ version: 2, ... }` → ensureV2Shape を通して整形（idempotent）
 * - `{ version: undefined, filterStrength, ... }` → v1 とみなして v2 に変換
 * - 部分的に欠けたオブジェクト → 該当フィールドのみ default で補う
 *
 * 本関数は副作用を持たない。バックアップ保存は呼び出し側の責務。
 */
export function migrateSettings(raw: unknown): FilterSettings {
  if (!isPlainObject(raw)) {
    return getDefaultSettings();
  }

  // 既に v2
  if (raw.version === 2) {
    return ensureV2Shape(raw);
  }

  // v1（version なし）として変換。
  // 入力は Record<string, unknown> でフィールドが欠けている可能性があるが、
  // migrateV1ToV2 内で各フィールドを isXxx ガードして安全に処理するため、
  // unknown 経由で FilterSettingsV1 に narrowing する。
  return migrateV1ToV2(raw as unknown as FilterSettingsV1);
}
