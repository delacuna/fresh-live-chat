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
  /** フィルタされたコメント数（セッション累計） */
  filterCount: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  gameId: 'ace-attorney-1',
  progressByGame: {},
  filterMode: 'standard',
  displayMode: 'placeholder',
  filterCount: 0,
};

export const STORAGE_KEY = 'spoilershield_settings';

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
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

/** フィルタカウントを1増やす */
export async function incrementFilterCount(): Promise<void> {
  const current = await loadSettings();
  await saveSettings({ ...current, filterCount: current.filterCount + 1 });
}
