// Custom hooks for API data fetching
import { useState, useEffect } from 'react';
import {
    fetchArxivPapers,
    fetchWikipediaArticles,
    fetchHackerNews,
    fetchBooks,
    fetchNatureObservations
} from '../services/api';

// Generic hook for API content
// Optional: pass showToast function to display subtle error notifications
export function useApiContent(apiSource, query, limit = 8, showToast = null) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);

            try {
                let result = [];

                switch (apiSource) {
                    case 'arxiv':
                        result = await fetchArxivPapers(query, limit);
                        break;
                    case 'wikipedia':
                        result = await fetchWikipediaArticles(query, limit);
                        break;
                    case 'hackernews':
                        result = await fetchHackerNews(query, limit);
                        break;
                    case 'openlibrary':
                        result = await fetchBooks(query, limit);
                        break;
                    case 'inaturalist':
                        result = await fetchNatureObservations(query, limit);
                        break;
                    case 'lastfm':
                        // Mock data for music - Last.fm requires API key
                        result = [
                            { id: 1, title: 'Clair de Lune', artist: 'Claude Debussy', type: 'Clásica', link: 'https://www.last.fm/music/Claude+Debussy' },
                            { id: 2, title: 'Take Five', artist: 'Dave Brubeck', type: 'Jazz', link: 'https://www.last.fm/music/Dave+Brubeck' },
                            { id: 3, title: 'Bohemian Rhapsody', artist: 'Queen', type: 'Rock', link: 'https://www.last.fm/music/Queen' },
                            { id: 4, title: 'So What', artist: 'Miles Davis', type: 'Jazz', link: 'https://www.last.fm/music/Miles+Davis' },
                            { id: 5, title: 'Für Elise', artist: 'Beethoven', type: 'Clásica', link: 'https://www.last.fm/music/Beethoven' },
                            { id: 6, title: 'Stairway to Heaven', artist: 'Led Zeppelin', type: 'Rock', link: 'https://www.last.fm/music/Led+Zeppelin' }
                        ];
                        break;
                    default:
                        result = [];
                }

                // Check if API returned empty due to silent error
                if (result.length === 0 && apiSource && apiSource !== 'lastfm') {
                    // Show subtle toast if available
                    if (showToast) {
                        showToast('Conexión limitada - mostrando contenido disponible', 'warning');
                    }
                }

                setData(result);
            } catch (err) {
                setError(err.message);
                setData([]);
                // Show subtle toast notification
                if (showToast) {
                    showToast('Error al cargar contenido', 'error');
                }
            } finally {
                setLoading(false);
            }
        }

        if (apiSource && query) {
            fetchData();
        } else {
            setLoading(false);
        }
    }, [apiSource, query, limit, showToast]);

    return { data, loading, error };
}
