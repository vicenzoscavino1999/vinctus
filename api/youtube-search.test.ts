import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from './lib/rateLimit.js';
import handler, { __resetYouTubeSearchCache } from './youtube-search';

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

describe('api/youtube-search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    __resetYouTubeSearchCache();
    resetRateLimitStore();
    process.env.YOUTUBE_API_KEY = 'youtube-search-test-key';
    process.env.YOUTUBE_SEARCH_CACHE_TTL_SECONDS = '1800';
    process.env.YOUTUBE_SEARCH_IP_MINUTE_LIMIT = '24';
    process.env.YOUTUBE_SEARCH_IP_DAY_LIMIT = '800';
    process.env.YOUTUBE_SEARCH_REGION_CODE = 'US';
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
    await handler(createReq({ query: { q: 'ciencia' } }), createRes(result));

    expect(result.statusCode).toBe(503);
    expect(result.payload).toEqual({ error: 'YouTube API key not configured' });
  });

  it('validates limit and pageToken', async () => {
    const limitResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(createReq({ query: { q: 'music', limit: '50' } }), createRes(limitResult));
    expect(limitResult.statusCode).toBe(400);
    expect(limitResult.payload).toEqual({ error: '"limit" must be between 1 and 12' });

    const tokenResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ query: { q: 'music', pageToken: '$invalid' } }),
      createRes(tokenResult),
    );
    expect(tokenResult.statusCode).toBe(400);
    expect(tokenResult.payload).toEqual({ error: 'Invalid "pageToken"' });
  });

  it('fetches search data and caches repeated requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn(async () => ({
        items: [
          {
            id: { videoId: 'dQw4w9WgXcQ' },
            snippet: {
              channelId: 'channel_1',
              channelTitle: 'Rick Astley',
              description: 'Test description',
              publishedAt: '2009-10-25T06:57:33Z',
              thumbnails: {
                high: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' },
              },
              title: 'Never Gonna Give You Up',
            },
          },
        ],
        nextPageToken: 'NEXT_PAGE_TOKEN',
      })),
      ok: true,
      status: 200,
      statusText: 'OK',
      text: vi.fn(async () => ''),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const firstResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ query: { q: 'quantum mechanics', limit: '2' } }),
      createRes(firstResult),
    );

    expect(firstResult.statusCode).toBe(200);
    expect(firstResult.headers['X-YouTube-Search-Cache']).toBe('MISS');
    expect(firstResult.payload).toEqual(
      expect.objectContaining({
        cached: false,
        limit: 2,
        nextPageToken: 'NEXT_PAGE_TOKEN',
        query: 'quantum mechanics',
      }),
    );
    expect((firstResult.payload as { items?: unknown[] }).items?.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const secondResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ query: { q: 'quantum mechanics', limit: '2' } }),
      createRes(secondResult),
    );

    expect(secondResult.statusCode).toBe(200);
    expect(secondResult.headers['X-YouTube-Search-Cache']).toBe('HIT');
    expect((secondResult.payload as { cached?: boolean }).cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('applies IP rate limiting', async () => {
    process.env.YOUTUBE_SEARCH_IP_MINUTE_LIMIT = '6';
    process.env.YOUTUBE_SEARCH_IP_DAY_LIMIT = '20';

    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn(async () => ({
        items: [
          {
            id: { videoId: 'dQw4w9WgXcQ' },
            snippet: {
              title: 'Video 1',
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

    const ip = '10.10.10.2';
    for (let index = 0; index < 6; index += 1) {
      const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
      await handler(
        createReq({
          ip,
          query: { q: `video ${index + 1}`, pageToken: `TOKEN_${index + 1}` },
        }),
        createRes(result),
      );
      expect(result.statusCode).toBe(200);
    }

    const blockedResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ ip, query: { q: 'video 7', pageToken: 'TOKEN_7' } }),
      createRes(blockedResult),
    );
    expect(blockedResult.statusCode).toBe(429);
    expect(blockedResult.headers['Retry-After']).toBeTruthy();
    expect(blockedResult.payload).toEqual(
      expect.objectContaining({
        error: 'Rate limit exceeded',
      }),
    );
  });
});
