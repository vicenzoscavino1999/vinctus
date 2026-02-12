// API Services for Vinctus
// First tries server-side proxy (/api/discover) with cache.
// Falls back to direct public APIs when proxy is unavailable in local/dev.

const DEFAULT_CORS_PROXY = 'https://api.allorigins.win/raw?url=';
const CORS_PROXY = import.meta.env.VITE_CORS_PROXY ?? DEFAULT_CORS_PROXY;
const HAS_CORS_PROXY = Boolean(CORS_PROXY);
const DISCOVER_PROXY_ENDPOINT = '/api/discover';
const DEFAULT_MUSIC_COUNTRY = 'US';

type DiscoverSource =
  | 'arxiv'
  | 'wikipedia'
  | 'hackernews'
  | 'openlibrary'
  | 'inaturalist'
  | 'lastfm';

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

interface DiscoverProxyPayload<T> {
  data?: T[];
}

interface WikipediaPage {
  description?: string;
  excerpt?: string;
  id?: number;
  key?: string;
  thumbnail?: {
    url?: string;
  };
  title?: string;
}

interface WikipediaGeneratorPage {
  extract?: string;
  pageid?: number;
  thumbnail?: {
    source?: string;
  };
  title?: string;
}

interface HackerNewsItem {
  id: number;
  title?: string;
  url?: string;
  by?: string;
  score?: number;
  descendants?: number;
  time?: number;
  type?: string;
}

interface OpenLibraryWork {
  key: string;
  title?: string;
  authors?: Array<{ name?: string }>;
  cover_id?: number;
  first_publish_year?: number | string;
}

interface INaturalistObservation {
  id: number;
  taxon?: {
    preferred_common_name?: string;
    name?: string;
  };
  place_guess?: string;
  photos?: Array<{ url?: string }>;
  user?: {
    login?: string;
  };
  observed_on?: string;
}

interface ITunesTrack {
  artistName?: string;
  collectionId?: number;
  collectionName?: string;
  collectionViewUrl?: string;
  trackId?: number;
  trackName?: string;
  trackViewUrl?: string;
}

const buildHttpError = (label: string, response: Response): Error => {
  const statusText = response.statusText || 'Unknown';
  return new Error(`${label} request failed (${response.status} ${statusText})`);
};

const fetchJsonOrThrow = async <T>(url: string, label: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw buildHttpError(label, response);
  }
  return response.json() as Promise<T>;
};

const fetchTextOrThrow = async (url: string, label: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw buildHttpError(label, response);
  }
  return response.text();
};

const shouldFallbackToProxy = (error: unknown): boolean =>
  HAS_CORS_PROXY && error instanceof TypeError;

const fetchTextWithProxyFallback = async (url: string, label: string): Promise<string> => {
  try {
    return await fetchTextOrThrow(url, label);
  } catch (error) {
    if (!shouldFallbackToProxy(error)) {
      throw error;
    }
    const proxiedUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
    return fetchTextOrThrow(proxiedUrl, `${label} (proxy)`);
  }
};

const stripHtmlTags = (value: string): string => value.replace(/<[^>]+>/g, '');

const normalizeWikipediaThumbnail = (url: string | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('//')) return `https:${url}`;
  return url;
};

const fetchDiscoverProxy = async <T>(
  source: DiscoverSource,
  query: string,
  limit: number,
): Promise<T[]> => {
  const params = new URLSearchParams({
    limit: String(limit),
    query,
    source,
  });
  const response = await fetch(`${DISCOVER_PROXY_ENDPOINT}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw buildHttpError('Discover proxy', response);
  }
  const payload = (await response.json().catch(() => null)) as DiscoverProxyPayload<T> | null;
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error('Discover proxy returned invalid payload');
  }
  return payload.data;
};

const withDiscoverProxy = async <T>(
  source: DiscoverSource,
  query: string,
  limit: number,
  fallback: () => Promise<T[]>,
): Promise<T[]> => {
  try {
    return await fetchDiscoverProxy<T>(source, query, limit);
  } catch (error) {
    console.warn(`[discover] proxy failed for ${source}, using direct fallback`, error);
    return fallback();
  }
};

async function fetchArxivPapersDirect(
  category: string = 'physics',
  maxResults: number = 10,
): Promise<ArxivPaper[]> {
  const categoryMap: Record<string, string> = {
    physics: 'physics.gen-ph',
    quantum: 'quant-ph',
    cosmology: 'astro-ph.CO',
    math: 'math.GM',
    cs: 'cs.AI',
    'quant-ph': 'quant-ph',
    'astro-ph.CO': 'astro-ph.CO',
  };

  const query = categoryMap[category] || category;
  const arxivUrl = `https://export.arxiv.org/api/query?search_query=cat:${query}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;
  const text = await fetchTextWithProxyFallback(arxivUrl, 'arXiv');

  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');
  const entries = Array.from(xml.getElementsByTagName('entry'));

  const getText = (parent: Element, tag: string): string => {
    const element = parent.getElementsByTagName(tag)[0];
    return element?.textContent?.trim() || '';
  };

  const getAuthors = (parent: Element): string => {
    const authors = Array.from(parent.getElementsByTagName('author'))
      .map((author) => author.getElementsByTagName('name')[0]?.textContent?.trim() || '')
      .filter(Boolean);
    return authors.slice(0, 3).join(', ') || 'Anonimo';
  };

  return entries.map((entry) => {
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
      type: 'Paper',
    };
  });
}

