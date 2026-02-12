import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { __resetDiscoverCache } from './discover';

interface MockResponseResult {
  headers: Record<string, string>;
  payload: unknown;
  statusCode: number;
}

function createReq(options?: { method?: string; query?: Record<string, string> }): VercelRequest {
  const method = options?.method ?? 'GET';
  const query = options?.query ?? {};
  return {
    headers: {},
    method,
    query,
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

describe('api/discover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDiscoverCache();
    vi.unstubAllGlobals();
  });

  it('rejects unsupported HTTP methods', async () => {
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(createReq({ method: 'POST' }), createRes(result));

    expect(result.statusCode).toBe(405);
    expect(result.payload).toEqual({ error: 'Method not allowed' });
  });

  it('validates source param', async () => {
    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({
        query: { limit: '2', query: 'physics', source: 'unknown' },
      }),
      createRes(result),
    );

    expect(result.statusCode).toBe(400);
    expect(result.payload).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('Unsupported source'),
      }),
    );
  });

  it('uses iTunes provider for music and caches subsequent responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn(async () => ({
        results: [
          {
            artistName: 'Dave Brubeck',
            trackId: 1,
            trackName: 'Take Five',
            trackViewUrl: 'https://music.apple.com/us/album/take-five/id1',
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
      createReq({
        query: { limit: '1', query: 'jazz', source: 'lastfm' },
      }),
      createRes(firstResult),
    );

    expect(firstResult.statusCode).toBe(200);
    expect(firstResult.headers['X-Discover-Cache']).toBe('MISS');
    expect(firstResult.payload).toEqual(
      expect.objectContaining({
        cached: false,
        data: [
          expect.objectContaining({
            artist: 'Dave Brubeck',
            title: 'Take Five',
            type: 'Cancion',
          }),
        ],
        provider: 'Apple iTunes Search API',
        source: 'lastfm',
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('itunes.apple.com/search');

    const secondResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({
        query: { limit: '1', query: 'jazz', source: 'lastfm' },
      }),
      createRes(secondResult),
    );

    expect(secondResult.statusCode).toBe(200);
    expect(secondResult.headers['X-Discover-Cache']).toBe('HIT');
    expect(secondResult.payload).toEqual(
      expect.objectContaining({
        cached: true,
        source: 'lastfm',
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses Wikipedia v1 search endpoint and sanitizes excerpt HTML', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn(async () => ({
        pages: [
          {
            excerpt:
              'In modern historiography, <span class="searchmatch">Ancient</span> Rome is...',
            id: 521555,
            key: 'Ancient_Rome',
            thumbnail: { url: '//upload.wikimedia.org/example.jpg' },
            title: 'Ancient Rome',
          },
        ],
      })),
      ok: true,
      status: 200,
      statusText: 'OK',
      text: vi.fn(async () => ''),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({
        query: { limit: '1', query: 'Ancient_Rome', source: 'wikipedia' },
      }),
      createRes(result),
    );

    expect(result.statusCode).toBe(200);
    expect(result.payload).toEqual(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            id: 521555,
            link: 'https://en.wikipedia.org/wiki/Ancient_Rome',
            summary: expect.not.stringContaining('<span'),
            thumbnail: 'https://upload.wikimedia.org/example.jpg',
            title: 'Ancient Rome',
          }),
        ],
      }),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/w/rest.php/v1/search/page');
  });

  it('falls back to Wikipedia Action API when REST search fails', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce({
        json: vi.fn(async () => ({
          query: {
            pages: {
              '521555': {
                extract: 'Ancient Rome was the civilisation centered on the city of Rome.',
                pageid: 521555,
                title: 'Ancient Rome',
              },
            },
          },
        })),
        ok: true,
        status: 200,
        statusText: 'OK',
        text: vi.fn(async () => ''),
      } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({
        query: { limit: '1', query: 'Ancient Rome', source: 'wikipedia' },
      }),
      createRes(result),
    );

    expect(result.statusCode).toBe(200);
    expect(result.payload).toEqual(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            id: 521555,
            title: 'Ancient Rome',
          }),
        ],
      }),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/w/rest.php/v1/search/page');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/w/api.php?action=query');
  });
});
