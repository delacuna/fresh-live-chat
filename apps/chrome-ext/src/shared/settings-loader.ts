/**
 * 設定ローダー（マイグレーション統合版）。
 *
 * 既存 v0.2.0 ユーザーの fck_settings は version フィールドを持たない。
 * 拡張更新後の最初の起動で本ローダーが:
 *   1. fck_settings を読み込む
 *   2. version === 2 でなければ:
 *      - 旧データを `fck_settings_v1_backup` にバックアップ
 *      - `version: 2` を付与し DEFAULT_SETTINGS と merge して fck_settings に書き戻す
 *   3. version === 2 ならそのまま使用
 *
 * 設計判断（INTEG-01 時点）:
 * - shared の {@link import('@fresh-chat-keeper/shared').migrateSettings} は
 *   judgment-engine 用の v2 形式 (`categories.spoiler.{enabled,strength}` 構造) を
 *   返すが、chrome-ext の既存 Settings 型は `progressByGame` /
 *   `selectedGenreTemplates` / `proxyUrl` / `customNgWords` 等を保持する独自構造
 * - shared の migrateSettings をそのまま通すと chrome-ext 固有データが消失するため、
 *   chrome-ext 内部では既存 Settings 型を維持しつつ、`version: 2` フィールドの
 *   付与とバックアップ生成だけを担当する軽量マイグレーションを実装
 * - judgment-engine への引き渡し時のみ `filter-orchestrator.ts` 内で v2 形式に変換
 */

import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  type Settings,
} from './settings.js';

/** マイグレーション時に作成されるバックアップキー */
export const SETTINGS_V1_BACKUP_KEY = 'fck_settings_v1_backup';

/**
 * 拡張内部で扱う Settings に version フィールドを付与した型。
 * chrome.storage 上の保存表現でのみ使用する（読み出し後はトップレベルから version を除いた {@link Settings} に統一）。
 */
type StoredSettingsV2 = Settings & { version: 2 };

/**
 * chrome.storage.local から設定を読み込む。
 * v1 → v2 マイグレーションが必要な場合は自動的にバックアップを作成して書き戻す。
 *
 * 副作用:
 * - 初回マイグレーション時のみ `fck_settings_v1_backup` に旧データを保存
 * - 初回マイグレーション時のみ `fck_settings` を v2 形式に書き戻す
 */
export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];

  // 完全に未設定 → DEFAULT を返す（version 付与はしない、初期状態の保護）
  if (raw === undefined || raw === null) {
    return { ...DEFAULT_SETTINGS };
  }

  // v2 既存
  if (isStoredV2(raw)) {
    return stripVersion(raw);
  }

  // v1 → v2 マイグレーション
  return await migrateLegacyToV2(raw);
}

function isStoredV2(raw: unknown): raw is StoredSettingsV2 {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    !Array.isArray(raw) &&
    (raw as { version?: unknown }).version === 2
  );
}

function stripVersion(raw: StoredSettingsV2): Settings {
  const { version: _ignore, ...rest } = raw;
  void _ignore;
  return { ...DEFAULT_SETTINGS, ...rest };
}

async function migrateLegacyToV2(raw: unknown): Promise<Settings> {
  const partial = (typeof raw === 'object' && raw !== null && !Array.isArray(raw))
    ? (raw as Partial<Settings>)
    : {};

  const merged: Settings = { ...DEFAULT_SETTINGS, ...partial };
  const stored: StoredSettingsV2 = { ...merged, version: 2 };

  // バックアップを保存（既にバックアップが存在する場合は上書きしない）
  const backupExisting = await chrome.storage.local.get(SETTINGS_V1_BACKUP_KEY);
  const updates: Record<string, unknown> = { [STORAGE_KEY]: stored };
  if (backupExisting[SETTINGS_V1_BACKUP_KEY] === undefined) {
    updates[SETTINGS_V1_BACKUP_KEY] = raw;
  }
  await chrome.storage.local.set(updates);

  console.log(
    '[FreshChatKeeper] 設定スキーマを v2 にマイグレーションしました（旧データは fck_settings_v1_backup に保存）',
  );

  return merged;
}
