// API Services for Vinctus
// All APIs used here are 100% free and don't require API keys

// CORS proxy for APIs that don't allow direct browser requests
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

// ===== Type Definitions =====
interface ArxivPaper {
    id: string;
    title: string;
    summary: string;
    authors: string;
    published: string;
    link: string;
    type: string;
}

interface WikipediaArticle {
    id: number;
    title: string;
    summary: string;
    thumbnail: string | null;
    link: string;
    type: string;
}

interface HackerNewsStory {
    id: number;
    title: string;
    url: string;
    author: string;
    score: number;
    comments: number;
    time: string;
    type: string;
}

interface Book {
    id: string;
    title: string;
    authors: string;
    cover: string | null;
    firstPublished: number | string;
    link: string;
    type: string;
}

interface NatureObservation {
    id: number;
    species: string;
    scientificName: string;
    location: string;
    photo: string | null;
    observer: string;
    date: string;
    link: string;
    type: string;
}

interface MusicTrack {
    id: string | number;
    title: string;
    artist: string;
    playcount?: string;
    listeners?: string;
    link?: string;
    type: string;
}

// ===== arXiv API (Science) =====
export async function fetchArxivPapers(category: string = 'physics', maxResults: number = 10): Promise<ArxivPaper[]> {
    const categoryMap: Record<string, string> = {
        'physics': 'physics.gen-ph',
        'quantum': 'quant-ph',
        'cosmology': 'astro-ph.CO',
        'math': 'math.GM',
        'cs': 'cs.AI',
        'quant-ph': 'quant-ph',
        'astro-ph.CO': 'astro-ph.CO'
    };

    const query = categoryMap[category] || category;
    const arxivUrl = `https://export.arxiv.org/api/query?search_query=cat:${query}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;
    const url = CORS_PROXY + encodeURIComponent(arxivUrl);

    try {
        const response = await fetch(url);
        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');
        const entries = Array.from(xml.getElementsByTagName('entry'));

        const getText = (parent: Element, tag: string): string => {
            const element = parent.getElementsByTagName(tag)[0];
            return element?.textContent?.trim() || '';
        };

        const getAuthors = (parent: Element): string => {
            const authors = Array.from(parent.getElementsByTagName('author'))
                .map(author => author.getElementsByTagName('name')[0]?.textContent?.trim() || '')
                .filter(Boolean);
            return authors.slice(0, 3).join(', ') || 'Anonimo';
        };

        return entries.map(entry => {
            const summary = getText(entry, 'summary');
            const idText = getText(entry, 'id');
            const titleText = getText(entry, 'title');
            const publishedText = getText(entry, 'published');

            return {
                id: idText.split('/abs/')[1] || '',
                title: titleText ? titleText.replace(/\s+/g, ' ') : 'Sin titulo',
                summary: summary ? summary.substring(0, 200) + '...' : 'Sin resumen disponible',
                authors: getAuthors(entry),
                published: publishedText.split('T')[0] || '',
                link: idText || '',
                type: 'Paper'
            };
        });
    } catch (error) {
        console.error('arXiv API error:', error);
        return [];
    }
}

// ===== Wikipedia API (History) =====
export async function fetchWikipediaArticles(topic: string = 'Ancient_history', limit: number = 10): Promise<WikipediaArticle[]> {
    const url = `https://en.wikipedia.org/api/rest_v1/page/related/${encodeURIComponent(topic)}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        return (data.pages || []).slice(0, limit).map((page: any) => {
            const extract = page.extract;
            return {
                id: page.pageid,
                title: page.titles?.normalized || page.title || 'Sin titulo',
                summary: extract ? extract.substring(0, 200) + '...' : 'Sin resumen disponible',
                thumbnail: page.thumbnail?.source || null,
                link: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title || '')}`,
                type: 'Articulo'
            };
        });
    } catch (error) {
        console.error('Wikipedia API error:', error);
        return [];
    }
}

// ===== Hacker News API (Technology) =====
export async function fetchHackerNews(type: string = 'top', limit: number = 10): Promise<HackerNewsStory[]> {
    const typeMap: Record<string, string> = {
        'top': 'topstories',
        'new': 'newstories',
        'best': 'beststories'
    };

    const storyType = typeMap[type] || 'topstories';

    try {
        const idsResponse = await fetch(`https://hacker-news.firebaseio.com/v0/${storyType}.json`);
        const ids: number[] = await idsResponse.json();

        const stories = await Promise.all(
            ids.slice(0, limit).map(async (id) => {
                const storyResponse = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
                return storyResponse.json();
            })
        );

        return stories.filter((s: any) => s && s.title).map((story: any) => ({
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
export async function fetchBooks(subject: string = 'fiction', limit: number = 10): Promise<Book[]> {
    const url = `https://openlibrary.org/subjects/${subject}.json?limit=${limit}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        return (data.works || []).map((work: any) => ({
            id: work.key,
            title: work.title,
            authors: work.authors?.map((a: any) => a.name).join(', ') || 'Anonimo',
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
export async function fetchNatureObservations(taxon: string = 'plants', limit: number = 10): Promise<NatureObservation[]> {
    const taxonMap: Record<string, string> = {
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

        return (data.results || []).map((obs: any) => ({
            id: obs.id,
            species: obs.taxon?.preferred_common_name || obs.taxon?.name || 'Especie desconocida',
            scientificName: obs.taxon?.name || '',
            location: obs.place_guess || 'Ubicacion desconocida',
            photo: obs.photos?.[0]?.url?.replace('square', 'medium') || null,
            observer: obs.user?.login || 'Anonimo',
            date: obs.observed_on || '',
            link: `https://www.inaturalist.org/observations/${obs.id}`,
            type: 'Observacion'
        }));
    } catch (error) {
        console.error('iNaturalist API error:', error);
        return [];
    }
}

// ===== Last.fm API (Music) - Free tier =====
// Note: Requires API key from last.fm (free)
const LASTFM_API_KEY = '';

export async function fetchMusicInfo(artist: string = '', limit: number = 10): Promise<MusicTrack[]> {
    if (!LASTFM_API_KEY) {
        return [
            { id: 1, title: 'Configurar Last.fm API', artist: 'Sistema', type: 'Info' }
        ];
    }

    const url = `https://ws.audioscrobbler.com/2.0/?method=chart.gettoptracks&api_key=${LASTFM_API_KEY}&format=json&limit=${limit}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        return (data.tracks?.track || []).map((track: any) => ({
            id: track.mbid || track.name,
            title: track.name,
            artist: track.artist?.name || 'Desconocido',
            playcount: track.playcount,
            listeners: track.listeners,
            link: track.url,
            type: 'Cancion'
        }));
    } catch (error) {
        console.error('Last.fm API error:', error);
        return [];
    }
}

