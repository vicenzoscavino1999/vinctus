import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    fetchArxivPapers,
    fetchWikipediaArticles,
    fetchHackerNews,
    fetchBooks,
    fetchNatureObservations,
} from '../services/api';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('API Services', () => {
    beforeEach(() => {
        mockFetch.mockClear();
    });

    describe('fetchArxivPapers', () => {
        it('retorna array vacio cuando fetch falla', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await fetchArxivPapers('physics', 5);

            expect(result).toEqual([]);
        });

        it('parsea correctamente respuesta XML de arXiv', async () => {
            const mockXml = `
        <feed>
          <entry>
            <id>http://arxiv.org/abs/1234.5678</id>
            <title>Test Paper Title</title>
            <summary>Test summary content</summary>
            <author><name>John Doe</name></author>
            <published>2024-01-15T00:00:00Z</published>
          </entry>
        </feed>
      `;

            mockFetch.mockResolvedValueOnce({
                text: () => Promise.resolve(mockXml),
            });

            const result = await fetchArxivPapers('physics', 1);

            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('Test Paper Title');
            expect(result[0].type).toBe('Paper');
        });
    });

    describe('fetchWikipediaArticles', () => {
        it('retorna array vacio cuando fetch falla', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await fetchWikipediaArticles('Ancient_history', 5);

            expect(result).toEqual([]);
        });

        it('parsea correctamente respuesta JSON de Wikipedia', async () => {
            const mockResponse = {
                pages: [
                    {
                        pageid: 123,
                        title: 'Ancient Rome',
                        titles: { normalized: 'Ancient Rome' },
                        extract: 'Rome was a civilization...',
                        thumbnail: { source: 'https://example.com/image.jpg' },
                    },
                ],
            };

            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve(mockResponse),
            });

            const result = await fetchWikipediaArticles('Ancient_Rome', 1);

            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('Ancient Rome');
            expect(result[0].type).toBe('Articulo');
        });
    });

    describe('fetchHackerNews', () => {
        it('retorna array vacio cuando fetch falla', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await fetchHackerNews('top', 5);

            expect(result).toEqual([]);
        });

        it('obtiene stories correctamente', async () => {
            // Mock para IDs
            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve([1, 2]),
            });

            // Mock para cada story
            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve({
                    id: 1,
                    title: 'Test Story',
                    url: 'https://example.com',
                    by: 'testuser',
                    score: 100,
                    descendants: 50,
                    time: 1704067200,
                    type: 'story',
                }),
            });

            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve({
                    id: 2,
                    title: 'Another Story',
                    url: 'https://example2.com',
                    by: 'testuser2',
                    score: 200,
                    descendants: 100,
                    time: 1704067200,
                    type: 'story',
                }),
            });

            const result = await fetchHackerNews('top', 2);

            expect(result).toHaveLength(2);
            expect(result[0].title).toBe('Test Story');
            expect(result[0].type).toBe('Noticia');
        });
    });

    describe('fetchBooks', () => {
        it('retorna array vacio cuando fetch falla', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await fetchBooks('fiction', 5);

            expect(result).toEqual([]);
        });

        it('parsea correctamente respuesta de Open Library', async () => {
            const mockResponse = {
                works: [
                    {
                        key: '/works/OL123',
                        title: 'Test Book',
                        authors: [{ name: 'Test Author' }],
                        cover_id: 12345,
                        first_publish_year: 1999,
                    },
                ],
            };

            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve(mockResponse),
            });

            const result = await fetchBooks('fiction', 1);

            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('Test Book');
            expect(result[0].authors).toBe('Test Author');
            expect(result[0].type).toBe('Libro');
        });
    });

    describe('fetchNatureObservations', () => {
        it('retorna array vacio cuando fetch falla', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await fetchNatureObservations('plants', 5);

            expect(result).toEqual([]);
        });

        it('parsea correctamente respuesta de iNaturalist', async () => {
            const mockResponse = {
                results: [
                    {
                        id: 123,
                        taxon: {
                            preferred_common_name: 'Oak Tree',
                            name: 'Quercus',
                        },
                        place_guess: 'California',
                        photos: [{ url: 'https://example.com/photo_square.jpg' }],
                        user: { login: 'naturalist1' },
                        observed_on: '2024-01-15',
                    },
                ],
            };

            mockFetch.mockResolvedValueOnce({
                json: () => Promise.resolve(mockResponse),
            });

            const result = await fetchNatureObservations('plants', 1);

            expect(result).toHaveLength(1);
            expect(result[0].species).toBe('Oak Tree');
            expect(result[0].type).toBe('Observacion');
        });
    });
});
