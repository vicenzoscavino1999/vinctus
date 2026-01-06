// API Services for Vinctus
// All APIs used here are 100% free and don't require API keys

// CORS proxy for APIs that don't allow direct browser requests
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

// ===== arXiv API (Science) =====
export async function fetchArxivPapers(category = 'physics', maxResults = 10) {
    const categoryMap = {
        'physics': 'physics.gen-ph',
        'quantum': 'quant-ph',
        'cosmology': 'astro-ph.CO',
        'math': 'math.GM',
        'cs': 'cs.AI',
        'quant-ph': 'quant-ph', // Added for direct use
        'astro-ph.CO': 'astro-ph.CO' // Added for direct use
    };

    const query = categoryMap[category] || category;
    const arxivUrl = `https://export.arxiv.org/api/query?search_query=cat:${query}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;
    const url = CORS_PROXY + encodeURIComponent(arxivUrl);

    try {
        const response = await fetch(url);
        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');
        const entries = xml.querySelectorAll('entry');

        return Array.from(entries).map(entry => ({
            id: entry.querySelector('id')?.textContent?.split('/abs/')[1] || '',
            title: entry.querySelector('title')?.textContent?.trim().replace(/\s+/g, ' ') || '',
            summary: entry.querySelector('summary')?.textContent?.trim().substring(0, 200) + '...' || '',
            authors: Array.from(entry.querySelectorAll('author name')).map(a => a.textContent).slice(0, 3).join(', '),
            published: entry.querySelector('published')?.textContent?.split('T')[0] || '',
            link: entry.querySelector('id')?.textContent || '',
            type: 'Paper'
        }));
    } catch (error) {
        console.error('arXiv API error:', error);
        return [];
    }
}

// ===== Wikipedia API (History) =====
export async function fetchWikipediaArticles(topic = 'Ancient_history', limit = 10) {
    const url = `https://en.wikipedia.org/api/rest_v1/page/related/${encodeURIComponent(topic)}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        return (data.pages || []).slice(0, limit).map(page => ({
            id: page.pageid,
            title: page.titles?.normalized || page.title,
            summary: page.extract?.substring(0, 200) + '...' || '',
            thumbnail: page.thumbnail?.source || null,
            link: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
            type: 'Artículo'
        }));
    } catch (error) {
        console.error('Wikipedia API error:', error);
        return [];
    }
}

// ===== Hacker News API (Technology) =====
export async function fetchHackerNews(type = 'top', limit = 10) {
    const typeMap = {
        'top': 'topstories',
        'new': 'newstories',
        'best': 'beststories'
    };

    const storyType = typeMap[type] || 'topstories';

    try {
        const idsResponse = await fetch(`https://hacker-news.firebaseio.com/v0/${storyType}.json`);
        const ids = await idsResponse.json();

        const stories = await Promise.all(
            ids.slice(0, limit).map(async (id) => {
                const storyResponse = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
                return storyResponse.json();
            })
        );

        return stories.filter(s => s && s.title).map(story => ({
            id: story.id,
            title: story.title,
            url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
            author: story.by,
            score: story.score,
            comments: story.descendants || 0,
            time: new Date(story.time * 1000).toLocaleDateString('es-ES'),
            type: story.type === 'job' ? 'Empleo' : 'Noticia'
        }));
    } catch (error) {
        console.error('Hacker News API error:', error);
        return [];
    }
}

// ===== Open Library API (Literature) =====
export async function fetchBooks(subject = 'fiction', limit = 10) {
    const url = `https://openlibrary.org/subjects/${subject}.json?limit=${limit}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        return (data.works || []).map(work => ({
            id: work.key,
            title: work.title,
            authors: work.authors?.map(a => a.name).join(', ') || 'Anónimo',
            cover: work.cover_id ? `https://covers.openlibrary.org/b/id/${work.cover_id}-M.jpg` : null,
            firstPublished: work.first_publish_year || 'Desconocido',
            link: `https://openlibrary.org${work.key}`,
            type: 'Libro'
        }));
    } catch (error) {
        console.error('Open Library API error:', error);
        return [];
    }
}

// ===== iNaturalist API (Nature) =====
export async function fetchNatureObservations(taxon = 'plants', limit = 10) {
    const taxonMap = {
        'plants': '47126',
        'birds': '3',
        'mammals': '40151',
        'insects': '47158',
        'reptiles': '26036'
    };

    const taxonId = taxonMap[taxon] || taxon;
    const url = `https://api.inaturalist.org/v1/observations?taxon_id=${taxonId}&quality_grade=research&per_page=${limit}&order=desc&order_by=created_at`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        return (data.results || []).map(obs => ({
            id: obs.id,
            species: obs.taxon?.preferred_common_name || obs.taxon?.name || 'Especie desconocida',
            scientificName: obs.taxon?.name || '',
            location: obs.place_guess || 'Ubicación desconocida',
            photo: obs.photos?.[0]?.url?.replace('square', 'medium') || null,
            observer: obs.user?.login || 'Anónimo',
            date: obs.observed_on || '',
            link: `https://www.inaturalist.org/observations/${obs.id}`,
            type: 'Observación'
        }));
    } catch (error) {
        console.error('iNaturalist API error:', error);
        return [];
    }
}

// ===== Last.fm API (Music) - Free tier =====
// Note: Requires API key from last.fm (free)
const LASTFM_API_KEY = ''; // User needs to add their key

export async function fetchMusicInfo(artist = '', limit = 10) {
    if (!LASTFM_API_KEY) {
        // Return mock data if no API key
        return [
            { id: 1, title: 'Configurar Last.fm API', artist: 'Sistema', type: 'Info' }
        ];
    }

    const url = `https://ws.audioscrobbler.com/2.0/?method=chart.gettoptracks&api_key=${LASTFM_API_KEY}&format=json&limit=${limit}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        return (data.tracks?.track || []).map(track => ({
            id: track.mbid || track.name,
            title: track.name,
            artist: track.artist?.name || 'Desconocido',
            playcount: track.playcount,
            listeners: track.listeners,
            link: track.url,
            type: 'Canción'
        }));
    } catch (error) {
        console.error('Last.fm API error:', error);
        return [];
    }
}
