import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from './lib/rateLimit.js';

const { mockCreateGroupAction, mockVerifyIdToken, mockGetUserDoc, mockGetUserDocGet } = vi.hoisted(
  () => ({
    mockCreateGroupAction: vi.fn(),
    mockVerifyIdToken: vi.fn(),
    mockGetUserDoc: vi.fn(),
    mockGetUserDocGet: vi.fn(),
  }),
);

vi.mock('./lib/firebaseAdmin.js', () => ({
  getAuth: () => ({
    verifyIdToken: mockVerifyIdToken,
  }),
  getDb: () => ({
    doc: mockGetUserDoc,
  }),
}));

vi.mock('./lib/aiActions.js', () => ({
  createGroupAction: mockCreateGroupAction,
}));

import handler from './chat';

interface MockResponseResult {
  headers: Record<string, string>;
  payload: unknown;
  statusCode: number;
}

function createReq(options?: {
  authorization?: string;
  body?: unknown;
  ip?: string;
  method?: string;
}): VercelRequest {
  const method = options?.method ?? 'POST';
  const body = options?.body ?? { message: 'hola' };
  const authorization = options?.authorization;
  const ip = options?.ip ?? '127.0.0.1';

  return {
    body,
    headers: {
      ...(authorization ? { authorization } : {}),
      'x-forwarded-for': ip,
    },
    method,
    on: vi.fn(),
    socket: { remoteAddress: ip },
  } as unknown as VercelRequest;
}

function createRes(result: MockResponseResult): VercelResponse {
  const res = {
    json: vi.fn((payload: unknown) => {
      result.payload = payload;
      return res;
    }),
    setHeader: vi.fn((key: string, value: string) => {
      result.headers[key] = value;
      return res;
    }),
    status: vi.fn((statusCode: number) => {
      result.statusCode = statusCode;
      return res;
    }),
  };

  return res as unknown as VercelResponse;
}

function createSuccessfulUpstreamResponse(text = 'ok'): Response {
  return {
    json: vi.fn(async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    })),
    ok: true,
    text: vi.fn(async () => ''),
  } as unknown as Response;
}

function createNvidiaSuccessResponse(text = 'ok'): Response {
  return {
    json: vi.fn(async () => ({
      choices: [{ message: { content: text } }],
    })),
    ok: true,
    text: vi.fn(async () => ''),
  } as unknown as Response;
}