async function fetchWikipediaArticlesDirect(
  topic: string = 'Ancient_history',
  limit: number = 10,
): Promise<WikipediaArticle[]> {
  const mapFromRestSearch = (pages: WikipediaPage[]): WikipediaArticle[] =>
    pages.slice(0, limit).map((page, index) => {
      const title = page.title?.trim() || 'Sin titulo';
      const summaryRaw = page.excerpt || page.description || 'Sin resumen disponible';
      const summary = stripHtmlTags(summaryRaw);
      const key = page.key?.trim() || title.replace(/\s+/g, '_');

      return {
        id: Number.isFinite(Number(page.id)) ? Number(page.id) : index,
        title,
        summary: summary ? summary.substring(0, 200) + '...' : 'Sin resumen disponible',
        thumbnail: normalizeWikipediaThumbnail(page.thumbnail?.url),
        link: `https://en.wikipedia.org/wiki/${encodeURIComponent(key)}`,
        type: 'Articulo',
      };
    });

  const mapFromActionApi = (pagesMap: Record<string, WikipediaGeneratorPage>): WikipediaArticle[] =>
    Object.values(pagesMap)
      .slice(0, limit)
      .map((page, index) => {
        const title = page.title?.trim() || 'Sin titulo';
        const summary = stripHtmlTags(page.extract || 'Sin resumen disponible');
        const key = title.replace(/\s+/g, '_');
        return {
          id: Number.isFinite(Number(page.pageid)) ? Number(page.pageid) : index,
          title,
          summary: summary ? summary.substring(0, 200) + '...' : 'Sin resumen disponible',
          thumbnail: normalizeWikipediaThumbnail(page.thumbnail?.source),
          link: `https://en.wikipedia.org/wiki/${encodeURIComponent(key)}`,
          type: 'Articulo',
        };
      });

  try {
    const url = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(topic)}&limit=${limit}`;
    const data = await fetchJsonOrThrow<{ pages?: WikipediaPage[] }>(url, 'Wikipedia');
    const pages = data.pages || [];
    if (pages.length > 0) {
      return mapFromRestSearch(pages);
    }
  } catch (error) {
    console.warn('[discover] wikipedia rest search failed, using action api fallback', error);
  }

  const fallbackUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(topic)}&gsrlimit=${limit}&prop=extracts|pageimages&exintro=1&explaintext=1&exchars=260&piprop=thumbnail&pithumbsize=320`;
  const fallbackData = await fetchJsonOrThrow<{
    query?: { pages?: Record<string, WikipediaGeneratorPage> };
  }>(fallbackUrl, 'Wikipedia Action API');
  return mapFromActionApi(fallbackData.query?.pages || {});
}

async function fetchHackerNewsDirect(
  type: string = 'top',
  limit: number = 10,
): Promise<HackerNewsStory[]> {
  const typeMap: Record<string, string> = {
    top: 'topstories',
    new: 'newstories',
    best: 'beststories',
  };

  const storyType = typeMap[type] || 'topstories';
  const ids = await fetchJsonOrThrow<number[]>(
    `https://hacker-news.firebaseio.com/v0/${storyType}.json`,
    'Hacker News list',
  );

  const stories = await Promise.all(
    ids
      .slice(0, limit)
      .map((id) =>
        fetchJsonOrThrow<HackerNewsItem>(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          `Hacker News item ${id}`,
        ),
      ),
  );

  return stories
    .filter((story): story is HackerNewsItem => Boolean(story?.title))
    .map((story) => ({
      id: story.id,
      title: story.title || 'Sin titulo',
      url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
      author: story.by || 'Anonimo',
      score: story.score || 0,
      comments: story.descendants || 0,
      time: new Date((story.time || 0) * 1000).toLocaleDateString('es-ES'),
      type: story.type === 'job' ? 'Empleo' : 'Noticia',
    }));
}

