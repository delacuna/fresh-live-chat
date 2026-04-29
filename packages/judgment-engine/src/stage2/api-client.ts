/**
 * Stage 2 通信抽象層。
 *
 * 判定エンジンは実際の通信方法（Chrome拡張の chrome.runtime.sendMessage、
 * Cloudflare Workers の fetch、テスト用モック等）を知らない設計とする。
 * 呼び出し側で実装を注入することで、同じ判定ロジックを複数の実行環境で再利用できる。
 *
 * 本ファイルでは:
 * - インターフェース（{@link Stage2Transport}）を `../types.js` から再エクスポート
 * - テスト用のモック実装 {@link createMockTransport} を提供
 *
 * 実環境向け Transport は判定エンジン外で実装される予定:
 * - P2-INTEG-01: chrome-ext 用 Transport（chrome.runtime.sendMessage 経由）
 * - P2-PROXY-01: proxy 用 Transport（直接 fetch / Anthropic API 呼び出し）
 *
 * @see dev-docs/phase-2-engine-split.md §Transport抽象化の意義
 */

import type {
  Stage2Transport,
  JudgeRequestPayload,
  JudgeResponsePayload,
} from '../types.js';

// 型は types.ts に置いてあるが、Stage 2 利用側が import 経路を一本化できるよう
// ここからも再エクスポートする
export type { Stage2Transport, JudgeRequestPayload, JudgeResponsePayload };

/**
 * テスト用モック Transport の振る舞いを構築するハンドラ関数。
 *
 * 受け取ったリクエストペイロードを検査して、テストごとに任意のレスポンスを返せる。
 * 例外を throw した場合、{@link Stage2Transport.sendJudgeRequest} が reject する。
 */
export type MockTransportHandler = (
  payload: JudgeRequestPayload,
) => JudgeResponsePayload | Promise<JudgeResponsePayload>;

/**
 * テスト用モック Transport を生成する。
 *
 * @example
 * ```typescript
 * const transport = createMockTransport((payload) => ({
 *   results: payload.messages.map((m) => ({
 *     messageId: m.id,
 *     verdict: 'allow',
 *     stage: 2,
 *   })),
 * }));
 * ```
 */
export function createMockTransport(handler: MockTransportHandler): Stage2Transport {
  return {
    async sendJudgeRequest(payload) {
      return handler(payload);
    },
  };
}

/**
 * 常にエラーを返す Transport。
 * Stage 2 が利用不可な状況（オフライン・プロキシ無応答等）のテスト用。
 */
export function createFailingTransport(error: Error = new Error('Transport unavailable')): Stage2Transport {
  return {
    async sendJudgeRequest() {
      throw error;
    },
  };
}
