/**
 * Stage 2 バッチ判定。
 *
 * 短時間に集中する個別 enqueue を200msウィンドウで集約し、同一コンテキストの
 * メッセージをまとめて Transport へ送ることでAPI料金とレイテンシを最適化する。
 *
 * 仕様（dev-docs/phase-2-engine-split.md §バッチ判定、TASKS.md §P2-STAGE2-04）:
 * - 200ms ウィンドウで集約（windowMs オプションで調整可）
 * - 最大 20 件到達で即送信（maxBatch オプションで調整可）
 * - 同一コンテキストキーのメッセージのみ同じバッチに入る
 * - キャッシュヒットしたメッセージはバッチに含めず即返却
 * - 例外発生時は当該グループの全 pending を reject
 *
 * 設計上の注意:
 * - chrome.* / Web API には依存しない（Transport / Cache を DI で受ける）
 * - コンテキストグループ化キーは `getProgressSignature` を再利用（キャッシュと同じ基準）
 *
 * @see dev-docs/phase-2-engine-split.md §バッチ判定
 */

import type {
  Judgment,
  JudgmentContext,
  Message,
  Stage2Transport,
  JudgeRequestPayload,
  JudgmentLabel,
} from '../types.js';
import type { JudgmentCache } from './cache.js';
import type { ModelTier } from './model-router.js';
import { getProgressSignature } from '../utils/progress-signature.js';

/** Stage2Batcher の構成オプション */
export interface Stage2BatcherOptions {
  /** Stage 2 通信の抽象実装（chrome / workers / mock を呼び出し側で差し替え） */
  transport: Stage2Transport;
  /** 判定キャッシュ。null の場合キャッシュをスキップする */
  cache?: JudgmentCache | null;
  /** プロキシ／API へ送信するティア情報 */
  modelTier: ModelTier;
  /** 集約ウィンドウ（ミリ秒）。デフォルト 200ms */
  windowMs?: number;
  /** 1バッチの最大件数。デフォルト 20 件 */
  maxBatch?: number;
}

const DEFAULT_WINDOW_MS = 200;
const DEFAULT_MAX_BATCH = 20;

interface PendingMessage {
  message: Message;
  context: JudgmentContext;
  resolve: (judgment: Judgment) => void;
  reject: (error: Error) => void;
}

/**
 * 短時間に集中する `enqueue` 呼び出しをコンテキストグループ別に集約し、
 * Transport 経由で Stage 2 判定を実行するバッチャー。
 *
 * 利用例:
 * ```typescript
 * const batcher = new Stage2Batcher({ transport, cache, modelTier: 'free' });
 * const judgment = await batcher.enqueue(message, context);
 * ```
 */
export class Stage2Batcher {
  private readonly transport: Stage2Transport;
  private readonly cache: JudgmentCache | null;
  private readonly modelTier: ModelTier;
  private readonly windowMs: number;
  private readonly maxBatch: number;

  /** コンテキストキーごとに保留中メッセージを蓄積 */
  private readonly pendingByKey = new Map<string, PendingMessage[]>();

