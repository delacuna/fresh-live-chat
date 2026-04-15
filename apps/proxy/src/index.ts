/**
 * SpoilerShield Proxy — Cloudflare Workers
 *
 * 役割:
 * - Chrome Extension から受け取ったチャットメッセージを Anthropic API に転送してネタバレ判定
 * - APIキーをクライアントに露出させずに安全に管理
 * - 匿名トークン検証 + IPベースのレート制限（30req/min）
 *
 * エンドポイント:
 *   POST /api/judge — Stage 2 LLM 判定
 */

export interface Env {
  ANTHROPIC_API_KEY: string;
  RATE_LIMIT_KV: KVNamespace;
}

// ─── 型定義（packages/shared の JudgeRequest / JudgeResponse と互換） ─────────

type SpoilerCategory = 'direct_spoiler' | 'foreshadowing_hint' | 'gameplay_hint' | 'safe';
type FilterVerdict = 'block' | 'allow' | 'uncertain';
type FilterMode = 'strict' | 'standard' | 'lenient';

interface UserProgress {
  gameId: string;
  progressModel: 'chapter' | 'event';
  currentChapterId?: string;
  completedEventIds?: string[];
}

interface JudgeRequest {
  messages: Array<{ id: string; text: string }>;
  /** ゲームKB使用時に指定。ジャンルテンプレートのみの場合は null 可 */
  gameId?: string | null;
  /** ゲームKB使用時に指定。ジャンルテンプレートのみの場合は null 可 */
  progress?: UserProgress | null;
  /** フィルタモード（省略時は 'standard'） */
  filterMode?: FilterMode;
  /** 有効化されているジャンルテンプレートのIDリスト */
  selectedGenreTemplates?: string[];
  /** selectedGenreTemplates の単一ジャンル版ショートハンド（テスト・外部クライアント用） */
  genre?: string;
  /** YouTubeの動画タイトル（ゲーム自動推測に使用） */
  videoTitle?: string;
}

interface FilterResult {
  messageId: string;
  verdict: FilterVerdict;
  spoilerCategory?: SpoilerCategory;
  confidence?: number;
  reason?: string;
  stage: 2;
}

interface JudgeResponse {
  results: FilterResult[];
}

// ─── ジャンルテンプレート名マッピング ─────────────────────────────────────────

const GENRE_NAMES: Record<string, string> = {
  'rpg':           'RPG',
  'mystery':       '推理・ミステリー',
  'action-horror': 'アクション・ホラー',
  'story-general': 'ストーリー全般',
};

// ─── レート制限設定 ───────────────────────────────────────────────────────────

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_SECONDS = 60;

// ─── CORS ────────────────────────────────────────────────────────────────────

const CORS_HEADERS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-spoilershield-token',
};

// ─── エントリポイント ─────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/api/judge' && request.method === 'POST') {
      return handleJudge(request, env);
    }

    return jsonError('Not Found', 404);
  },
};

// ─── /api/judge ──────────────────────────────────────────────────────────────

async function handleJudge(request: Request, env: Env): Promise<Response> {
  // 匿名トークン検証（存在チェックのみ、将来的に署名検証を追加）
  const token = request.headers.get('x-spoilershield-token');
  if (!token) {
    return jsonError('Missing x-spoilershield-token header', 401);
  }

  // レート制限
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const allowed = await checkRateLimit(ip, env.RATE_LIMIT_KV);
  if (!allowed) {
    return jsonError('Rate limit exceeded. Max 30 requests per minute.', 429);
  }

  // リクエストボディのパース
  let body: JudgeRequest;
  try {
    body = await request.json() as JudgeRequest;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError('messages must be a non-empty array', 400);
  }

  // genre（文字列）は selectedGenreTemplates（配列）のショートハンドとして正規化
  const effectiveGenreTemplates = normalizeGenreTemplates(body);

  // gameId または genre/selectedGenreTemplates のいずれかが必要
  if (!body.gameId && effectiveGenreTemplates.length === 0) {
    return jsonError('gameId or genre/selectedGenreTemplates is required', 400);
  }

  const filterMode: FilterMode = body.filterMode ?? 'standard';

  // 各メッセージを並列で LLM 判定（最大同時5件）
  const chunks = chunkArray(body.messages, 5);
  const results: FilterResult[] = [];
  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map((msg) => judgeMessage(msg, body.gameId, body.progress, filterMode, effectiveGenreTemplates, body.videoTitle, env.ANTHROPIC_API_KEY)),
    );
    results.push(...chunkResults);
  }

  const response: JudgeResponse = { results };
  return jsonOk(response);
}

