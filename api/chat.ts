import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createGroupAction, type CreateGroupArgs } from './lib/aiActions.js';
import { getAuth } from './lib/firebaseAdmin.js';
import { checkRateLimit } from './lib/rateLimit.js';

const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-flash-latest'] as const;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;
const MAX_PART_TEXT_CHARS = 2000;
const MAX_PARTS_PER_MESSAGE = 2;
const MAX_TOTAL_HISTORY_CHARS = 12_000;

interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface GeminiFunctionCall {
  name: string;
  args?: Record<string, unknown>;
}

interface ChatRequest {
  history?: GeminiMessage[];
  message: string;
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        functionCall?: GeminiFunctionCall;
        text?: string;
      }>;
    };
  }>;
}

type GeminiErrorCode = 'invalid_response' | 'network' | 'rate_limit' | 'timeout' | 'upstream';

type GeminiCallResult =
  | {
      data: GeminiApiResponse;
      ok: true;
    }
  | {
      code: GeminiErrorCode;
      message: string;
      ok: false;
      status: number;
    };

type ValidationResult =
  | { ok: true; value: ChatRequest }
  | { error: string; ok: false; status: number };

class PayloadTooLargeError extends Error {
  constructor() {
    super('Payload too large');
    this.name = 'PayloadTooLargeError';
  }
}

const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        description: 'Crea un grupo en Vinctus para el usuario autenticado.',
        name: 'createGroup',
        parameters: {
          properties: {
            description: { description: 'Descripcion del grupo', type: 'string' },
            name: { description: 'Nombre del grupo', type: 'string' },
            visibility: { enum: ['public', 'private'], type: 'string' },
          },
          required: ['name'],
          type: 'object',
        },
      },
    ],
  },
];