async function fetchBooksDirect(subject: string = 'fiction', limit: number = 10): Promise<Book[]> {
  const url = `https://openlibrary.org/subjects/${subject}.json?limit=${limit}`;
  const data = await fetchJsonOrThrow<{ works?: OpenLibraryWork[] }>(url, 'Open Library');

  return (data.works || []).map((work) => ({
    id: work.key,
    title: work.title || 'Sin titulo',
    authors:
      work.authors
        ?.map((author) => author.name)
        .filter(Boolean)
        .join(', ') || 'Anonimo',
    cover: work.cover_id ? `https://covers.openlibrary.org/b/id/${work.cover_id}-M.jpg` : null,
    firstPublished: work.first_publish_year || 'Desconocido',
    link: `https://openlibrary.org${work.key}`,
    type: 'Libro',
  }));
}

async function fetchNatureObservationsDirect(
  taxon: string = 'plants',
  limit: number = 10,
): Promise<NatureObservation[]> {
  const taxonMap: Record<string, string> = {
    plants: '47126',
    birds: '3',
    mammals: '40151',
    insects: '47158',
    reptiles: '26036',
  };

  const taxonId = taxonMap[taxon] || taxon;
  const url = `https://api.inaturalist.org/v1/observations?taxon_id=${taxonId}&quality_grade=research&per_page=${limit}&order=desc&order_by=created_at`;
  const data = await fetchJsonOrThrow<{ results?: INaturalistObservation[] }>(url, 'iNaturalist');

  return (data.results || []).map((obs) => ({
    id: obs.id,
    species: obs.taxon?.preferred_common_name || obs.taxon?.name || 'Especie desconocida',
    scientificName: obs.taxon?.name || '',
    location: obs.place_guess || 'Ubicacion desconocida',
    photo: obs.photos?.[0]?.url?.replace('square', 'medium') || null,
    observer: obs.user?.login || 'Anonimo',
    date: obs.observed_on || '',
    link: `https://www.inaturalist.org/observations/${obs.id}`,
    type: 'Observacion',
  }));
}

async function fetchMusicInfoDirect(
  artist: string = '',
  limit: number = 10,
): Promise<MusicTrack[]> {
  const query = artist.trim() || 'top hits';
  const country = (import.meta.env.VITE_MUSIC_COUNTRY || DEFAULT_MUSIC_COUNTRY).trim();
  const url = `https://itunes.apple.com/search?media=music&entity=song&term=${encodeURIComponent(query)}&limit=${limit}&country=${encodeURIComponent(country || DEFAULT_MUSIC_COUNTRY)}`;
  const data = await fetchJsonOrThrow<{ results?: ITunesTrack[] }>(url, 'iTunes Search');

  return (data.results || []).map((track, index) => ({
    id: track.trackId || track.collectionId || `track-${index}`,
    title: track.trackName || track.collectionName || 'Sin titulo',
    artist: track.artistName || 'Desconocido',
    link: track.trackViewUrl || track.collectionViewUrl || undefined,
    type: 'Cancion',
  }));
}

export async function fetchArxivPapers(
  category: string = 'physics',
  maxResults: number = 10,
): Promise<ArxivPaper[]> {
  return withDiscoverProxy('arxiv', category || 'physics', maxResults, () =>
    fetchArxivPapersDirect(category, maxResults),
  );
}

export async function fetchWikipediaArticles(
  topic: string = 'Ancient_history',
  limit: number = 10,
): Promise<WikipediaArticle[]> {
  return withDiscoverProxy('wikipedia', topic || 'Ancient_history', limit, () =>
    fetchWikipediaArticlesDirect(topic, limit),
  );
}

export async function fetchHackerNews(
  type: string = 'top',
  limit: number = 10,
): Promise<HackerNewsStory[]> {
  return withDiscoverProxy('hackernews', type || 'top', limit, () =>
    fetchHackerNewsDirect(type, limit),
  );
}

export async function fetchBooks(subject: string = 'fiction', limit: number = 10): Promise<Book[]> {
  return withDiscoverProxy('openlibrary', subject || 'fiction', limit, () =>
    fetchBooksDirect(subject, limit),
  );
}

export async function fetchNatureObservations(
  taxon: string = 'plants',
  limit: number = 10,
): Promise<NatureObservation[]> {
  return withDiscoverProxy('inaturalist', taxon || 'plants', limit, () =>
    fetchNatureObservationsDirect(taxon, limit),
  );
}

export async function fetchMusicInfo(
  artist: string = '',
  limit: number = 10,
): Promise<MusicTrack[]> {
  return withDiscoverProxy('lastfm', artist || 'top hits', limit, () =>
    fetchMusicInfoDirect(artist, limit),
  );
}