// ─── レート制限 ───────────────────────────────────────────────────────────────

async function checkRateLimit(ip: string, kv: KVNamespace): Promise<boolean> {
  const windowKey = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000));
  const key = `rl:${ip}:${windowKey}`;

  const current = await kv.get(key);
  const count = current !== null ? parseInt(current, 10) : 0;

  if (count >= RATE_LIMIT_MAX) {
    return false;
  }

  await kv.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS * 2 });
  return true;
}

// ─── LLM 判定 ─────────────────────────────────────────────────────────────────

async function judgeMessage(
  message: { id: string; text: string },
  gameId: string | null | undefined,
  progress: UserProgress | null | undefined,
  filterMode: FilterMode,
  selectedGenreTemplates: string[],
  videoTitle: string | null | undefined,
  apiKey: string,
): Promise<FilterResult> {
  const progressDescription = formatProgress(progress);
  const contextDescription = buildContextDescription(gameId, progressDescription, selectedGenreTemplates, videoTitle ?? undefined);

  const prompt = `あなたはゲームのライブ配信チャットのネタバレ判定AIです。
${contextDescription}
以下のチャットメッセージを判定してください。

メッセージ: "${message.text}"

判定基準（spoiler_category）:

"direct_spoiler" — 明示的なネタバレ（重度）
  現在の進行状況より先のストーリー展開、キャラクターの生死、真相、結末などを直接的に述べている。
  例: 「○○は実は裏切り者だよ」「ラスボスは○○」

"foreshadowing_hint" — 伏線の指摘・匂わせ（中度）
  先の展開を知っている人が、初見を装いつつ特定の場面・台詞・キャラクターに注意を向けさせるコメント。
  例: 「ここ覚えておいて」「今の会話重要だよ」「この人怪しいな...（意味深）」

"gameplay_hint" — 攻略ヒント（軽度）
  次に何をすべきか、どこに行くべきかなどの指示・アドバイス。ストーリーには触れないが、初見プレイヤーの自力発見・体験を損なう。善意のアドバイスも含む。
  「負けイベ」「スルーでいい」「戦わなくていい」のようなゲームシステムに関する情報開示もこれに含む。
  例: 「左の道に行った方がいいよ」「そのボスは炎属性が弱点」「弾使わないほうがいいよ」「ここ負けイベだよ」「アイテム見逃してるよ」「探索甘くない？」

"safe" — 安全
  既に通過した内容への言及、ゲームと無関係な会話、純粋な感想、配信者への応援。

JSON形式のみで回答（余分なテキストを含めないこと）:
{
  "spoiler_category": "direct_spoiler" | "foreshadowing_hint" | "gameplay_hint" | "safe",
  "confidence": 0.0-1.0,
  "reason": "判定理由を簡潔に"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SpoilerShield] Anthropic API error ${response.status}: ${errorText}`);
      return { messageId: message.id, verdict: uncertainVerdict(filterMode), stage: 2 };
    }

    const data = await response.json() as { content: Array<{ type: string; text: string }> };
    const text = data.content[0]?.text ?? '';

    // ```json ... ``` のような余分な記法にも対応
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[SpoilerShield] Failed to extract JSON from LLM response:', text);
      return { messageId: message.id, verdict: uncertainVerdict(filterMode), stage: 2 };
    }

    const judgment = JSON.parse(jsonMatch[0]) as {
      spoiler_category: SpoilerCategory;
      confidence: number;
      reason: string;
    };

    return {
      messageId: message.id,
      verdict: categoryToVerdict(judgment.spoiler_category, filterMode),
      spoilerCategory: judgment.spoiler_category,
      confidence: judgment.confidence,
      reason: judgment.reason,
      stage: 2,
    };
  } catch (err) {
    console.error('[SpoilerShield] judgeMessage error:', err);
    return { messageId: message.id, verdict: uncertainVerdict(filterMode), stage: 2 };
  }
}

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

