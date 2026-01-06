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
export function useApiContent(apiSource, query, limit = 8) {
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
                    default:
                        result = [];
                }

                setData(result);
            } catch (err) {
                setError(err.message);
                setData([]);
            } finally {
                setLoading(false);
            }
        }

        if (apiSource && query) {
            fetchData();
        } else {
            setLoading(false);
        }
    }, [apiSource, query, limit]);

    return { data, loading, error };
}
