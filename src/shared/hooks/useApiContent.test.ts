import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

let useApiContent: typeof import('./useApiContent').useApiContent;
let fetchArxivPapers: ReturnType<typeof vi.fn>;
let fetchWikipediaArticles: ReturnType<typeof vi.fn>;
let fetchHackerNews: ReturnType<typeof vi.fn>;
let fetchBooks: ReturnType<typeof vi.fn>;
let fetchNatureObservations: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  vi.doMock('@/shared/lib/api', () => ({
    fetchArxivPapers: vi.fn(),
    fetchWikipediaArticles: vi.fn(),
    fetchHackerNews: vi.fn(),
    fetchBooks: vi.fn(),
    fetchNatureObservations: vi.fn(),
  }));

  const api = await import('@/shared/lib/api');
  fetchArxivPapers = api.fetchArxivPapers as ReturnType<typeof vi.fn>;
  fetchWikipediaArticles = api.fetchWikipediaArticles as ReturnType<typeof vi.fn>;
  fetchHackerNews = api.fetchHackerNews as ReturnType<typeof vi.fn>;
  fetchBooks = api.fetchBooks as ReturnType<typeof vi.fn>;
  fetchNatureObservations = api.fetchNatureObservations as ReturnType<typeof vi.fn>;

  const hookModule = await import('./useApiContent');
  useApiContent = hookModule.useApiContent;
});

describe('useApiContent Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Estado inicial', () => {
    it('inicia con loading true cuando hay apiSource y query', async () => {
      let resolveFetch!: (value: unknown[]) => void;
      const pendingFetch = new Promise<unknown[]>((resolve) => {
        resolveFetch = resolve;
      });
      fetchArxivPapers.mockReturnValueOnce(pendingFetch);
      const { result } = renderHook(() => useApiContent('arxiv', 'physics', 5));

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toEqual([]);
      expect(result.current.error).toBe(null);

      resolveFetch([]);
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('inicia con loading false cuando no hay apiSource', async () => {
      const { result } = renderHook(() => useApiContent(null, null, 5));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchArxivPapers).not.toHaveBeenCalled();
    });

    it('usa fallback cuando query es null', async () => {
      fetchArxivPapers.mockResolvedValueOnce([]);
      const { result } = renderHook(() => useApiContent('arxiv', null, 5));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchArxivPapers).toHaveBeenCalledWith('physics', 5);
    });
  });

  describe('Fetching exitoso', () => {
    it('carga datos de arXiv correctamente', async () => {
      const mockData = [
        { id: '1', title: 'Paper 1', type: 'Paper' },
        { id: '2', title: 'Paper 2', type: 'Paper' },
      ];

      fetchArxivPapers.mockResolvedValueOnce(mockData);

      const { result } = renderHook(() => useApiContent('arxiv', 'physics', 5));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBe(null);
      expect(fetchArxivPapers).toHaveBeenCalledWith('physics', 5);
    });

    it('carga datos de Wikipedia correctamente', async () => {
      const mockData = [{ id: 1, title: 'Article 1', type: 'Articulo' }];

      fetchWikipediaArticles.mockResolvedValueOnce(mockData);

      const { result } = renderHook(() => useApiContent('wikipedia', 'history', 3));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(fetchWikipediaArticles).toHaveBeenCalledWith('history', 3);
    });

    it('carga datos de Hacker News correctamente', async () => {
      const mockData = [{ id: 1, title: 'Story 1', type: 'Noticia' }];

      fetchHackerNews.mockResolvedValueOnce(mockData);

      const { result } = renderHook(() => useApiContent('hackernews', 'top', 10));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(fetchHackerNews).toHaveBeenCalledWith('top', 10);
    });

    it('carga datos de OpenLibrary correctamente', async () => {
      const mockData = [{ id: '/works/1', title: 'Book 1', type: 'Libro' }];

      fetchBooks.mockResolvedValueOnce(mockData);

      const { result } = renderHook(() => useApiContent('openlibrary', 'fiction', 5));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(fetchBooks).toHaveBeenCalledWith('fiction', 5);
    });

    it('carga datos de iNaturalist correctamente', async () => {
      const mockData = [{ id: 1, species: 'Oak', type: 'Observacion' }];

      fetchNatureObservations.mockResolvedValueOnce(mockData);

      const { result } = renderHook(() => useApiContent('inaturalist', 'plants', 5));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(fetchNatureObservations).toHaveBeenCalledWith('plants', 5);
    });
  });

  describe('Manejo de errores', () => {
    it('maneja error de fetch correctamente', async () => {
      fetchArxivPapers.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useApiContent('arxiv', 'physics', 5));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.data).toEqual([]);
    });

    it('llama showToast cuando hay error y showToast esta disponible', async () => {
      const mockShowToast = vi.fn();
      fetchArxivPapers.mockRejectedValueOnce(new Error('API failed'));

      const { result } = renderHook(() => useApiContent('arxiv', 'physics', 5, mockShowToast));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockShowToast).toHaveBeenCalledWith('Error al cargar contenido', 'error');
    });
  });

  describe('Datos vacios', () => {
    it('no muestra warning cuando API retorna array vacio', async () => {
      const mockShowToast = vi.fn();
      fetchArxivPapers.mockResolvedValueOnce([]);

      const { result } = renderHook(() => useApiContent('arxiv', 'physics', 5, mockShowToast));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockShowToast).not.toHaveBeenCalled();
    });
  });

  describe('Casos especiales', () => {
    it('retorna mock data para lastfm sin llamar API', async () => {
      const { result } = renderHook(() => useApiContent('lastfm', 'music', 5));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // lastfm usa datos mock fijos
      expect(result.current.data.length).toBeGreaterThan(0);
      const firstItem = result.current.data[0];
      expect(firstItem && 'title' in firstItem ? firstItem.title : undefined).toBe('Clair de Lune');
    });

    it('retorna array vacio para apiSource desconocido', async () => {
      const { result } = renderHook(() => useApiContent('unknown', 'test', 5));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });
});
