// Custom hooks for API data fetching
import { useState, useEffect } from 'react';
import {
  fetchArxivPapers,
  fetchWikipediaArticles,
  fetchHackerNews,
  fetchBooks,
  fetchNatureObservations,
} from '@/shared/lib/api';
import type { ToastContextType } from '../types';

type ShowToastFn = ToastContextType['showToast'];

interface UseApiContentReturn {
  data: any[];
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
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        let result: any[] = [];

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
            // Mock data for music - Last.fm requires API key
            result = [
              {
                id: 1,
                title: 'Clair de Lune',
                artist: 'Claude Debussy',
                type: 'Clasica',
                link: 'https://www.last.fm/music/Claude+Debussy',
              },
              {
                id: 2,
                title: 'Take Five',
                artist: 'Dave Brubeck',
                type: 'Jazz',
                link: 'https://www.last.fm/music/Dave+Brubeck',
              },
              {
                id: 3,
                title: 'Bohemian Rhapsody',
                artist: 'Queen',
                type: 'Rock',
                link: 'https://www.last.fm/music/Queen',
              },
              {
                id: 4,
                title: 'So What',
                artist: 'Miles Davis',
                type: 'Jazz',
                link: 'https://www.last.fm/music/Miles+Davis',
              },
              {
                id: 5,
                title: 'Fur Elise',
                artist: 'Beethoven',
                type: 'Clasica',
                link: 'https://www.last.fm/music/Beethoven',
              },
              {
                id: 6,
                title: 'Stairway to Heaven',
                artist: 'Led Zeppelin',
                type: 'Rock',
                link: 'https://www.last.fm/music/Led+Zeppelin',
              },
            ];
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