function formatProgress(progress: UserProgress | null | undefined): string {
  if (!progress) return '未設定（ゲーム開始前として扱う）';
  if (progress.progressModel === 'chapter' && progress.currentChapterId) {
    return `チャプター「${progress.currentChapterId}」まで通過済み`;
  }
  if (progress.progressModel === 'event' && progress.completedEventIds?.length) {
    return `通過済みイベント: ${progress.completedEventIds.join(', ')}`;
  }
  return '未設定（ゲーム開始前として扱う）';
}

/**
 * LLM プロンプト用のコンテキスト説明文を生成する。
 *
 * ジャンルテンプレートのみ使用時（ゲーム知識ベースの進行状況未設定）と
 * ゲーム知識ベースあり + ジャンルテンプレート併用の両ケースに対応する。
 */
function buildContextDescription(
  gameId: string | null | undefined,
  progressDescription: string,
  selectedGenreTemplates: string[],
  videoTitle?: string,
): string {
  const genreNames = selectedGenreTemplates
    .map((id) => GENRE_NAMES[id] ?? id)
    .filter(Boolean);

  const parts: string[] = [];

  if (genreNames.length > 0) {
    const genreLabel = genreNames.join('・');
    const hasProgress = progressDescription !== '未設定（ゲーム開始前として扱う）';
    if (hasProgress && gameId) {
      // ゲームKB + ジャンルテンプレート + 進行状況あり
      parts.push(`ユーザーは${genreLabel}ジャンルのゲームを視聴中です。`);
      parts.push(`ゲーム: ${gameId}`);
      parts.push(`現在の進行状況: ${progressDescription}`);
      parts.push(`ジャンル（テンプレート）: ${genreLabel}`);
    } else {
      // ジャンルテンプレートのみ（gameId/progress 不明）
      parts.push(`ユーザーは${genreLabel}ジャンルのゲーム配信を視聴中です。具体的なゲームタイトルや進行状況は不明です。`);
      parts.push(`ジャンル（テンプレート）: ${genreLabel}`);
    }
  } else if (gameId) {
    // ジャンルテンプレートなし（ゲーム知識ベースのみ）
    parts.push(`ゲーム: ${gameId}`);
    parts.push(`現在の進行状況: ${progressDescription}`);
  }

  // 動画タイトルが提供されている場合は追加（ゲーム自動推測に活用）
  if (videoTitle) {
    parts.push(`配信の動画タイトル: ${videoTitle}`);
    parts.push(`このタイトルからプレイ中のゲームを推測し、そのゲームの一般的な知識を踏まえてネタバレ判定を行ってください。ゲーム知識ベースが提供されている場合はそちらを優先してください。`);
    parts.push(`注意: タイトルに「ネタバレあり」等の表記がある場合、これは「この配信自体にネタバレが含まれる」という未プレイ視聴者への注意書きであり、チャットでのネタバレコメントを視聴者に許可しているわけではありません。チャットコメントの判定基準はこの表記に関わらず同じように適用してください。`);
  }

  return parts.join('\n');
}

/** LLM 判定失敗時の verdict をモードに応じて決定する。lenient では安全側（allow）に倒す。 */
function uncertainVerdict(filterMode: FilterMode): FilterVerdict {
  return filterMode === 'lenient' ? 'allow' : 'uncertain';
}

function categoryToVerdict(category: SpoilerCategory, filterMode: FilterMode): FilterVerdict {
  switch (category) {
    case 'direct_spoiler':
      return 'block';
    case 'foreshadowing_hint':
      return filterMode === 'lenient' ? 'allow' : 'block';
    case 'gameplay_hint':
      return filterMode === 'strict' ? 'block' : 'allow';
    case 'safe':
      return 'allow';
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * genre（文字列）と selectedGenreTemplates（配列）を統合して有効なIDリストを返す。
 * genre は外部クライアント・テスト用のショートハンドで、selectedGenreTemplates が優先される。
 */
function normalizeGenreTemplates(body: JudgeRequest): string[] {
  if (body.selectedGenreTemplates && body.selectedGenreTemplates.length > 0) {
    return body.selectedGenreTemplates;
  }
  if (body.genre) {
    return [body.genre];
  }
  return [];
}

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
