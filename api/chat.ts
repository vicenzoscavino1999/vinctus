import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createGroupAction, type CreateGroupArgs } from './lib/aiActions.js';
import { getAuth } from './lib/firebaseAdmin.js';
import { checkRateLimit } from './lib/rateLimit.js';

const DEFAULT_GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-flash-latest'] as const;
const DEFAULT_NVIDIA_MODEL = 'moonshotai/kimi-k2-instruct';
const DEFAULT_NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
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

interface OpenAIChatCompletionsResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
      tool_calls?: Array<{
        function?: {
          arguments?: string;
          name?: string;
        };
      }>;
    };
  }>;
}

interface FirebaseAccountsLookupResponse {
  users?: Array<{
    localId?: string;
  }>;
}

type AIProvider = 'gemini' | 'nvidia';
type AICallErrorCode = 'invalid_response' | 'network' | 'rate_limit' | 'timeout' | 'upstream';

type AICallResult =
  | {
      data: {
        functionCall?: GeminiFunctionCall;
        responseText: string | null;
      };
      ok: true;
    }
  | {
      code: AICallErrorCode;
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

const CREATE_GROUP_FUNCTION_DECLARATION = {
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
};

const GEMINI_TOOLS = [
  {
    functionDeclarations: [CREATE_GROUP_FUNCTION_DECLARATION],
  },
];

const OPENAI_TOOLS = [
  {
    function: CREATE_GROUP_FUNCTION_DECLARATION,
    type: 'function',
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

function parseModelList(value: string | undefined, fallback: readonly string[]): string[] {
  const parsed = (value ?? '')
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(parsed));
  return unique.length > 0 ? unique : [...fallback];
}

function normalizeSecret(value: string | undefined): string {
  return value ? value.trim().replace(/^['"]|['"]$/g, '') : '';
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const normalized = (value ?? fallback).trim().replace(/\/+$/, '');
  return normalized || fallback;
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

function getUpstreamTimeoutMs(): number {
  return parseNumberEnv(
    process.env.AI_TIMEOUT_MS ?? process.env.GEMINI_TIMEOUT_MS,
    12_000,
    2_000,
    30_000,
  );
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

function getFirebaseWebApiKey(): string {
  return normalizeSecret(process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY);
}

async function verifyIdTokenWithIdentityToolkit(token: string): Promise<string | null> {
  const webApiKey = getFirebaseWebApiKey();
  if (!webApiKey) {
    return null;
  }

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${webApiKey}`,
      {
        body: JSON.stringify({ idToken: token }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response
      .json()
      .catch(() => null)) as FirebaseAccountsLookupResponse | null;
    const uid = payload?.users?.[0]?.localId;
    return typeof uid === 'string' && uid.trim().length > 0 ? uid : null;
  } catch {
    return null;
  }
}

async function verifyAuthUid(token: string): Promise<string | null> {
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return decoded.uid;
  } catch (error) {
    const fallbackUid = await verifyIdTokenWithIdentityToolkit(token);
    if (fallbackUid) {
      console.warn('[chat-api] verifyIdToken failed, recovered with Identity Toolkit');
      return fallbackUid;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[chat-api] auth token verification failed: ${truncateForLog(message, 220)}`);
    return null;
  }
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

function detectRateLimit(status: number, bodyText: string): boolean {
  const normalized = bodyText.toLowerCase();
  return (
    status === 429 ||
    normalized.includes('resource_exhausted') ||
    normalized.includes('rate limit') ||
    normalized.includes('quota')
  );
}

function extractTextFromOpenAIContent(content: unknown): string | null {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed ? trimmed : null;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return '';
        }
        const record = item as Record<string, unknown>;
        return typeof record.text === 'string' ? record.text : '';
      })
      .filter((value) => value.trim().length > 0);
    if (parts.length > 0) {
      return parts.join('\n');
    }
  }
  return null;
}

function parseToolCallArgs(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function buildOpenAIMessages(
  contents: GeminiMessage[],
  systemInstruction: { parts: { text: string }[] },
): Array<{ content: string; role: 'assistant' | 'system' | 'user' }> {
  const systemText = systemInstruction.parts
    .map((part) => part.text)
    .join('\n')
    .trim();
  const messages: Array<{ content: string; role: 'assistant' | 'system' | 'user' }> = [];
  if (systemText) {
    messages.push({ content: systemText, role: 'system' });
  }
  for (const message of contents) {
    const text = message.parts
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join('\n');
    if (!text) {
      continue;
    }
    messages.push({
      content: text,
      role: message.role === 'model' ? 'assistant' : 'user',
    });
  }
  return messages;
}

async function callGeminiAPI(
  model: string,
  apiKey: string,
  contents: GeminiMessage[],
  systemInstruction: { parts: { text: string }[] },
): Promise<AICallResult> {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getUpstreamTimeoutMs());

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
      if (detectRateLimit(response.status, responseText)) {
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

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const functionCall = parts.find((part) => part.functionCall)?.functionCall;
    const responseText =
      parts.find((part) => typeof part.text === 'string' && part.text.trim().length > 0)?.text ??
      null;

    return {
      data: {
        functionCall,
        responseText,
      },
      ok: true,
    };
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

async function callNVIDIAAPI(
  model: string,
  apiKey: string,
  baseUrl: string,
  contents: GeminiMessage[],
  systemInstruction: { parts: { text: string }[] },
): Promise<AICallResult> {
  const url = `${baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getUpstreamTimeoutMs());

  try {
    const response = await fetch(url, {
      body: JSON.stringify({
        max_tokens: 1024,
        messages: buildOpenAIMessages(contents, systemInstruction),
        model,
        temperature: 0.7,
        tool_choice: 'auto',
        tools: OPENAI_TOOLS,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText = truncateForLog(
        (await response.text().catch(() => 'upstream error')) || 'upstream error',
      );
      if (detectRateLimit(response.status, responseText)) {
        return { code: 'rate_limit', message: responseText, ok: false, status: 429 };
      }
      return {
        code: 'upstream',
        message: `upstream_${response.status}:${responseText}`,
        ok: false,
        status: 502,
      };
    }

    const data = (await response.json().catch(() => null)) as OpenAIChatCompletionsResponse | null;
    if (!data || typeof data !== 'object') {
      return { code: 'invalid_response', message: 'invalid_json', ok: false, status: 502 };
    }

    const message = data.choices?.[0]?.message;
    if (!message || typeof message !== 'object') {
      return { code: 'invalid_response', message: 'missing_message', ok: false, status: 502 };
    }

    const toolCall = message.tool_calls?.find(
      (entry) => entry?.function?.name && typeof entry.function.name === 'string',
    );
    const functionCall = toolCall?.function?.name
      ? {
          args: parseToolCallArgs(toolCall.function.arguments),
          name: toolCall.function.name,
        }
      : undefined;
    const responseText = extractTextFromOpenAIContent(message.content);

    return {
      data: {
        functionCall,
        responseText,
      },
      ok: true,
    };
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

  const geminiApiKey = normalizeSecret(
    process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY,
  );
  const nvidiaApiKey = normalizeSecret(process.env.NVIDIA_API_KEY);
  const nvidiaBaseUrl = normalizeBaseUrl(process.env.NVIDIA_BASE_URL, DEFAULT_NVIDIA_BASE_URL);
  if (!geminiApiKey && !nvidiaApiKey) {
    console.error('[chat-api] missing API keys (GEMINI_API_KEY or NVIDIA_API_KEY)');
    return res.status(500).json({ error: 'AI service not configured' });
  }

  const clientIp = getClientIp(req);
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const authUid = await verifyAuthUid(token);
  if (!authUid) {
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
    ...(validation.value.history ?? []),
    { parts: [{ text: validation.value.message }], role: 'user' },
  ];

  const geminiModels = parseModelList(process.env.GEMINI_MODELS, DEFAULT_GEMINI_MODELS);
  const nvidiaModels = parseModelList(process.env.NVIDIA_MODEL, [DEFAULT_NVIDIA_MODEL]);
  const systemInstruction = buildSystemInstruction();

  const attempts: Array<{
    model: string;
    provider: AIProvider;
    run: () => Promise<AICallResult>;
  }> = [];

  if (geminiApiKey) {
    for (const model of geminiModels) {
      attempts.push({
        model,
        provider: 'gemini',
        run: () => callGeminiAPI(model, geminiApiKey, contents, systemInstruction),
      });
    }
  }

  if (nvidiaApiKey) {
    for (const model of nvidiaModels) {
      attempts.push({
        model,
        provider: 'nvidia',
        run: () => callNVIDIAAPI(model, nvidiaApiKey, nvidiaBaseUrl, contents, systemInstruction),
      });
    }
  }

  let usedModel = '';
  let usedProvider: AIProvider = geminiApiKey ? 'gemini' : 'nvidia';
  let latestFailure: Extract<AICallResult, { ok: false }> | null = null;
  let successData: Extract<AICallResult, { ok: true }>['data'] | null = null;

  for (const attempt of attempts) {
    const result = await attempt.run();
    usedModel = attempt.model;
    usedProvider = attempt.provider;
    if (result.ok) {
      successData = result.data;
      break;
    }
    latestFailure = result;
    console.warn(
      `[chat-api] provider=${attempt.provider} model=${attempt.model} code=${result.code} msg=${result.message}`,
    );
  }

  if (!successData) {
    const errorCode = latestFailure?.code ?? 'upstream';
    if (errorCode === 'rate_limit') {
      return res.status(429).json({ error: 'AI provider rate limit reached' });
    }
    if (errorCode === 'timeout') {
      return res.status(504).json({ error: 'AI provider timeout' });
    }
    return res.status(502).json({ error: 'Error communicating with AI service' });
  }

  const functionCall = successData.functionCall;
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
        provider: usedProvider,
        response: confirmation,
      });
    } catch {
      return res.status(500).json({
        history: [
          ...contents,
          { parts: [{ text: 'No pude crear el grupo. Intenta nuevamente.' }], role: 'model' },
        ],
        model: usedModel,
        provider: usedProvider,
        response: 'No pude crear el grupo. Intenta nuevamente.',
      });
    }
  }

  const responseText = successData.responseText ?? 'Lo siento, no pude generar una respuesta.';

  return res.status(200).json({
    history: [...contents, { parts: [{ text: responseText }], role: 'model' }],
    model: usedModel,
    provider: usedProvider,
    response: responseText,
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
  runtime: 'nodejs',
};
