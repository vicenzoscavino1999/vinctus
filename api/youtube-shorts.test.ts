import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from './lib/rateLimit.js';
import handler, { __resetYouTubeShortsCache } from './youtube-shorts';

interface MockResponseResult {
  headers: Record<string, string>;
  payload: unknown;
  statusCode: number;
}

function createReq(options?: {
  ip?: string;
  method?: string;
  query?: Record<string, string>;
}): VercelRequest {
  const method = options?.method ?? 'GET';
  const query = options?.query ?? {};
  const ip = options?.ip ?? '127.0.0.1';
  return {
    headers: {
      'x-forwarded-for': ip,
    },
    method,
    query,
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

describe('api/youtube-shorts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    __resetYouTubeShortsCache();
    resetRateLimitStore();
    process.env.YOUTUBE_API_KEY = 'youtube-shorts-test-key';
    process.env.YOUTUBE_SHORTS_CACHE_TTL_SECONDS = '259200';
    process.env.YOUTUBE_SHORTS_IP_MINUTE_LIMIT = '12';
    process.env.YOUTUBE_SHORTS_IP_DAY_LIMIT = '400';
    process.env.YOUTUBE_SHORTS_REGION_CODE = 'US';
  });

  it('rejects unsupported HTTP methods', async () => {
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(createReq({ method: 'POST' }), createRes(result));

    expect(result.statusCode).toBe(405);
    expect(result.payload).toEqual({ error: 'Method not allowed' });
  });

  it('requires API key', async () => {
    process.env.YOUTUBE_API_KEY = '';
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(createReq({ query: { q: 'shorts ciencia' } }), createRes(result));

    expect(result.statusCode).toBe(503);
    expect(result.payload).toEqual({ error: 'YouTube API key not configured' });
  });

  it('fetches shorts and caches repeated requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn(async () => ({
        items: [
          {
            id: { videoId: 'dQw4w9WgXcQ' },
            snippet: {
              channelId: 'channel_1',
              channelTitle: 'Canal de prueba',
              description: 'Short de prueba',
              publishedAt: '2026-02-10T10:00:00Z',
              thumbnails: {
                high: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' },
              },
              title: 'Short test',
            },
          },
        ],
      })),
      ok: true,
      status: 200,
      statusText: 'OK',
      text: vi.fn(async () => ''),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const firstResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ query: { q: 'shorts tecnologia', limit: '20' } }),
      createRes(firstResult),
    );

    expect(firstResult.statusCode).toBe(200);
    expect(firstResult.headers['X-YouTube-Shorts-Cache']).toBe('MISS');
    expect(firstResult.payload).toEqual(
      expect.objectContaining({
        cached: false,
        limit: 20,
        query: 'shorts tecnologia',
      }),
    );
    expect((firstResult.payload as { items?: unknown[] }).items?.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const secondResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ query: { q: 'shorts tecnologia', limit: '20' } }),
      createRes(secondResult),
    );

    expect(secondResult.statusCode).toBe(200);
    expect(secondResult.headers['X-YouTube-Shorts-Cache']).toBe('HIT');
    expect((secondResult.payload as { cached?: boolean }).cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('applies IP rate limiting', async () => {
    process.env.YOUTUBE_SHORTS_IP_MINUTE_LIMIT = '4';
    process.env.YOUTUBE_SHORTS_IP_DAY_LIMIT = '20';

    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn(async () => ({
        items: [
          {
            id: { videoId: 'dQw4w9WgXcQ' },
            snippet: { title: 'Short test' },
          },
        ],
      })),
      ok: true,
      status: 200,
      statusText: 'OK',
      text: vi.fn(async () => ''),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const ip = '10.10.10.4';
    for (let index = 0; index < 4; index += 1) {
      const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
      await handler(createReq({ ip, query: { q: `shorts ${index + 1}` } }), createRes(result));
      expect(result.statusCode).toBe(200);
    }

    const blockedResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(createReq({ ip, query: { q: 'shorts extra' } }), createRes(blockedResult));
    expect(blockedResult.statusCode).toBe(429);
    expect(blockedResult.headers['Retry-After']).toBeTruthy();
    expect(blockedResult.payload).toEqual(
      expect.objectContaining({
        error: 'Rate limit exceeded',
      }),
    );
  });
});