function parseNumberEnv(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function getRateLimitConfig() {
  return {
    ip: {
      day: parseNumberEnv(process.env.CHAT_IP_DAY_LIMIT, 2000, 50, 50_000),
      minute: parseNumberEnv(process.env.CHAT_IP_MINUTE_LIMIT, 60, 5, 2000),
    },
    user: {
      day: parseNumberEnv(process.env.CHAT_USER_DAY_LIMIT, 300, 20, 10_000),
      minute: parseNumberEnv(process.env.CHAT_USER_MINUTE_LIMIT, 20, 2, 500),
    },
  };
}

function getGeminiTimeoutMs(): number {
  return parseNumberEnv(process.env.GEMINI_TIMEOUT_MS, 12_000, 2_000, 30_000);
}

function truncateForLog(value: string, maxChars = 180): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}...`;
}

function getHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0] ?? null;
  }
  return null;
}

function getClientIp(req: VercelRequest): string {
  const forwarded = getHeaderValue(req.headers['x-forwarded-for']);
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  const remote = req.socket?.remoteAddress?.trim();
  return remote || 'unknown';
}

function extractBearerToken(req: VercelRequest): string | null {
  const authHeader = getHeaderValue(req.headers.authorization);
  if (!authHeader) {
    return null;
  }
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

async function readRawBody(req: VercelRequest, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        reject(new PayloadTooLargeError());
        return;
      }
      chunks.push(buffer);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

async function parseRequestBody(req: VercelRequest): Promise<unknown> {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }
  const raw = await readRawBody(req, MAX_BODY_BYTES);
  if (!raw.trim()) {
    return {};
  }
  return JSON.parse(raw);
}

function validateChatRequest(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Invalid JSON body', ok: false, status: 400 };
  }
  const data = input as Record<string, unknown>;
  const keys = Object.keys(data);
  if (keys.some((key) => key !== 'message' && key !== 'history')) {
    return { error: 'Body contains unsupported fields', ok: false, status: 400 };
  }
  if (typeof data.message !== 'string') {
    return { error: 'Message is required', ok: false, status: 400 };
  }
  const message = data.message.trim();
  if (!message) {
    return { error: 'Message is required', ok: false, status: 400 };
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return {
      error: `Message exceeds ${MAX_MESSAGE_CHARS} characters`,
      ok: false,
      status: 400,
    };
  }

  const historyRaw = data.history ?? [];
  if (!Array.isArray(historyRaw)) {
    return { error: 'History must be an array', ok: false, status: 400 };
  }
  if (historyRaw.length > MAX_HISTORY_MESSAGES) {
    return {
      error: `History exceeds ${MAX_HISTORY_MESSAGES} messages`,
      ok: false,
      status: 400,
    };
  }

  let totalChars = 0;
  const history: GeminiMessage[] = [];

  for (const item of historyRaw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { error: 'History contains invalid entries', ok: false, status: 400 };
    }
    const entry = item as Record<string, unknown>;
    const entryKeys = Object.keys(entry);
    if (entryKeys.some((key) => key !== 'role' && key !== 'parts')) {
      return { error: 'History entry contains unsupported fields', ok: false, status: 400 };
    }
    if (entry.role !== 'user' && entry.role !== 'model') {
      return { error: 'History role is invalid', ok: false, status: 400 };
    }
    if (
      !Array.isArray(entry.parts) ||
      entry.parts.length < 1 ||
      entry.parts.length > MAX_PARTS_PER_MESSAGE
    ) {
      return { error: 'History parts are invalid', ok: false, status: 400 };
    }

    const parts: { text: string }[] = [];
    for (const part of entry.parts) {
      if (!part || typeof part !== 'object' || Array.isArray(part)) {
        return { error: 'History part is invalid', ok: false, status: 400 };
      }
      const parsedPart = part as Record<string, unknown>;
      if (Object.keys(parsedPart).some((key) => key !== 'text')) {
        return { error: 'History part contains unsupported fields', ok: false, status: 400 };
      }
      if (typeof parsedPart.text !== 'string') {
        return { error: 'History text must be a string', ok: false, status: 400 };
      }
      const text = parsedPart.text.trim();
      if (!text) {
        return { error: 'History text cannot be empty', ok: false, status: 400 };
      }
      if (text.length > MAX_PART_TEXT_CHARS) {
        return {
          error: `History text exceeds ${MAX_PART_TEXT_CHARS} characters`,
          ok: false,
          status: 400,
        };
      }
      totalChars += text.length;
      if (totalChars > MAX_TOTAL_HISTORY_CHARS) {
        return {
          error: `History exceeds ${MAX_TOTAL_HISTORY_CHARS} total characters`,
          ok: false,
          status: 400,
        };
      }
      parts.push({ text });
    }

    history.push({
      parts,
      role: entry.role,
    });
  }

  return {
    ok: true,
    value: {
      history,
      message,
    },
  };
}

async function callGeminiAPI(
  model: string,
  apiKey: string,
  contents: GeminiMessage[],
  systemInstruction: { parts: { text: string }[] },
): Promise<GeminiCallResult> {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getGeminiTimeoutMs());

  try {
    const response = await fetch(url, {
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
        },
        systemInstruction,
        tools: GEMINI_TOOLS,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText = truncateForLog(
        (await response.text().catch(() => 'upstream error')) || 'upstream error',
      );
      const isRateLimit =
        response.status === 429 ||
        responseText.includes('RESOURCE_EXHAUSTED') ||
        responseText.toLowerCase().includes('quota') ||
        responseText.toLowerCase().includes('rate limit');
      if (isRateLimit) {
        return { code: 'rate_limit', message: responseText, ok: false, status: 429 };
      }
      return {
        code: 'upstream',
        message: `upstream_${response.status}:${responseText}`,
        ok: false,
        status: 502,
      };
    }

    const data = (await response.json().catch(() => null)) as GeminiApiResponse | null;
    if (!data || typeof data !== 'object') {
      return { code: 'invalid_response', message: 'invalid_json', ok: false, status: 502 };
    }
    return { data, ok: true };
  } catch (error) {
    const maybeError = error as { name?: string; message?: string };
    if (maybeError?.name === 'AbortError') {
      return { code: 'timeout', message: 'request_timeout', ok: false, status: 504 };
    }
    return {
      code: 'network',
      message: truncateForLog(maybeError?.message ?? 'network_error'),
      ok: false,
      status: 502,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildSystemInstruction(): { parts: { text: string }[] } {
  return {
    parts: [
      {
        text:
          'Eres un asistente integrado en Vinctus. Responde de forma clara, breve y util. ' +
          'Si te piden crear un grupo, usa la herramienta createGroup. ' +
          'Responde en espanol, salvo que el usuario use otro idioma.',
      },
    ],
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKeyRaw = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const apiKey = apiKeyRaw ? apiKeyRaw.trim().replace(/^['"]|['"]$/g, '') : '';
  if (!apiKey) {
    console.error('[chat-api] missing api key');
    return res.status(500).json({ error: 'AI service not configured' });
  }

  const clientIp = getClientIp(req);
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let authUid: string;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    authUid = decoded.uid;
  } catch {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }

  const rateLimits = getRateLimitConfig();
  const userLimit = checkRateLimit(authUid, {
    dayLimit: rateLimits.user.day,
    keyPrefix: 'chat-user',
    minuteLimit: rateLimits.user.minute,
  });
  const ipLimit = checkRateLimit(clientIp, {
    dayLimit: rateLimits.ip.day,
    keyPrefix: 'chat-ip',
    minuteLimit: rateLimits.ip.minute,
  });
  if (!userLimit.allowed || !ipLimit.allowed) {
    const retryAfterSeconds = Math.max(userLimit.retryAfterSeconds, ipLimit.retryAfterSeconds);
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfterSeconds,
    });
  }

  let payload: unknown;
  try {
    payload = await parseRequestBody(req);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return res.status(413).json({ error: 'Request payload too large' });
    }
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const validation = validateChatRequest(payload);
  if (!validation.ok) {
    return res.status(validation.status).json({ error: validation.error });
  }

  const contents: GeminiMessage[] = [
    ...validation.value.history,
    { parts: [{ text: validation.value.message }], role: 'user' },
  ];

  const systemInstruction = buildSystemInstruction();
  let usedModel = '';
  let latestFailure: GeminiCallResult | null = null;
  let successData: GeminiApiResponse | null = null;

  for (const model of GEMINI_MODELS) {
    const result = await callGeminiAPI(model, apiKey, contents, systemInstruction);
    usedModel = model;
    if (result.ok) {
      successData = result.data;
      break;
    }
    latestFailure = result;
    console.warn(`[chat-api] model=${model} code=${result.code} msg=${result.message}`);
  }

  if (!successData) {
    const errorCode = latestFailure?.ok === false ? latestFailure.code : 'upstream';
    if (errorCode === 'rate_limit') {
      return res.status(429).json({ error: 'AI provider rate limit reached' });
    }
    if (errorCode === 'timeout') {
      return res.status(504).json({ error: 'AI provider timeout' });
    }
    return res.status(502).json({ error: 'Error communicating with AI service' });
  }

  const parts = successData.candidates?.[0]?.content?.parts ?? [];
  const functionCall = parts.find((part) => part.functionCall)?.functionCall;

  if (functionCall?.name === 'createGroup') {
    const rawArgs = (functionCall.args ?? {}) as Record<string, unknown>;
    const args: CreateGroupArgs = {
      description: typeof rawArgs.description === 'string' ? rawArgs.description : null,
      name: typeof rawArgs.name === 'string' ? rawArgs.name : '',
      visibility: rawArgs.visibility === 'private' ? 'private' : 'public',
    };

    try {
      const result = await createGroupAction(authUid, args);
      const confirmation = `Listo. Cree el grupo "${result.name}" (${result.visibility}). Puedes verlo en /group/${result.groupId}.`;
      return res.status(200).json({
        action: { groupId: result.groupId, type: 'createGroup' },
        history: [...contents, { parts: [{ text: confirmation }], role: 'model' }],
        model: usedModel,
        response: confirmation,
      });
    } catch {
      return res.status(500).json({
        history: [
          ...contents,
          { parts: [{ text: 'No pude crear el grupo. Intenta nuevamente.' }], role: 'model' },
        ],
        model: usedModel,
        response: 'No pude crear el grupo. Intenta nuevamente.',
      });
    }
  }

  const responseText =
    parts.find((part) => typeof part.text === 'string' && part.text.trim().length > 0)?.text ??
    'Lo siento, no pude generar una respuesta.';

  return res.status(200).json({
    history: [...contents, { parts: [{ text: responseText }], role: 'model' }],
    model: usedModel,
    response: responseText,
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
  runtime: 'nodejs',
};
