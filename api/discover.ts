import type { VercelRequest, VercelResponse } from '@vercel/node';

type SupportedSource =
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

interface WikipediaSearchPage {
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
  listeners?: string;
  link?: string;
  type: string;
}

type DiscoverItem =
  | ArxivPaper
  | WikipediaArticle
  | HackerNewsStory
  | Book
  | NatureObservation
  | MusicTrack;

type DiscoverPayload = {
  source: SupportedSource;
  query: string;
  limit: number;
  provider: string;
  ttlSeconds: number;
  fetchedAt: string;
  cached: boolean;
  data: DiscoverItem[];
};

type CacheEntry = {
  expiresAt: number;
  payload: Omit<DiscoverPayload, 'cached'>;
};

class RequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
  }
}

const DISCOVER_CACHE = new Map<string, CacheEntry>();
const CACHE_MAX_ENTRIES = 200;
const REQUEST_TIMEOUT_MS = 9000;

const SOURCE_DEFAULT_QUERY: Record<SupportedSource, string> = {
  arxiv: 'physics',
  wikipedia: 'Ancient_history',
  hackernews: 'top',
  openlibrary: 'fiction',
  inaturalist: 'plants',
  lastfm: 'top hits',
};

const SOURCE_PROVIDER: Record<SupportedSource, string> = {
  arxiv: 'arXiv',
  wikipedia: 'Wikipedia',
  hackernews: 'Hacker News',
  openlibrary: 'Open Library',
  inaturalist: 'iNaturalist',
  lastfm: 'Apple iTunes Search API',
};

const SOURCE_TTL_SECONDS: Record<SupportedSource, number> = {
  arxiv: 10 * 60,
  wikipedia: 30 * 60,
  hackernews: 2 * 60,
  openlibrary: 6 * 60 * 60,
  inaturalist: 15 * 60,
  lastfm: 10 * 60,
};

const SOURCE_ALIASES: Record<string, SupportedSource> = {
  arxiv: 'arxiv',
  hackernews: 'hackernews',
  inaturalist: 'inaturalist',
  itunes: 'lastfm',
  lastfm: 'lastfm',
  music: 'lastfm',
  openlibrary: 'openlibrary',
  wikipedia: 'wikipedia',
};

const ARXIV_CATEGORY_MAP: Record<string, string> = {
  physics: 'physics.gen-ph',
  quantum: 'quant-ph',
  cosmology: 'astro-ph.CO',
  math: 'math.GM',
  cs: 'cs.AI',
  'quant-ph': 'quant-ph',
  'astro-ph.CO': 'astro-ph.CO',
};

const HN_TYPE_MAP: Record<string, string> = {
  top: 'topstories',
  new: 'newstories',
  best: 'beststories',
};

const INATURALIST_TAXON_MAP: Record<string, string> = {
  plants: '47126',
  birds: '3',
  mammals: '40151',
  insects: '47158',
  reptiles: '26036',
};

const MUSIC_QUERY_MAP: Record<string, string> = {
  salsa: 'latin salsa',
  jazz: 'jazz',
  classical: 'classical music',
  music: 'top hits',
};

const DEFAULT_MUSIC_COUNTRY = 'US';

const getHeaderValue = (value: string | string[] | undefined): string | null => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value[0] ?? null;
  return null;
};

const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const decodeXmlEntities = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");

const stripHtmlTags = (value: string): string => value.replace(/<[^>]+>/g, '');

const normalizeWikipediaThumbnail = (url: string | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('//')) return `https:${url}`;
  return url;
};

