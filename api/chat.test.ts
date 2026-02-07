import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from './lib/rateLimit.js';

const { mockCreateGroupAction, mockVerifyIdToken } = vi.hoisted(() => ({
  mockCreateGroupAction: vi.fn(),
  mockVerifyIdToken: vi.fn(),
}));

vi.mock('./lib/firebaseAdmin.js', () => ({
  getAuth: () => ({
    verifyIdToken: mockVerifyIdToken,
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

describe('api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.CHAT_USER_MINUTE_LIMIT = '20';
    process.env.CHAT_USER_DAY_LIMIT = '300';
    process.env.CHAT_IP_MINUTE_LIMIT = '60';
    process.env.CHAT_IP_DAY_LIMIT = '2000';
    mockVerifyIdToken.mockResolvedValue({ uid: 'user_1' });
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
});
