import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchArxivPapers,
  fetchWikipediaArticles,
  fetchHackerNews,
  fetchBooks,
  fetchNatureObservations,
  fetchMusicInfo,
} from './api';

const mockFetch = vi.fn();

const createProxyResponse = (data: unknown[]): Response =>
  ({
    json: vi.fn(async () => ({ data })),
    ok: true,
    status: 200,
    statusText: 'OK',
  }) as unknown as Response;

const createJsonResponse = (data: unknown): Response =>
  ({
    json: vi.fn(async () => data),
    ok: true,
    status: 200,
    statusText: 'OK',
  }) as unknown as Response;

const createTextResponse = (text: string): Response =>
  ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: vi.fn(async () => text),
  }) as unknown as Response;

describe('API Services', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('usa /api/discover para arxiv cuando proxy responde', async () => {
    mockFetch.mockResolvedValueOnce(
      createProxyResponse([{ id: 'p1', title: 'Paper 1', type: 'Paper' }]),
    );

    const result = await fetchArxivPapers('physics', 5);

    expect(result).toEqual([{ id: 'p1', title: 'Paper 1', type: 'Paper' }]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain('/api/discover?');
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain('source=arxiv');
  });

  it('hace fallback a arXiv directo si falla proxy', async () => {
    mockFetch.mockRejectedValueOnce(new Error('proxy down'));
    mockFetch.mockResolvedValueOnce(
      createTextResponse(`
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>http://arxiv.org/abs/1234.5678</id>
            <title>Test Paper Title</title>
            <summary>Test summary content</summary>
            <author><name>John Doe</name></author>
            <published>2024-01-15T00:00:00Z</published>
          </entry>
        </feed>
      `),
    );

    const result = await fetchArxivPapers('physics', 1);

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Test Paper Title');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[1]?.[0])).toContain('export.arxiv.org/api/query');
  });

  it('hace fallback a Wikipedia search directo si falla proxy', async () => {
    mockFetch.mockRejectedValueOnce(new Error('proxy down'));
    mockFetch.mockRejectedValueOnce(new Error('rest failed'));
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        query: {
          pages: {
            '521555': {
              extract: 'Articulo sobre Roma.',
              pageid: 521555,
              title: 'Ancient Rome',
            },
          },
        },
      }),
    );

    const result = await fetchWikipediaArticles('Ancient_Rome', 1);

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Ancient Rome');
    expect(result[0]?.summary).not.toContain('<span');
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(String(mockFetch.mock.calls[1]?.[0])).toContain('/w/rest.php/v1/search/page');
    expect(String(mockFetch.mock.calls[2]?.[0])).toContain('/w/api.php?action=query');
  });

  it('usa proxy para wikipedia, hackernews, openlibrary e inaturalist', async () => {
    mockFetch
      .mockResolvedValueOnce(createProxyResponse([{ id: 1, title: 'Wiki', type: 'Articulo' }]))
      .mockResolvedValueOnce(createProxyResponse([{ id: 2, title: 'HN', type: 'Noticia' }]))
      .mockResolvedValueOnce(
        createProxyResponse([{ id: '/works/1', title: 'Book', type: 'Libro' }]),
      )
      .mockResolvedValueOnce(createProxyResponse([{ id: 4, species: 'Oak', type: 'Observacion' }]));

    const wikipedia = await fetchWikipediaArticles('Ancient_history', 3);
    const hackerNews = await fetchHackerNews('top', 2);
    const books = await fetchBooks('fiction', 1);
    const nature = await fetchNatureObservations('plants', 1);

    expect(wikipedia[0]?.title).toBe('Wiki');
    expect(hackerNews[0]?.title).toBe('HN');
    expect(books[0]?.title).toBe('Book');
    expect(nature[0]?.species).toBe('Oak');
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain('source=wikipedia');
    expect(String(mockFetch.mock.calls[1]?.[0])).toContain('source=hackernews');
    expect(String(mockFetch.mock.calls[2]?.[0])).toContain('source=openlibrary');
    expect(String(mockFetch.mock.calls[3]?.[0])).toContain('source=inaturalist');
  });

  it('usa proveedor de musica via proxy', async () => {
    mockFetch.mockResolvedValueOnce(
      createProxyResponse([{ artist: 'Miles Davis', id: 1, title: 'So What', type: 'Cancion' }]),
    );

    const result = await fetchMusicInfo('jazz', 5);

    expect(result[0]?.title).toBe('So What');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain('source=lastfm');
  });

  it('hace fallback a iTunes directo si falla proxy de musica', async () => {
    mockFetch.mockRejectedValueOnce(new Error('proxy down'));
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        results: [
          {
            artistName: 'Dave Brubeck',
            trackId: 1,
            trackName: 'Take Five',
            trackViewUrl: 'https://music.apple.com/us/album/take-five/id1',
          },
        ],
      }),
    );

    const result = await fetchMusicInfo('jazz', 1);

    expect(result).toEqual([
      {
        artist: 'Dave Brubeck',
        id: 1,
        link: 'https://music.apple.com/us/album/take-five/id1',
        title: 'Take Five',
        type: 'Cancion',
      },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[1]?.[0])).toContain('itunes.apple.com/search');
  });
});