const withEllipsis = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trim()}...`;
};

const parseLimit = (rawLimit: string | null): number => {
  if (!rawLimit) return 8;
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed)) throw new RequestError('Invalid "limit" value', 400);
  if (parsed < 1 || parsed > 20) throw new RequestError('"limit" must be between 1 and 20', 400);
  return parsed;
};

const parseSource = (rawSource: string | null): SupportedSource => {
  if (!rawSource) {
    throw new RequestError('Missing required query param "source"', 400);
  }
  const normalized = rawSource.trim().toLowerCase();
  const source = SOURCE_ALIASES[normalized];
  if (!source) {
    throw new RequestError(
      `Unsupported source "${rawSource}". Use one of: arxiv, wikipedia, hackernews, openlibrary, inaturalist, lastfm`,
      400,
    );
  }
  return source;
};

const parseQuery = (rawQuery: string | null, source: SupportedSource): string => {
  const fallback = SOURCE_DEFAULT_QUERY[source];
  if (!rawQuery) return fallback;
  const normalized = rawQuery.trim();
  if (!normalized) return fallback;
  if (normalized.length > 120) {
    throw new RequestError('"query" is too long (max 120 chars)', 400);
  }
  return normalized;
};

const pruneCache = (): void => {
  const now = Date.now();
  for (const [key, entry] of DISCOVER_CACHE.entries()) {
    if (entry.expiresAt <= now) {
      DISCOVER_CACHE.delete(key);
    }
  }
  if (DISCOVER_CACHE.size <= CACHE_MAX_ENTRIES) return;
  const keys = [...DISCOVER_CACHE.keys()];
  const extra = DISCOVER_CACHE.size - CACHE_MAX_ENTRIES;
  for (let i = 0; i < extra; i += 1) {
    const key = keys[i];
    if (key) DISCOVER_CACHE.delete(key);
  }
};

const buildCacheControl = (ttlSeconds: number): string => {
  const sMaxAge = Math.max(30, Math.min(ttlSeconds, 1800));
  const staleSeconds = Math.max(sMaxAge, Math.min(ttlSeconds * 2, 3600));
  return `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${staleSeconds}`;
};

const getQueryParam = (req: VercelRequest, key: string): string | null => {
  const value = req.query?.[key];
  return getHeaderValue(value as string | string[] | undefined);
};

const fetchWithTimeout = async (url: string, label: string): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const statusText = response.statusText || 'Unknown';
      throw new Error(`${label} failed (${response.status} ${statusText})`);
    }
    return response;
  } catch (error) {
    const maybeError = error as { name?: string; message?: string };
    if (maybeError?.name === 'AbortError') {
      throw new Error(`${label} timeout`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchJsonWithTimeout = async <T>(url: string, label: string): Promise<T> => {
  const response = await fetchWithTimeout(url, label);
  return response.json() as Promise<T>;
};

const fetchTextWithTimeout = async (url: string, label: string): Promise<string> => {
  const response = await fetchWithTimeout(url, label);
  return response.text();
};

const extractXmlTag = (entry: string, tag: string): string => {
  const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const match = entry.match(regex);
  return decodeXmlEntities(normalizeText(match?.[1] ?? ''));
};

const fetchArxiv = async (query: string, limit: number): Promise<ArxivPaper[]> => {
  const mappedCategory = ARXIV_CATEGORY_MAP[query] || query;
  const url = `https://export.arxiv.org/api/query?search_query=cat:${encodeURIComponent(mappedCategory)}&start=0&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`;
  const xml = await fetchTextWithTimeout(url, 'arXiv');
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => match[1] ?? '');

  return entries.slice(0, limit).map((entry, index) => {
    const idRaw = extractXmlTag(entry, 'id');
    const titleRaw = extractXmlTag(entry, 'title');
    const summaryRaw = extractXmlTag(entry, 'summary');
    const publishedRaw = extractXmlTag(entry, 'published');
    const authors = [
      ...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi),
    ]
      .map((authorMatch) => decodeXmlEntities(normalizeText(authorMatch[1] ?? '')))
      .filter(Boolean)
      .slice(0, 3)
      .join(', ');

    const arxivId = idRaw.split('/abs/')[1] || `paper-${index + 1}`;
    return {
      id: arxivId,
      title: titleRaw || 'Sin titulo',
      summary: withEllipsis(summaryRaw || 'Sin resumen disponible', 220),
      authors: authors || 'Anonimo',
      published: publishedRaw.split('T')[0] || '',
      link: idRaw || `https://arxiv.org/abs/${arxivId}`,
      type: 'Paper',
    };
  });
};

