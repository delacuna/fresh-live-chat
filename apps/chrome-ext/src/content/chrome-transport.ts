/**
 * Stage 2 通信の Chrome 拡張側実装。
 *
 * judgment-engine の `Stage2Transport` インターフェースを実装し、
 * proxy への HTTP リクエストを抽象化する。
 *
 * 設計判断（INTEG-01 時点）:
 * - 現状の chrome-ext は content script から直接 fetch しており、
 *   YouTube のオリジン上で host_permissions 経由の CORS が機能している
 * - 設計書には「background service worker 経由」とあるが、現状動作確認済みの
 *   直接 fetch を維持する方が「既存挙動の同等性」リスクが低い
 * - background 経由への移行は P2-INTEG-02 以降の改善余地として残す
 */

import type {
  Stage2Transport,
  JudgeRequestPayload,
  JudgeResponsePayload,
} from '@fresh-chat-keeper/judgment-engine';

/**
 * Chrome 拡張用 Stage2Transport 実装。
 *
 * @param proxyUrl proxy のベース URL（例: `https://fresh-chat-keeper-proxy.playnicelab.workers.dev`）
 * @param token 匿名トークン（`x-fck-token` ヘッダーに設定）
 */
export function createChromeTransport(proxyUrl: string, token: string): Stage2Transport {
  return {
    async sendJudgeRequest(payload: JudgeRequestPayload): Promise<JudgeResponsePayload> {
      const res = await fetch(`${proxyUrl}/api/judge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-fck-token': token,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Stage 2 proxy error: HTTP ${res.status}`);
      }

      return (await res.json()) as JudgeResponsePayload;
    },
  };
}
