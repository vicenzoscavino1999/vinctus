export type YouTubeSearchVideo = {
  channelId: string | null;
  channelTitle: string | null;
  description: string | null;
  embedUrl: string;
  liveBroadcastContent: string | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  title: string;
  videoId: string;
  watchUrl: string;
};

export type YouTubeSearchResponse = {
  cached: boolean;
  fetchedAt: string;
  items: YouTubeSearchVideo[];
  limit: number;
  nextPageToken: string | null;
  query: string;
  ttlSeconds: number;
};

type FetchYouTubeSearchParams = {
  limit?: number;
  pageToken?: string | null;
  query: string;
  signal?: AbortSignal;
};

type LocalCacheEntry = {
  expiresAt: number;
  payload: YouTubeSearchResponse;
};

const SEARCH_ENDPOINT = '/api/youtube-search';
const LOCAL_CACHE_TTL_MS = 5 * 60 * 1000;
const LOCAL_CACHE = new Map<string, LocalCacheEntry>();

const getErrorMessage = (payload: unknown, fallback: string): string => {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof (payload as { error?: unknown }).error === 'string'
  ) {
    return (payload as { error: string }).error;
  }
  return fallback;
};

const normalizeQuery = (value: string): string => value.trim().replace(/\s+/g, ' ');

const normalizeLimit = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return 6;
  const safeValue = Math.floor(value ?? 6);
  return Math.max(1, Math.min(12, safeValue));
};

const pruneLocalCache = () => {
  const now = Date.now();
  for (const [key, entry] of LOCAL_CACHE.entries()) {
    if (entry.expiresAt <= now) {
      LOCAL_CACHE.delete(key);
    }
  }
};

export const fetchYouTubeSearchVideos = async ({
  limit,
  pageToken,
  query,
  signal,
}: FetchYouTubeSearchParams): Promise<YouTubeSearchResponse> => {
  const normalizedQuery = normalizeQuery(query);
  if (normalizedQuery.length < 2) {
    throw new Error('La busqueda de YouTube requiere al menos 2 caracteres');
  }
  const normalizedLimit = normalizeLimit(limit);
  const normalizedPageToken = pageToken?.trim() || '';
  const cacheKey = `${normalizedQuery.toLowerCase()}|${normalizedLimit}|${normalizedPageToken}`;

  pruneLocalCache();
  const now = Date.now();
  const cached = LOCAL_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }

  const params = new URLSearchParams({
    limit: String(normalizedLimit),
    q: normalizedQuery,
  });
  if (normalizedPageToken) {
    params.set('pageToken', normalizedPageToken);
  }

  const response = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | YouTubeSearchResponse
    | { error?: string }
    | null;

  if (!response.ok || !payload) {
    throw new Error(getErrorMessage(payload, 'No se pudo consultar YouTube Search'));
  }

  if (!Array.isArray((payload as YouTubeSearchResponse).items)) {
    throw new Error('Respuesta invalida del servicio de YouTube Search');
  }

  const parsed = payload as YouTubeSearchResponse;
  LOCAL_CACHE.set(cacheKey, {
    expiresAt: now + LOCAL_CACHE_TTL_MS,
    payload: parsed,
  });
  return parsed;
};
