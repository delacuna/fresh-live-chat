/**
 * 拡張機能の設定型定義と chrome.storage ヘルパー
 * ポップアップ / Content Script の両方から参照する
 */

export type FilterMode = 'strict' | 'standard' | 'lenient';
export type DisplayMode = 'placeholder' | 'hidden';

export interface GameProgress {
  progressModel: 'chapter' | 'event';
  /** チャプターモデル: 現在プレイ中のチャプターID */
  currentChapterId?: string;
  /** イベントモデル: 通過済みイベントIDの配列 */
  completedEventIds?: string[];
}

export interface Settings {
  enabled: boolean;
  /** アクティブなゲームID */
  gameId: string;
  /** ゲームごとの進行状況 */
  progressByGame: Record<string, GameProgress>;
  filterMode: FilterMode;
  displayMode: DisplayMode;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  gameId: 'ace-attorney-1',
  progressByGame: {},
  filterMode: 'standard',
  displayMode: 'placeholder',
};

/** メイン設定のストレージキー。書き込みはポップアップのみ行う。 */
export const STORAGE_KEY = 'spoilershield_settings';

/**
 * フィルタカウントの専用ストレージキー。
 * Content Script のみ書き込む。STORAGE_KEY との競合を防ぐために分離している。
 */
export const FILTER_COUNT_KEY = 'spoilershield_filter_count';

/**
 * フィルタモードに応じてブロック対象の spoiler_level 一覧を返す
 *
 * strict  : direct_spoiler + foreshadowing_hint + gameplay_hint
 * standard: direct_spoiler + foreshadowing_hint
 * lenient : direct_spoiler のみ
 */
export function getBlockedLevels(mode: FilterMode): string[] {
  switch (mode) {
    case 'strict':
      return ['direct_spoiler', 'foreshadowing_hint', 'gameplay_hint'];
    case 'standard':
      return ['direct_spoiler', 'foreshadowing_hint'];
    case 'lenient':
      return ['direct_spoiler'];
  }
}

/** chrome.storage.local から設定を読み込む */
export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] as Partial<Settings>) };
}

/** chrome.storage.local に設定を保存する */
export async function saveSettings(settings: Settings): Promise<void> {
  console.log('[SpoilerShield][storage.set]', { caller: 'content/shortcut', enabled: settings.enabled });
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}