describe('api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_MODELS = '';
    process.env.CHAT_USER_MINUTE_LIMIT = '20';
    process.env.CHAT_USER_DAY_LIMIT = '300';
    process.env.CHAT_IP_MINUTE_LIMIT = '60';
    process.env.CHAT_IP_DAY_LIMIT = '2000';
    process.env.NVIDIA_API_KEY = '';
    process.env.NVIDIA_BASE_URL = '';
    process.env.NVIDIA_MODEL = '';
    process.env.FIREBASE_WEB_API_KEY = '';
    process.env.VITE_FIREBASE_API_KEY = '';
    mockVerifyIdToken.mockResolvedValue({ uid: 'user_1' });
    mockGetUserDocGet.mockResolvedValue({
      data: () => ({
        settings: {
          ai: {
            consentGranted: true,
          },
        },
      }),
      exists: true,
    });
    mockGetUserDoc.mockReturnValue({
      get: mockGetUserDocGet,
    });
    mockCreateGroupAction.mockResolvedValue({
      groupId: 'group_1',
      name: 'Grupo',
      visibility: 'public',
    });
  });

  it('requires bearer auth even if body contains idToken', async () => {
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    const req = createReq({
      body: { idToken: 'fake', message: 'hola' },
    });
    const res = createRes(result);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await handler(req, res);

    expect(result.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized messages', async () => {
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    const req = createReq({
      authorization: 'Bearer token_1',
      body: { message: 'x'.repeat(2001) },
    });
    const res = createRes(result);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await handler(req, res);

    expect(result.statusCode).toBe(400);
    expect(result.payload).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('exceeds'),
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('applies per-user rate limiting', async () => {
    process.env.CHAT_USER_MINUTE_LIMIT = '2';
    process.env.CHAT_USER_DAY_LIMIT = '5';

    const fetchMock = vi.fn().mockResolvedValue(createSuccessfulUpstreamResponse('respuesta'));
    vi.stubGlobal('fetch', fetchMock);

    const firstResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ authorization: 'Bearer token_1', body: { message: 'hola 1' } }),
      createRes(firstResult),
    );
    expect(firstResult.statusCode).toBe(200);

    const secondResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ authorization: 'Bearer token_1', body: { message: 'hola 2' } }),
      createRes(secondResult),
    );
    expect(secondResult.statusCode).toBe(200);

    const thirdResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ authorization: 'Bearer token_1', body: { message: 'hola 3' } }),
      createRes(thirdResult),
    );
    expect(thirdResult.statusCode).toBe(429);
    expect(thirdResult.headers['Retry-After']).toBeTruthy();
    expect(thirdResult.payload).toEqual(
      expect.objectContaining({
        error: 'Rate limit exceeded',
      }),
    );
  });

  it('returns 504 when upstream calls timeout on every model', async () => {
    const abortError = new Error('timeout');
    (abortError as { name?: string }).name = 'AbortError';

    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal('fetch', fetchMock);

    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ authorization: 'Bearer token_1', body: { message: 'hola' } }),
      createRes(result),
    );

    expect(result.statusCode).toBe(504);
    expect(result.payload).toEqual({ error: 'AI provider timeout' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to NVIDIA when Gemini models are rate limited', async () => {
    process.env.NVIDIA_API_KEY = 'nvidia-test-key';
    process.env.NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
    process.env.NVIDIA_MODEL = 'moonshotai/kimi-k2-instruct';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: vi.fn(async () => 'RESOURCE_EXHAUSTED'),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: vi.fn(async () => 'rate limit'),
      } as unknown as Response)
      .mockResolvedValueOnce(createNvidiaSuccessResponse('respuesta desde nvidia'));
    vi.stubGlobal('fetch', fetchMock);

    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ authorization: 'Bearer token_1', body: { message: 'hola' } }),
      createRes(result),
    );

    expect(result.statusCode).toBe(200);
    expect(result.payload).toEqual(
      expect.objectContaining({
        model: 'moonshotai/kimi-k2-instruct',
        provider: 'nvidia',
        response: 'respuesta desde nvidia',
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('uses Identity Toolkit lookup when verifyIdToken fails', async () => {
    process.env.FIREBASE_WEB_API_KEY = 'public-web-key';
    mockVerifyIdToken.mockRejectedValueOnce(new Error('invalid signature'));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: vi.fn(async () => ({ users: [{ localId: 'user_lookup' }] })),
        ok: true,
        status: 200,
        text: vi.fn(async () => ''),
      } as unknown as Response)
      .mockResolvedValueOnce(createSuccessfulUpstreamResponse('respuesta via lookup'));
    vi.stubGlobal('fetch', fetchMock);

    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ authorization: 'Bearer token_1', body: { message: 'hola' } }),
      createRes(result),
    );

    expect(result.statusCode).toBe(200);
    expect(result.payload).toEqual(
      expect.objectContaining({
        response: 'respuesta via lookup',
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('accounts:lookup');
  });

  it('redacts PII from chat payload before upstream AI call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createSuccessfulUpstreamResponse('ok'));
    vi.stubGlobal('fetch', fetchMock);

    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({
        authorization: 'Bearer token_1',
        body: {
          message: 'Escribe a persona@correo.com y llama al +1 (415) 555-1212',
          history: [{ role: 'user', parts: [{ text: 'Mi correo es contacto@empresa.com' }] }],
        },
      }),
      createRes(result),
    );

    expect(result.statusCode).toBe(200);

    const upstreamInit = fetchMock.mock.calls[0]?.[1] as { body?: string } | undefined;
    const upstreamBody = String(upstreamInit?.body ?? '');

    expect(upstreamBody).toContain('[email_redacted]');
    expect(upstreamBody).toContain('[phone_redacted]');
    expect(upstreamBody).not.toContain('persona@correo.com');
    expect(upstreamBody).not.toContain('contacto@empresa.com');
    expect(upstreamBody).not.toContain('415) 555-1212');
  });

  it('rejects requests when server-side AI consent is missing', async () => {
    mockGetUserDocGet.mockResolvedValueOnce({
      data: () => ({
        settings: {
          ai: {
            consentGranted: false,
          },
        },
      }),
      exists: true,
    });

    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    const res = createRes(result);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await handler(createReq({ authorization: 'Bearer token_1' }), res);

    expect(result.statusCode).toBe(403);
    expect(result.payload).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('consentimiento de IA'),
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 503 when AI consent lookup fails', async () => {
    mockGetUserDocGet.mockRejectedValueOnce(new Error('firestore unavailable'));

    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    const res = createRes(result);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await handler(createReq({ authorization: 'Bearer token_1' }), res);

    expect(result.statusCode).toBe(503);
    expect(result.payload).toEqual({ error: 'Unable to verify AI consent' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
