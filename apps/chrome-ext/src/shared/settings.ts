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
  /** Stage 2 プロキシの URL（デフォルト: http://localhost:8787） */
  proxyUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  gameId: 'ace-attorney-1',
  progressByGame: {},
  filterMode: 'standard',
  displayMode: 'placeholder',
  proxyUrl: 'http://localhost:8787',
};

/** メイン設定のストレージキー。書き込みはポップアップのみ行う。 */
export const STORAGE_KEY = 'spoilershield_settings';

/**
 * 匿名トークンのストレージキー。
 * 初回起動時に UUID を生成して保存し、以降は同じ値を使い回す。
 */
export const ANON_TOKEN_KEY = 'spoilershield_anon_token';

/**
 * フィルタカウントの専用ストレージキー。
 * Content Script のみ書き込む。STORAGE_KEY との競合を防ぐために分離している。
 */
export const FILTER_COUNT_KEY = 'spoilershield_filter_count';

/** Stage 2 月間利用量のストレージキー */
export const STAGE2_USAGE_KEY = 'spoilershield_stage2_usage';

/**
 * Stage 2 の月間メッセージ件数上限。超えた場合は Stage 1 のみで動作する。
 * メッセージ件数で判定する（HTTP リクエスト回数ではない）。
 */
export const STAGE2_MONTHLY_LIMIT = 1000;

export interface Stage2Usage {
  /** 集計月（"YYYY-MM" 形式）。月をまたいだらリセット判定に使用する。 */
  month: string;
  /**
   * 今月 Stage 2 に送信したメッセージの総件数。
   * ポップアップ表示と月間上限チェックに使用する。
   */
  messageCount: number;
  /**
   * 今月プロキシに送信した HTTP リクエスト回数（バッチ単位）。
   * 内部記録のみ。ポップアップには表示しない。
   */
  apiCallCount: number;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** chrome.storage から今月の Stage 2 利用量を取得する。月が変わっていればリセット済みの値を返す。 */
export async function getStage2Usage(): Promise<Stage2Usage> {
  const result = await chrome.storage.local.get(STAGE2_USAGE_KEY);
  const stored = result[STAGE2_USAGE_KEY] as Stage2Usage | undefined;
  const currentMonth = getCurrentMonth();
  if (!stored || stored.month !== currentMonth) {
    return { month: currentMonth, messageCount: 0, apiCallCount: 0 };
  }
  return {
    month: stored.month,
    messageCount: stored.messageCount ?? 0,
    apiCallCount: stored.apiCallCount ?? 0,
  };
}

/**
 * Stage 2 バッチ送信成功時に利用量を更新する。
 * @param messages バッチに含まれていたメッセージ件数
 */
export async function incrementStage2Usage(messages: number): Promise<Stage2Usage> {
  const usage = await getStage2Usage();
  const updated: Stage2Usage = {
    month: usage.month,
    messageCount: usage.messageCount + messages,
    apiCallCount: usage.apiCallCount + 1,
  };
  await chrome.storage.local.set({ [STAGE2_USAGE_KEY]: updated });
  return updated;
}

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

/**
 * 匿名トークンを取得する。まだ存在しない場合は UUID を生成して保存する。
 * リクエストヘッダー x-spoilershield-token に使用する。
 */
export async function getOrCreateAnonToken(): Promise<string> {
  const result = await chrome.storage.local.get(ANON_TOKEN_KEY);
  const existing = result[ANON_TOKEN_KEY] as string | undefined;
  if (existing) return existing;

  const token = crypto.randomUUID();
  await chrome.storage.local.set({ [ANON_TOKEN_KEY]: token });
  console.log('[SpoilerShield] 匿名トークンを生成しました:', token.slice(0, 8) + '...');
  return token;
}