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
    // Without it, Wikimedia rejects Node's default `node` agent and the REST search fails
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringMatching(/^Vinctus\//) }),
      }),
    );
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

  it('decodes HTML entities in Wikipedia excerpts and rejects non-integer limits', async () => {
    const invalidLimit: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({
        query: { limit: '4abc', query: 'Rome', source: 'wikipedia' },
      }),
      createRes(invalidLimit),
    );
    expect(invalidLimit.statusCode).toBe(400);

    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn(async () => ({
        pages: [
          {
            excerpt: 'Rome &amp; &quot;Caesar&#39;s&quot; <span class="searchmatch">legacy</span>',
            id: 42,
            key: 'Ancient_Rome',
            title: 'Rome &amp; Empire',
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
        query: { limit: '1', query: 'Rome', source: 'wikipedia' },
      }),
      createRes(result),
    );

    expect(result.statusCode).toBe(200);
    expect(result.payload).toEqual(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            summary: 'Rome & "Caesar\'s" legacy',
            title: 'Rome & Empire',
          }),
        ],
      }),
    );
  });

  it('survives deleted/failing Hacker News items and ignores unsafe URLs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: vi.fn(async () => [101, 102, 103]),
        ok: true,
        status: 200,
        statusText: 'OK',
      } as unknown as Response)
      .mockResolvedValueOnce({
        json: vi.fn(async () => null),
        ok: true,
        status: 200,
        statusText: 'OK',
      } as unknown as Response)
      .mockRejectedValueOnce(new Error('item timeout'))
      .mockResolvedValueOnce({
        json: vi.fn(async () => ({
          by: 'pg',
          descendants: 12,
          id: 103,
          score: 88,
          time: 1700000000,
          title: 'Show HN: Safe &amp; Sound',
          type: 'story',
          url: 'javascript:alert(1)',
        })),
        ok: true,
        status: 200,
        statusText: 'OK',
      } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ query: { limit: '3', query: 'top', source: 'hackernews' } }),
      createRes(result),
    );

    expect(result.statusCode).toBe(200);
    expect(result.payload).toEqual(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            id: 103,
            title: 'Show HN: Safe & Sound',
            url: 'https://news.ycombinator.com/item?id=103',
          }),
        ],
      }),
    );
  });

  it('returns null cover for Open Library works with missing or zero cover_id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn(async () => ({
        works: [
          { authors: [{ name: 'Borges' }], cover_id: null, key: '/works/OL1W', title: 'Ficciones' },
          { authors: [], cover_id: 0, key: '/works/OL2W', title: 'El Aleph' },
          {
            authors: [{ name: 'Cortazar' }],
            cover_id: 12345,
            key: '/works/OL3W',
            title: 'Rayuela',
          },
        ],
      })),
      ok: true,
      status: 200,
      statusText: 'OK',
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ query: { limit: '3', query: 'fiction', source: 'openlibrary' } }),
      createRes(result),
    );

    expect(result.statusCode).toBe(200);
    expect((result.payload as { data: Array<{ cover: string | null }> }).data).toEqual([
      expect.objectContaining({ cover: null, title: 'Ficciones' }),
      expect.objectContaining({ cover: null, title: 'El Aleph' }),
      expect.objectContaining({
        cover: 'https://covers.openlibrary.org/b/id/12345-M.jpg',
        title: 'Rayuela',
      }),
    ]);
  });

  it('ignores out-of-range numeric HTML entities and unsafe iNaturalist/iTunes URLs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: vi.fn(async () => ({
          pages: [
            {
              excerpt: 'Safe &#9999999; &amp; &#x110000; text',
              id: 77,
              key: 'Safe_Text',
              title: 'Title &#9999999;',
            },
          ],
        })),
        ok: true,
        status: 200,
        statusText: 'OK',
      } as unknown as Response)
      .mockResolvedValueOnce({
        json: vi.fn(async () => ({
          results: [
            {
              id: 501,
              observed_on: '2026-01-02',
              photos: [{ url: 'javascript:alert(1)' }],
              place_guess: 'Andes',
              taxon: { name: 'Vultur gryphus', preferred_common_name: 'Condor' },
              user: { login: 'ana' },
            },
          ],
        })),
        ok: true,
        status: 200,
        statusText: 'OK',
      } as unknown as Response)
      .mockResolvedValueOnce({
        json: vi.fn(async () => ({
          results: [
            {
              artistName: 'Miles Davis',
              trackId: 9,
              trackName: 'So What',
              trackViewUrl: 'javascript:alert(2)',
            },
          ],
        })),
        ok: true,
        status: 200,
        statusText: 'OK',
      } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const wikiResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ query: { limit: '1', query: 'Safe', source: 'wikipedia' } }),
      createRes(wikiResult),
    );
    expect(wikiResult.statusCode).toBe(200);
    expect(wikiResult.payload).toEqual(
      expect.objectContaining({
        data: [expect.objectContaining({ summary: 'Safe & text', title: 'Title' })],
      }),
    );

    const natureResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ query: { limit: '1', query: 'birds', source: 'inaturalist' } }),
      createRes(natureResult),
    );
    expect(natureResult.statusCode).toBe(200);
    expect(natureResult.payload).toEqual(
      expect.objectContaining({
        data: [expect.objectContaining({ photo: null, species: 'Condor' })],
      }),
    );

    const musicResult: MockResponseResult = { headers: {}, payload: null, statusCode: 200 };
    await handler(
      createReq({ query: { limit: '1', query: 'jazz', source: 'lastfm' } }),
      createRes(musicResult),
    );
    expect(musicResult.statusCode).toBe(200);
    expect(musicResult.payload).toEqual(
      expect.objectContaining({
        data: [expect.objectContaining({ link: undefined, title: 'So What' })],
      }),
    );
  });
});
