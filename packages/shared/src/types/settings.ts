/**
 * ユーザー設定の型定義（v1 / v2）と関連型。
 *
 * 注: このファイルにより `@fresh-chat-keeper/shared` の責務は
 * 「型・ユーティリティ置き場」から「アプリ設定スキーマの中心」へと拡大している。
 * これは Phase 2 設計書（dev-docs/architecture.md §4.2 および
 * dev-docs/phase-2-engine-split.md §依存ルール）に基づく意図的な配置で、
 * `judgment-engine → shared` の単方向依存を維持し、設定マイグレーション関数
 * （P2-MIG-01: settings-migration.ts）と同じパッケージに型を置く必要があるため。
 */

/**
 * ゲーム進行コンテキスト。判定エンジンへの入力に含める。
 *
 * 既存の {@link UserProgress}（v1構造）と異なり、ゲームタイトルや
 * ジャンルテンプレート等の判定エンジンが必要とする情報も含む。
 */
export interface GameContext {
  /** 知識ベース上のゲームID。ジャンルテンプレートのみで判定する場合は省略 */
  gameId?: string;
  /** ゲームタイトル（動画タイトルからの自動推測結果を含む） */
  gameTitle?: string;
  /** 進行管理モデル */
  progressType: 'chapter' | 'event' | 'none';
  /** チャプターベース時の現在チャプターID */
  currentChapter?: string;
  /** イベントベース時の通過済みイベントIDリスト */
  completedEvents?: string[];
  /** 適用するジャンルテンプレートID */
  genreTemplate?: string;
}

/**
 * Phase 1（v0.2.0以前）でリリース済みの設定スキーマ。
 *
 * `version` フィールドが存在しないオブジェクトは v1 とみなす。
 * P2-MIG-01 の {@link migrateSettings} で v2 へ変換される。
 *
 * @todo Phase 2 完了後、互換期間を経て削除予定
 */
export interface FilterSettingsV1 {
  /** v1 では未定義（versionフィールドなし） */
  version?: undefined;
  enabled: boolean;
  displayMode: 'placeholder' | 'hidden';
  filterMode: 'archive' | 'live';
  filterStrength: 'loose' | 'standard' | 'strict';
  gameContext?: GameContext;
  customBlockWords?: string[];
}

/**
 * Phase 2 以降（v0.3.0〜）の設定スキーマ。
 *
 * マルチラベル化（Phase 3）を見越し、フィルタカテゴリを `categories` 以下に
 * 構造化している。Phase 2 時点では `spoiler` のみ機能するが、Phase 3 で
 * `harassment` / `spam` / `offTopic` / `backseat` が稼働する。
 *
 * 読み込み時は必ず {@link migrateSettings} を通すこと（v1 からの移行を担保）。
 */
export interface FilterSettings {
  /** スキーマバージョン。常に 2 */
  version: 2;
  enabled: boolean;
  displayMode: 'placeholder' | 'hidden';
  filterMode: 'archive' | 'live';
  /** フィルタカテゴリ別の設定 */
  categories: {
    spoiler: {
      enabled: boolean;
      strength: 'loose' | 'standard' | 'strict';
    };
    /** @todo Phase 3 で稼働 */
    harassment?: {
      enabled: boolean;
      strength: 'loose' | 'standard' | 'strict';
    };
    /** @todo Phase 3 で稼働 */
    spam?: { enabled: boolean };
    /** @todo Phase 3 で稼働 */
    offTopic?: { enabled: boolean };
    /** @todo Phase 3 で稼働 */
    backseat?: { enabled: boolean };
  };
  /** ユーザー定義のカスタムNGワード */
  customBlockWords: string[];
  /** ユーザーティア。判定エンジンのモデル選択・利用上限に影響 */
  userTier: 'free' | 'premium' | 'streamer';
  /** プレイ中のゲーム情報。設定されていない場合は判定時に未指定として扱う */
  gameContext?: GameContext;
}
