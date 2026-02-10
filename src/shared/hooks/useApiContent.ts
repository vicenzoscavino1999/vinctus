// Custom hooks for API data fetching
import { useState, useEffect } from 'react';
import {
  fetchArxivPapers,
  fetchWikipediaArticles,
  fetchHackerNews,
  fetchBooks,
  fetchNatureObservations,
  fetchMusicInfo,
} from '@/shared/lib/api';
import type { ToastContextType } from '../types';

type ShowToastFn = ToastContextType['showToast'];
type ApiContentItem =
  | Awaited<ReturnType<typeof fetchArxivPapers>>[number]
  | Awaited<ReturnType<typeof fetchWikipediaArticles>>[number]
  | Awaited<ReturnType<typeof fetchHackerNews>>[number]
  | Awaited<ReturnType<typeof fetchBooks>>[number]
  | Awaited<ReturnType<typeof fetchNatureObservations>>[number]
  | Awaited<ReturnType<typeof fetchMusicInfo>>[number];

interface UseApiContentReturn {
  data: ApiContentItem[];
  loading: boolean;
  error: string | null;
}

// Generic hook for API content
// Optional: pass showToast function to display subtle error notifications
export function useApiContent(
  apiSource: string | null,
  query: string | null,
  limit: number = 8,
  showToast: ShowToastFn | null = null,
): UseApiContentReturn {
  const [data, setData] = useState<ApiContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        let result: ApiContentItem[] = [];

        switch (apiSource) {
          case 'arxiv':
            result = await fetchArxivPapers(query || 'physics', limit);
            break;
          case 'wikipedia':
            result = await fetchWikipediaArticles(query || 'Ancient_history', limit);
            break;
          case 'hackernews':
            result = await fetchHackerNews(query || 'top', limit);
            break;
          case 'openlibrary':
            result = await fetchBooks(query || 'fiction', limit);
            break;
          case 'inaturalist':
            result = await fetchNatureObservations(query || 'plants', limit);
            break;
          case 'lastfm':
            result = await fetchMusicInfo(query || 'top hits', limit);
            break;
          default:
            result = [];
        }

        if (!isActive) return;
        setData(result);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
        if (!isActive) return;
        setError(errorMessage);
        setData([]);
        // Show subtle toast notification
        if (showToast && isActive) {
          showToast('Error al cargar contenido', 'error');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    if (apiSource) {
      fetchData();
    } else {
      setLoading(false);
    }
    return () => {
      isActive = false;
    };
  }, [apiSource, query, limit, showToast]);

  return { data, loading, error };
}
