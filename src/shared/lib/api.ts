// API Services for Vinctus
// First tries server-side proxy (/api/discover) with cache.
// Falls back to direct public APIs when proxy is unavailable in local/dev.

const CORS_PROXY = (import.meta.env.VITE_CORS_PROXY ?? '').trim();
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

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => {
      const parsed = Number.parseInt(code, 10);
      return Number.isFinite(parsed) && parsed > 0 && parsed <= 0x10ffff
        ? String.fromCodePoint(parsed)
        : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const parsed = Number.parseInt(hex, 16);
      return Number.isFinite(parsed) && parsed > 0 && parsed <= 0x10ffff
        ? String.fromCodePoint(parsed)
        : '';
    })
    .replace(/&amp;/g, '&');

const withEllipsis = (value: string, maxChars: number): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trim()}...`;
};

const isSafeHttpUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https?:\/\//i.test(value.trim());

const MUSIC_QUERY_MAP: Record<string, string> = {
  salsa: 'latin salsa',
  jazz: 'jazz',
  classical: 'classical music',
  music: 'top hits',
};

const normalizeWikipediaThumbnail = (url: string | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('//')) return `https:${url}`;
  return isSafeHttpUrl(url) ? url.trim() : null;
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
  const arxivUrl = `https://export.arxiv.org/api/query?search_query=cat:${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;
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
    const arxivId = idText.split('/abs/')[1] || '';

    return {
      id: arxivId,
      title: titleText ? titleText.replace(/\s+/g, ' ') : 'Sin titulo',
      summary: summary ? withEllipsis(summary, 220) : 'Sin resumen disponible',
      authors: getAuthors(entry),
      published: publishedText.split('T')[0] || '',
      link: isSafeHttpUrl(idText) ? idText : arxivId ? `https://arxiv.org/abs/${arxivId}` : '',
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
      const title = decodeHtmlEntities(page.title?.trim() || 'Sin titulo');
      const summaryRaw = page.excerpt || page.description || 'Sin resumen disponible';
      const summary = decodeHtmlEntities(stripHtmlTags(summaryRaw));
      const key = page.key?.trim() || title.replace(/\s+/g, '_');

      return {
        id: Number.isFinite(Number(page.id)) ? Number(page.id) : index,
        title,
        summary: summary ? withEllipsis(summary, 220) : 'Sin resumen disponible',
        thumbnail: normalizeWikipediaThumbnail(page.thumbnail?.url),
        link: `https://en.wikipedia.org/wiki/${encodeURIComponent(key)}`,
        type: 'Articulo',
      };
    });

  const mapFromActionApi = (pagesMap: Record<string, WikipediaGeneratorPage>): WikipediaArticle[] =>
    Object.values(pagesMap)
      .slice(0, limit)
      .map((page, index) => {
        const title = decodeHtmlEntities(page.title?.trim() || 'Sin titulo');
        const summary = decodeHtmlEntities(stripHtmlTags(page.extract || 'Sin resumen disponible'));
        const key = title.replace(/\s+/g, '_');
        return {
          id: Number.isFinite(Number(page.pageid)) ? Number(page.pageid) : index,
          title,
          summary: summary ? withEllipsis(summary, 220) : 'Sin resumen disponible',
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

  const settled = await Promise.allSettled(
    (Array.isArray(ids) ? ids : [])
      .slice(0, limit)
      .map((id) =>
        fetchJsonOrThrow<HackerNewsItem | null>(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          `Hacker News item ${id}`,
        ),
      ),
  );

  return settled
    .filter(
      (result): result is PromiseFulfilledResult<HackerNewsItem | null> =>
        result.status === 'fulfilled',
    )
    .map((result) => result.value)
    .filter((story): story is HackerNewsItem =>
      Boolean(
        story && typeof story === 'object' && typeof story.title === 'string' && story.title.trim(),
      ),
    )
    .map((story) => ({
      id: story.id,
      title: decodeHtmlEntities(story.title?.trim() || 'Sin titulo'),
      url: isSafeHttpUrl(story.url)
        ? story.url.trim()
        : `https://news.ycombinator.com/item?id=${story.id}`,
      author: story.by || 'Anonimo',
      score: story.score || 0,
      comments: story.descendants || 0,
      time: new Date((story.time || 0) * 1000).toLocaleDateString('es-ES'),
      type: story.type === 'job' ? 'Empleo' : 'Noticia',
    }));
}

async function fetchBooksDirect(subject: string = 'fiction', limit: number = 10): Promise<Book[]> {
  const url = `https://openlibrary.org/subjects/${encodeURIComponent(subject)}.json?limit=${limit}`;
  const data = await fetchJsonOrThrow<{ works?: OpenLibraryWork[] }>(url, 'Open Library');

  return (data.works || []).map((work, index) => {
    const coverId = typeof work.cover_id === 'number' ? work.cover_id : Number.NaN;
    const rawKey = typeof work.key === 'string' ? work.key.trim() : '';
    const safeKey = rawKey.startsWith('/') ? rawKey : '';
    return {
      id: rawKey || `book-${index + 1}`,
      title: decodeHtmlEntities(work.title || 'Sin titulo').trim() || 'Sin titulo',
      authors:
        work.authors
          ?.map((author) => author.name)
          .filter(Boolean)
          .join(', ') || 'Anonimo',
      cover:
        Number.isFinite(coverId) && coverId > 0
          ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
          : null,
      firstPublished: work.first_publish_year || 'Desconocido',
      link: `https://openlibrary.org${safeKey}`,
      type: 'Libro',
    };
  });
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
  const url = `https://api.inaturalist.org/v1/observations?taxon_id=${encodeURIComponent(taxonId)}&quality_grade=research&per_page=${limit}&order=desc&order_by=created_at`;
  const data = await fetchJsonOrThrow<{ results?: INaturalistObservation[] }>(url, 'iNaturalist');

  return (data.results || []).map((obs) => {
    const rawPhoto = obs.photos?.[0]?.url;
    return {
      id: obs.id,
      species: obs.taxon?.preferred_common_name || obs.taxon?.name || 'Especie desconocida',
      scientificName: obs.taxon?.name || '',
      location: obs.place_guess || 'Ubicacion desconocida',
      photo: isSafeHttpUrl(rawPhoto) ? rawPhoto.trim().replace('square', 'medium') : null,
      observer: obs.user?.login || 'Anonimo',
      date: obs.observed_on || '',
      link: `https://www.inaturalist.org/observations/${obs.id}`,
      type: 'Observacion',
    };
  });
}

async function fetchMusicInfoDirect(
  artist: string = '',
  limit: number = 10,
): Promise<MusicTrack[]> {
  const trimmed = artist.trim();
  const query = MUSIC_QUERY_MAP[trimmed.toLowerCase()] || trimmed || 'top hits';
  const country = (import.meta.env.VITE_MUSIC_COUNTRY || DEFAULT_MUSIC_COUNTRY).trim();
  const url = `https://itunes.apple.com/search?media=music&entity=song&term=${encodeURIComponent(query)}&limit=${limit}&country=${encodeURIComponent(country || DEFAULT_MUSIC_COUNTRY)}`;
  const data = await fetchJsonOrThrow<{ results?: ITunesTrack[] }>(url, 'iTunes Search');

  return (data.results || []).map((track, index) => ({
    id: track.trackId || track.collectionId || `track-${index}`,
    title: track.trackName || track.collectionName || 'Sin titulo',
    artist: track.artistName || 'Desconocido',
    link: isSafeHttpUrl(track.trackViewUrl)
      ? track.trackViewUrl.trim()
      : isSafeHttpUrl(track.collectionViewUrl)
        ? track.collectionViewUrl.trim()
        : undefined,
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
