import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from './lib/rateLimit.js';
import handler, { __resetYouTubeCache } from './youtube';

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

describe('api/youtube', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    __resetYouTubeCache();
    resetRateLimitStore();
    process.env.YOUTUBE_API_KEY = 'youtube-test-key';
    process.env.YOUTUBE_CACHE_TTL_SECONDS = '3600';
    process.env.YOUTUBE_IP_MINUTE_LIMIT = '120';
    process.env.YOUTUBE_IP_DAY_LIMIT = '4000';
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
    await handler(createReq({ query: { videoId: 'dQw4w9WgXcQ' } }), createRes(result));

    expect(result.statusCode).toBe(503);
    expect(result.payload).toEqual({ error: 'YouTube API key not configured' });
  });

  it('validates videoId or url', async () => {
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(createReq({ query: {} }), createRes(result));

    expect(result.statusCode).toBe(400);
    expect(result.payload).toEqual({ error: 'Missing "videoId" or "url"' });
  });

  it('fetches metadata and caches subsequent requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn(async () => ({
        items: [
          {
            contentDetails: { duration: 'PT3M33S' },
            id: 'dQw4w9WgXcQ',
            snippet: {
              channelId: 'channel_1',
              channelTitle: 'RickAstleyVEVO',
              publishedAt: '2009-10-25T06:57:33Z',
              thumbnails: { high: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' } },
              title: 'Never Gonna Give You Up',
            },
            statistics: { commentCount: '100', likeCount: '5000', viewCount: '1234567' },
            status: { embeddable: true, privacyStatus: 'public' },
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
    await handler(createReq({ query: { videoId: 'dQw4w9WgXcQ' } }), createRes(firstResult));

    expect(firstResult.statusCode).toBe(200);
    expect(firstResult.headers['X-YouTube-Cache']).toBe('MISS');
    expect(firstResult.payload).toEqual(
      expect.objectContaining({
        cached: false,
        channelTitle: 'RickAstleyVEVO',
        embeddable: true,
        title: 'Never Gonna Give You Up',
        videoId: 'dQw4w9WgXcQ',
        viewCount: 1234567,
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const secondResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ query: { url: 'https://youtu.be/dQw4w9WgXcQ' } }),
      createRes(secondResult),
    );

    expect(secondResult.statusCode).toBe(200);
    expect(secondResult.headers['X-YouTube-Cache']).toBe('HIT');
    expect((secondResult.payload as { cached?: boolean }).cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('applies IP rate limiting', async () => {
    process.env.YOUTUBE_IP_MINUTE_LIMIT = '10';
    process.env.YOUTUBE_IP_DAY_LIMIT = '100';

    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn(async () => ({
        items: [
          {
            contentDetails: { duration: 'PT1M' },
            snippet: { title: 'Video 1' },
            status: { embeddable: true },
          },
        ],
      })),
      ok: true,
      status: 200,
      statusText: 'OK',
      text: vi.fn(async () => ''),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const ip = '10.10.10.1';
    const ids = [
      'dQw4w9WgXcQ',
      'jNQXAC9IVRw',
      '9bZkp7q19f0',
      'M7lc1UVf-VE',
      '5NV6Rdv1a3I',
      'LXb3EKWsInQ',
      'fJ9rUzIMcZQ',
      'kXYiU_JCYtU',
      'eY52Zsg-KVI',
      'YQHsXMglC9A',
      'CevxZvSJLk8',
    ];

    for (let index = 0; index < 10; index += 1) {
      const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
      await handler(
        createReq({ ip, query: { videoId: ids[index] || 'dQw4w9WgXcQ' } }),
        createRes(result),
      );
      expect(result.statusCode).toBe(200);
    }

    const blockedResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ ip, query: { videoId: ids[10] || 'dQw4w9WgXcQ' } }),
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
