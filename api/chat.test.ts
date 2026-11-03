import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from './lib/rateLimit.js';

const {
  mockCreateGroupAction,
  mockVerifyIdToken,
  mockGetUserDoc,
  mockGetUserDocGet,
  mockRunTransaction,
} = vi.hoisted(() => ({
  mockCreateGroupAction: vi.fn(),
  mockVerifyIdToken: vi.fn(),
  mockGetUserDoc: vi.fn(),
  mockGetUserDocGet: vi.fn(),
  mockRunTransaction: vi.fn(),
}));

vi.mock('./lib/firebaseAdmin.js', () => ({
  getAuth: () => ({
    verifyIdToken: mockVerifyIdToken,
  }),
  getDb: () => ({
    doc: mockGetUserDoc,
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({}) }) }) }),
    runTransaction: mockRunTransaction,
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

function upstreamError(status: number, text: string): Response {
  return {
    ok: false,
    status,
    text: vi.fn(async () => text),
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
    process.env.OPENAI_API_KEY = '';
    process.env.OPENAI_MODEL = '';
    process.env.FIREBASE_WEB_API_KEY = '';
    process.env.VITE_FIREBASE_API_KEY = '';
    process.env.FIREBASE_PROJECT_ID = '';
    process.env.VITE_FIREBASE_PROJECT_ID = '';
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
    mockRunTransaction.mockImplementation(async (fn) =>
      fn({
        get: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
        set: vi.fn(),
      }),
    );
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
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('uses OpenAI only when selected, with a server-side key and redacted text', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    process.env.OPENAI_MODEL = 'test-model';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'respuesta OpenAI' }] }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };

    await handler(
      createReq({
        authorization: 'Bearer token_1',
        body: {
          message: 'Escribe a persona@correo.com',
          useOpenAI: true,
          history: [{ role: 'model', parts: [{ text: 'Hola' }] }],
        },
      }),
      createRes(result),
    );

    expect(result.payload).toEqual(
      expect.objectContaining({
        provider: 'openai',
        model: 'test-model',
        response: 'respuesta OpenAI',
      }),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer openai-test-key' }),
    );
    const body = JSON.parse(String(init.body));
    expect(body.max_output_tokens).toBe(4096);
    expect(body.reasoning.effort).toBe('high');
    expect(body.store).toBe(false);
    expect(body.input).toEqual(
      expect.arrayContaining([
        { role: 'assistant', content: 'Hola' },
        { role: 'user', content: 'Escribe a [email_redacted]' },
      ]),
    );
    expect(body.tools[0].name).toBe('createGroup');
  });

  it('executes the existing group action returned by OpenAI', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'completed',
        output: [
          {
            type: 'function_call',
            name: 'createGroup',
            arguments: JSON.stringify({ name: 'Grupo', visibility: 'private' }),
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({
        authorization: 'Bearer token_1',
        body: { message: 'crea un grupo', useOpenAI: true },
      }),
      createRes(result),
    );
    expect(mockCreateGroupAction).toHaveBeenCalledWith('user_1', {
      name: 'Grupo',
      visibility: 'private',
      description: null,
    });
    expect(result.payload).toEqual(
      expect.objectContaining({
        provider: 'openai',
        action: { type: 'createGroup', groupId: 'group_1' },
      }),
    );
  });

  it('sends an attached image to OpenAI with the user message', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Un dibujo' }] }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    const image = 'data:image/png;base64,YWJj';
    await handler(
      createReq({
        authorization: 'Bearer token_1',
        body: { message: 'Qué ves?', useOpenAI: true, image },
      }),
      createRes(result),
    );
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.input.at(-1).content).toContainEqual({ type: 'input_image', image_url: image });
  });

  it('generates an image only when explicitly requested', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'completed',
        output: [{ type: 'image_generation_call', result: 'YWJj' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({
        authorization: 'Bearer token_1',
        body: { message: 'Un gato', useOpenAI: true, generateImage: true },
      }),
      createRes(result),
    );
    expect(result.payload).toEqual(
      expect.objectContaining({ image: 'data:image/png;base64,YWJj', provider: 'openai' }),
    );
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.tool_choice).toEqual({ type: 'image_generation' });
    expect(body.tools[0].type).toBe('image_generation');
  });

  it('fails closed when the persistent image limit cannot be verified', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    mockRunTransaction.mockRejectedValueOnce(new Error('firestore unavailable'));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({
        authorization: 'Bearer token_1',
        body: { message: 'Un gato', useOpenAI: true, generateImage: true },
      }),
      createRes(result),
    );
    expect(result.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects generation when the daily user limit is reached', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    mockRunTransaction.mockImplementationOnce(async (fn) =>
      fn({
        get: vi
          .fn()
          .mockResolvedValueOnce({ data: () => ({ count: 1 }) })
          .mockResolvedValueOnce({ data: () => ({ count: 5 }) }),
        set: vi.fn(),
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({
        authorization: 'Bearer token_1',
        body: { message: 'Un gato', useOpenAI: true, generateImage: true },
      }),
      createRes(result),
    );
    expect(result.statusCode).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects images without OpenAI selection and does not send them to fallback providers', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    const fetchMock = vi.fn().mockResolvedValue(upstreamError(503, 'unavailable'));
    vi.stubGlobal('fetch', fetchMock);
    const rejected: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({
        authorization: 'Bearer token_1',
        body: { message: 'hola', image: 'data:image/png;base64,YWJj' },
      }),
      createRes(rejected),
    );
    expect(rejected.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    const failed: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({
        authorization: 'Bearer token_1',
        body: { message: 'hola', image: 'data:image/png;base64,YWJj', useOpenAI: true },
      }),
      createRes(failed),
    );
    expect(failed.statusCode).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not send messages to OpenAI without explicit selection', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createSuccessfulUpstreamResponse('respuesta Gemini'));
    vi.stubGlobal('fetch', fetchMock);
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(createReq({ authorization: 'Bearer token_1' }), createRes(result));
    expect(result.payload).toEqual(expect.objectContaining({ provider: 'gemini' }));
    expect(String(fetchMock.mock.calls[0][0])).toContain('generativelanguage.googleapis.com');
  });

  it('falls back to Gemini when selected OpenAI is unavailable', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(upstreamError(429, 'rate limit'))
      .mockResolvedValueOnce(createSuccessfulUpstreamResponse('respuesta Gemini'));
    vi.stubGlobal('fetch', fetchMock);
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ authorization: 'Bearer token_1', body: { message: 'hola', useOpenAI: true } }),
      createRes(result),
    );
    expect(result.payload).toEqual(
      expect.objectContaining({ provider: 'gemini', response: 'respuesta Gemini' }),
    );
  });

  it('reports missing OpenAI configuration when selected', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ authorization: 'Bearer token_1', body: { message: 'hola', useOpenAI: true } }),
      createRes(result),
    );
    expect(result.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to NVIDIA when Gemini models are rate limited', async () => {
    process.env.NVIDIA_API_KEY = 'nvidia-test-key';
    process.env.NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

    const fetchMock = vi.fn(async (url: string) =>
      url.includes('integrate.api.nvidia.com')
        ? createNvidiaSuccessResponse('respuesta desde nvidia')
        : upstreamError(429, 'RESOURCE_EXHAUSTED'),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ authorization: 'Bearer token_1', body: { message: 'hola' } }),
      createRes(result),
    );

    expect(result.statusCode).toBe(200);
    expect(result.payload).toEqual(
      expect.objectContaining({
        model: 'meta/llama-3.3-70b-instruct',
        provider: 'nvidia',
        response: 'respuesta desde nvidia',
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('moves to another Gemini model when the first one is overloaded', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(upstreamError(503, 'This model is currently experiencing high demand'))
      .mockResolvedValueOnce(createSuccessfulUpstreamResponse('respuesta desde 2.5'));
    vi.stubGlobal('fetch', fetchMock);

    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ authorization: 'Bearer token_1', body: { message: 'hola' } }),
      createRes(result),
    );

    expect(result.statusCode).toBe(200);
    expect(result.payload).toEqual(
      expect.objectContaining({ model: 'gemini-2.5-flash', response: 'respuesta desde 2.5' }),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/gemini-3.8-flash:');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/gemini-2.5-flash:');
  });

  it('keeps the default NVIDIA model as a fallback when NVIDIA_MODEL is retired', async () => {
    process.env.GEMINI_API_KEY = '';
    process.env.NVIDIA_API_KEY = 'nvidia-test-key';
    process.env.NVIDIA_MODEL = 'moonshotai/kimi-k2-instruct';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(upstreamError(410, 'Gone'))
      .mockResolvedValueOnce(createNvidiaSuccessResponse('respuesta desde llama'));
    vi.stubGlobal('fetch', fetchMock);

    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ authorization: 'Bearer token_1', body: { message: 'hola' } }),
      createRes(result),
    );

    expect(result.statusCode).toBe(200);
    expect(result.payload).toEqual(
      expect.objectContaining({
        model: 'meta/llama-3.3-70b-instruct',
        provider: 'nvidia',
        response: 'respuesta desde llama',
      }),
    );
    const requestedModels = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(String((init as RequestInit).body)).model,
    );
    expect(requestedModels).toEqual(['moonshotai/kimi-k2-instruct', 'meta/llama-3.3-70b-instruct']);
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

  describe('when the Admin SDK cannot read the user doc', () => {
    const firestoreConsentResponse = (consentGranted: boolean): Response =>
      ({
        json: vi.fn(async () => ({
          fields: {
            settings: {
              mapValue: {
                fields: {
                  ai: {
                    mapValue: { fields: { consentGranted: { booleanValue: consentGranted } } },
                  },
                },
              },
            },
          },
        })),
        ok: true,
        status: 200,
      }) as unknown as Response;

    const routeFetch = (firestoreResponse: Response) =>
      vi.fn(async (url: string) =>
        url.startsWith('https://firestore.googleapis.com/')
          ? firestoreResponse
          : createSuccessfulUpstreamResponse('respuesta'),
      );

    beforeEach(() => {
      process.env.VITE_FIREBASE_PROJECT_ID = 'vinctus-test';
      mockGetUserDocGet.mockRejectedValueOnce(new Error('FIREBASE_SERVICE_ACCOUNT not configured'));
    });

    it('reads consent through Firestore REST with the caller token', async () => {
      const fetchMock = routeFetch(firestoreConsentResponse(true));
      vi.stubGlobal('fetch', fetchMock);
      const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };

      await handler(createReq({ authorization: 'Bearer token_1' }), createRes(result));

      expect(result.statusCode).toBe(200);
      const [firestoreUrl, firestoreInit] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(firestoreUrl).toBe(
        'https://firestore.googleapis.com/v1/projects/vinctus-test/databases/(default)/documents/users/user_1?mask.fieldPaths=settings.ai.consentGranted',
      );
      expect(firestoreInit.headers).toEqual({ Authorization: 'Bearer token_1' });
    });

    it('still requires consent when Firestore REST says it was not granted', async () => {
      const fetchMock = routeFetch(firestoreConsentResponse(false));
      vi.stubGlobal('fetch', fetchMock);
      const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };

      await handler(createReq({ authorization: 'Bearer token_1' }), createRes(result));

      expect(result.statusCode).toBe(403);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('treats a missing user doc as no consent', async () => {
      const fetchMock = routeFetch({ ok: false, status: 404 } as Response);
      vi.stubGlobal('fetch', fetchMock);
      const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };

      await handler(createReq({ authorization: 'Bearer token_1' }), createRes(result));

      expect(result.statusCode).toBe(403);
    });

    it('returns 503 when Firestore REST also fails', async () => {
      const fetchMock = routeFetch({ ok: false, status: 500 } as Response);
      vi.stubGlobal('fetch', fetchMock);
      const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };

      await handler(createReq({ authorization: 'Bearer token_1' }), createRes(result));

      expect(result.statusCode).toBe(503);
      expect(result.payload).toEqual({ error: 'Unable to verify AI consent' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