const fetchWikipedia = async (query: string, limit: number): Promise<WikipediaArticle[]> => {
  const mapFromRestSearch = (pages: WikipediaSearchPage[]): WikipediaArticle[] =>
    pages.slice(0, limit).map((page, index) => {
      const pageId = Number(page.id);
      const title = page.title?.trim() || 'Sin titulo';
      const summaryRaw = page.excerpt || page.description || 'Sin resumen disponible';
      const summary = withEllipsis(stripHtmlTags(summaryRaw), 220);
      const key = page.key?.trim() || title.replace(/\s+/g, '_');

      return {
        id: Number.isFinite(pageId) ? pageId : index,
        title,
        summary,
        thumbnail: normalizeWikipediaThumbnail(page.thumbnail?.url),
        link: `https://en.wikipedia.org/wiki/${encodeURIComponent(key)}`,
        type: 'Articulo',
      };
    });

  const mapFromActionApi = (pagesMap: Record<string, WikipediaGeneratorPage>): WikipediaArticle[] =>
    Object.values(pagesMap)
      .slice(0, limit)
      .map((page, index) => {
        const pageId = Number(page.pageid);
        const title = page.title?.trim() || 'Sin titulo';
        const summary = withEllipsis(stripHtmlTags(page.extract || 'Sin resumen disponible'), 220);
        const key = title.replace(/\s+/g, '_');
        return {
          id: Number.isFinite(pageId) ? pageId : index,
          title,
          summary,
          thumbnail: normalizeWikipediaThumbnail(page.thumbnail?.source),
          link: `https://en.wikipedia.org/wiki/${encodeURIComponent(key)}`,
          type: 'Articulo',
        };
      });

  try {
    const url = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=${limit}`;
    const payload = await fetchJsonWithTimeout<{ pages?: WikipediaSearchPage[] }>(url, 'Wikipedia');
    const pages = Array.isArray(payload.pages) ? payload.pages : [];
    if (pages.length > 0) {
      return mapFromRestSearch(pages);
    }
  } catch (error) {
    console.warn('[discover-api] Wikipedia REST search failed, trying Action API', error);
  }

  const fallbackUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${limit}&prop=extracts|pageimages&exintro=1&explaintext=1&exchars=260&piprop=thumbnail&pithumbsize=320`;
  const fallbackPayload = await fetchJsonWithTimeout<{
    query?: { pages?: Record<string, WikipediaGeneratorPage> };
  }>(fallbackUrl, 'Wikipedia Action API');
  const pagesMap = fallbackPayload.query?.pages ?? {};
  return mapFromActionApi(pagesMap);
};

const fetchHackerNews = async (query: string, limit: number): Promise<HackerNewsStory[]> => {
  const storyType = HN_TYPE_MAP[query] || 'topstories';
  const ids = await fetchJsonWithTimeout<number[]>(
    `https://hacker-news.firebaseio.com/v0/${storyType}.json`,
    'Hacker News list',
  );
  const topIds = Array.isArray(ids) ? ids.slice(0, limit) : [];
  const items = await Promise.all(
    topIds.map((id) =>
      fetchJsonWithTimeout<Record<string, unknown>>(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        `Hacker News item ${id}`,
      ),
    ),
  );

  return items
    .filter((item) => typeof item.title === 'string' && item.title.trim().length > 0)
    .map((item) => ({
      id: Number(item.id ?? 0),
      title: String(item.title ?? 'Sin titulo'),
      url:
        typeof item.url === 'string' && item.url.length > 0
          ? item.url
          : `https://news.ycombinator.com/item?id=${String(item.id ?? '')}`,
      author: String(item.by ?? 'Anonimo'),
      score: Number(item.score ?? 0),
      comments: Number(item.descendants ?? 0),
      time: new Date(Number(item.time ?? 0) * 1000).toLocaleDateString('es-ES'),
      type: item.type === 'job' ? 'Empleo' : 'Noticia',
    }));
};

const fetchOpenLibrary = async (query: string, limit: number): Promise<Book[]> => {
  const url = `https://openlibrary.org/subjects/${encodeURIComponent(query)}.json?limit=${limit}`;
  const payload = await fetchJsonWithTimeout<{ works?: Array<Record<string, unknown>> }>(
    url,
    'Open Library',
  );
  const works = Array.isArray(payload.works) ? payload.works : [];

  return works.map((work) => {
    const authorsRaw = Array.isArray(work.authors) ? work.authors : [];
    const authors = authorsRaw
      .map((author) =>
        typeof author === 'object' && author
          ? String((author as { name?: unknown }).name ?? '')
          : '',
      )
      .filter((author) => author.trim().length > 0)
      .join(', ');
    const coverId = Number(work.cover_id);

    return {
      id: String(work.key ?? ''),
      title: String(work.title ?? 'Sin titulo'),
      authors: authors || 'Anonimo',
      cover: Number.isFinite(coverId)
        ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
        : null,
      firstPublished: (work.first_publish_year as number | string | undefined) ?? 'Desconocido',
      link: `https://openlibrary.org${String(work.key ?? '')}`,
      type: 'Libro',
    };
  });
};

const fetchINaturalist = async (query: string, limit: number): Promise<NatureObservation[]> => {
  const taxonId = INATURALIST_TAXON_MAP[query] || query;
  const url = `https://api.inaturalist.org/v1/observations?taxon_id=${encodeURIComponent(taxonId)}&quality_grade=research&per_page=${limit}&order=desc&order_by=created_at`;
  const payload = await fetchJsonWithTimeout<{ results?: Array<Record<string, unknown>> }>(
    url,
    'iNaturalist',
  );
  const observations = Array.isArray(payload.results) ? payload.results : [];

  return observations.map((observation) => {
    const taxon =
      typeof observation.taxon === 'object' && observation.taxon
        ? (observation.taxon as { preferred_common_name?: string; name?: string })
        : {};
    const photos = Array.isArray(observation.photos) ? observation.photos : [];
    const firstPhoto =
      photos.length > 0 && typeof photos[0] === 'object' && photos[0]
        ? (photos[0] as { url?: string })
        : undefined;
    const observer =
      typeof observation.user === 'object' && observation.user
        ? (observation.user as { login?: string }).login
        : undefined;

    return {
      id: Number(observation.id ?? 0),
      species: taxon.preferred_common_name || taxon.name || 'Especie desconocida',
      scientificName: taxon.name || '',
      location: String(observation.place_guess ?? 'Ubicacion desconocida'),
      photo: firstPhoto?.url ? firstPhoto.url.replace('square', 'medium') : null,
      observer: observer || 'Anonimo',
      date: String(observation.observed_on ?? ''),
      link: `https://www.inaturalist.org/observations/${String(observation.id ?? '')}`,
      type: 'Observacion',
    };
  });
};

const fetchMusic = async (query: string, limit: number): Promise<MusicTrack[]> => {
  const normalized = query.trim().toLowerCase();
  const term = MUSIC_QUERY_MAP[normalized] || query;
  const country =
    (process.env.DISCOVER_MUSIC_COUNTRY || DEFAULT_MUSIC_COUNTRY).trim() || DEFAULT_MUSIC_COUNTRY;
  const url = `https://itunes.apple.com/search?media=music&entity=song&term=${encodeURIComponent(term)}&limit=${limit}&country=${encodeURIComponent(country)}`;
  const payload = await fetchJsonWithTimeout<{ results?: Array<Record<string, unknown>> }>(
    url,
    'iTunes Search',
  );
  const results = Array.isArray(payload.results) ? payload.results : [];

  return results.map((track, index) => {
    const trackId = track.trackId ?? track.collectionId ?? `track-${index + 1}`;
    const title = String(track.trackName ?? track.collectionName ?? 'Sin titulo');
    const artist = String(track.artistName ?? 'Desconocido');
    const link =
      typeof track.trackViewUrl === 'string'
        ? track.trackViewUrl
        : typeof track.collectionViewUrl === 'string'
          ? track.collectionViewUrl
          : undefined;

    return {
      id:
        typeof trackId === 'number' || typeof trackId === 'string' ? trackId : `track-${index + 1}`,
      title,
      artist,
      link,
      type: 'Cancion',
    };
  });
};

const fetchBySource = async (
  source: SupportedSource,
  query: string,
  limit: number,
): Promise<DiscoverItem[]> => {
  switch (source) {
    case 'arxiv':
      return fetchArxiv(query, limit);
    case 'wikipedia':
      return fetchWikipedia(query, limit);
    case 'hackernews':
      return fetchHackerNews(query, limit);
    case 'openlibrary':
      return fetchOpenLibrary(query, limit);
    case 'inaturalist':
      return fetchINaturalist(query, limit);
    case 'lastfm':
      return fetchMusic(query, limit);
    default:
      return [];
  }
};

const sendSuccess = (
  res: VercelResponse,
  payload: DiscoverPayload,
  source: SupportedSource,
  cacheStatus: 'HIT' | 'MISS',
): VercelResponse => {
  const ttlSeconds = SOURCE_TTL_SECONDS[source];
  const cacheControl = buildCacheControl(ttlSeconds);
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('CDN-Cache-Control', cacheControl);
  res.setHeader('Vercel-CDN-Cache-Control', cacheControl);
  res.setHeader('X-Discover-Cache', cacheStatus);
  return res.status(200).json(payload);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const source = parseSource(getQueryParam(req, 'source'));
    const query = parseQuery(getQueryParam(req, 'query'), source);
    const limit = parseLimit(getQueryParam(req, 'limit'));
    const ttlSeconds = SOURCE_TTL_SECONDS[source];
    const provider = SOURCE_PROVIDER[source];
    const cacheKey = `${source}:${query.toLowerCase()}:${limit}`;
    const now = Date.now();

    pruneCache();

    const cachedEntry = DISCOVER_CACHE.get(cacheKey);
    if (cachedEntry && cachedEntry.expiresAt > now) {
      return sendSuccess(
        res,
        {
          ...cachedEntry.payload,
          cached: true,
        },
        source,
        'HIT',
      );
    }

    const data = await fetchBySource(source, query, limit);
    const payloadNoCache: Omit<DiscoverPayload, 'cached'> = {
      source,
      query,
      limit,
      provider,
      ttlSeconds,
      fetchedAt: new Date().toISOString(),
      data,
    };

    DISCOVER_CACHE.set(cacheKey, {
      expiresAt: now + ttlSeconds * 1000,
      payload: payloadNoCache,
    });

    return sendSuccess(
      res,
      {
        ...payloadNoCache,
        cached: false,
      },
      source,
      'MISS',
    );
  } catch (error) {
    if (error instanceof RequestError) {
      return res.status(error.status).json({ error: error.message });
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error('[discover-api] upstream error:', message);
    return res.status(502).json({
      error: 'No se pudo cargar contenido en vivo en este momento',
    });
  }
}

export function __resetDiscoverCache() {
  DISCOVER_CACHE.clear();
}

export const config = {
  runtime: 'nodejs',
};