  /** コンテキストキーごとに flush タイマー ID を保持 */
  private readonly timersByKey = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: Stage2BatcherOptions) {
    this.transport = options.transport;
    this.cache = options.cache ?? null;
    this.modelTier = options.modelTier;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.maxBatch = options.maxBatch ?? DEFAULT_MAX_BATCH;
  }

  /**
   * メッセージをバッチに登録し、判定結果を Promise で返す。
   *
   * 同期的に複数回呼ばれた場合、同一コンテキストのメッセージは200ms ウィンドウで
   * 集約されて1回の Transport 呼び出しにまとめられる。
   * キャッシュにヒットした場合はバッチを通らず即時 resolve する。
   */
  async enqueue(message: Message, context: JudgmentContext): Promise<Judgment> {
    // キャッシュ参照（hit したら即返却、バッチに含めない）
    if (this.cache) {
      const cached = await this.cache.get(message.text, context);
      if (cached) {
        return { ...cached, messageId: message.id };
      }
    }

    return new Promise<Judgment>((resolve, reject) => {
      const key = this.contextKey(context);
      const list = this.pendingByKey.get(key) ?? [];
      list.push({ message, context, resolve, reject });
      this.pendingByKey.set(key, list);

      // 最大件数到達 → 即送信
      if (list.length >= this.maxBatch) {
        this.flush(key);
        return;
      }

      // タイマー未起動なら起動
      if (!this.timersByKey.has(key)) {
        const timer = setTimeout(() => this.flush(key), this.windowMs);
        this.timersByKey.set(key, timer);
      }
    });
  }

  /** 指定キーのバッチを即時送信する（タイマー解除も行う） */
  private flush(key: string): void {
    const list = this.pendingByKey.get(key);
    this.pendingByKey.delete(key);

    const timer = this.timersByKey.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timersByKey.delete(key);
    }

    if (!list || list.length === 0) return;

    // group の context は全て同じキー＝判定で渡すコンテキストとして代表値を採用
    const groupContext = list[0].context;
    void this.processGroup(list, groupContext);
  }

  /** バッチ内メッセージを Transport へ送信し、各 pending に判定を割り当てる */
  private async processGroup(group: PendingMessage[], context: JudgmentContext): Promise<void> {
    const payload: JudgeRequestPayload = {
      messages: group.map((p) => ({ id: p.message.id, text: p.message.text })),
      gameId: context.game?.gameId ?? null,
      progress: progressForRequest(context),
      filterMode: context.settings.categories.spoiler.strength,
      selectedGenreTemplates: context.game?.genreTemplate ? [context.game.genreTemplate] : undefined,
      videoTitle: context.game?.gameTitle,
      tier: this.modelTier,
    };

    let response;
    try {
      response = await this.transport.sendJudgeRequest(payload);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      for (const pending of group) pending.reject(error);
      return;
    }

    // 各メッセージの結果を messageId で突き合わせる
    const resultById = new Map(response.results.map((r) => [r.messageId, r]));

    for (const pending of group) {
      const result = resultById.get(pending.message.id);
      if (!result) {
        pending.reject(new Error(`No judgment returned for message ${pending.message.id}`));
        continue;
      }

      const judgment: Judgment = {
        messageId: pending.message.id,
        labels: [verdictToLabel(result)],
        primary: verdictToLabel(result),
        confidence: result.confidence ?? 0.5,
        stage: 'stage2',
        ...(result.reason ? { reasonJa: result.reason } : {}),
        fromCache: false,
      };

      // キャッシュ書き込み（best effort、エラーは握りつぶす）
      if (this.cache) {
        this.cache.set(pending.message.text, pending.context, judgment).catch(() => {
          /* cache failures should not propagate */
        });
      }

      pending.resolve(judgment);
    }
  }

  /**
   * コンテキストキーを生成する。
   * 同じ gameId / 進行状況 / フィルタ強度 / ジャンルテンプレート の組み合わせは同じキー。
   */
  private contextKey(context: JudgmentContext): string {
    const game = context.game;
    return [
      game?.gameId ?? '-',
      getProgressSignature(game),
      context.settings.categories.spoiler.strength,
      game?.genreTemplate ?? '-',
      game?.gameTitle ?? '-',
    ].join('|');
  }
}

/** プロキシAPI契約（{@link import('@fresh-chat-keeper/shared').UserProgress}）に合わせて整形 */
function progressForRequest(
  context: JudgmentContext,
): JudgeRequestPayload['progress'] {
  const game = context.game;
  if (!game || !game.gameId || game.progressType === 'none') return null;

  if (game.progressType === 'chapter') {
    return {
      gameId: game.gameId,
      progressModel: 'chapter',
      currentChapterId: game.currentChapter,
    };
  }
  return {
    gameId: game.gameId,
    progressModel: 'event',
    completedEventIds: game.completedEvents ?? [],
  };
}

/**
 * proxy 由来の verdict / spoilerCategory を {@link JudgmentLabel} へマップする。
 * Phase 2 では `'safe' | 'spoiler'` の2値のみ。
 */
function verdictToLabel(result: { verdict: string }): JudgmentLabel {
  return result.verdict === 'allow' ? 'safe' : 'spoiler';
}
