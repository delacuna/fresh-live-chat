import { describe, it, expect } from 'vitest';
import {
  createMockTransport,
  createFailingTransport,
} from '../../src/stage2/api-client.js';

describe('api-client (Stage 2 Transport抽象)', () => {
  describe('createMockTransport', () => {
    it('passes payload to handler and returns its response', async () => {
      const transport = createMockTransport((payload) => ({
        results: payload.messages.map((m) => ({
          messageId: m.id,
          verdict: 'allow',
          stage: 2,
        })),
      }));
      const result = await transport.sendJudgeRequest({
        messages: [{ id: 'm1', text: 'hi' }],
      });
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.messageId).toBe('m1');
      expect(result.results[0]?.verdict).toBe('allow');
    });

    it('supports async handler', async () => {
      const transport = createMockTransport(async (payload) => {
        await new Promise((r) => setTimeout(r, 1));
        return {
          results: payload.messages.map((m) => ({
            messageId: m.id,
            verdict: 'block',
            stage: 2,
          })),
        };
      });
      const result = await transport.sendJudgeRequest({
        messages: [{ id: 'mx', text: 'spoiler' }],
      });
      expect(result.results[0]?.verdict).toBe('block');
    });

    it('rejects when handler throws', async () => {
      const transport = createMockTransport(() => {
        throw new Error('mock failure');
      });
      await expect(
        transport.sendJudgeRequest({ messages: [{ id: 'm1', text: 'x' }] }),
      ).rejects.toThrow('mock failure');
    });
  });

  describe('createFailingTransport', () => {
    it('always rejects with default error', async () => {
      const transport = createFailingTransport();
      await expect(
        transport.sendJudgeRequest({ messages: [] }),
      ).rejects.toThrow('Transport unavailable');
    });

    it('uses custom error when provided', async () => {
      const transport = createFailingTransport(new Error('502 Bad Gateway'));
      await expect(
        transport.sendJudgeRequest({ messages: [] }),
      ).rejects.toThrow('502 Bad Gateway');
    });
  });
});
