export type YouTubeShortVideo = {
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

export type YouTubeShortsResponse = {
  cached: boolean;
  fetchedAt: string;
  items: YouTubeShortVideo[];
  limit: number;
  query: string;
  ttlSeconds: number;
};

type FetchYouTubeShortsParams = {
  limit?: number;
  query?: string;
  signal?: AbortSignal;
};

type LocalCacheEntry = {
  expiresAt: number;
  payload: YouTubeShortsResponse;
};

const SHORTS_ENDPOINT = '/api/youtube-shorts';
const LOCAL_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SHORTS_QUERY = 'shorts ciencia tecnologia musica historia naturaleza filosofia';
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

const normalizeQuery = (value: string | undefined): string => {
  const normalized = value?.trim().replace(/\s+/g, ' ') || DEFAULT_SHORTS_QUERY;
  return normalized.length > 0 ? normalized : DEFAULT_SHORTS_QUERY;
};

const normalizeLimit = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return 40;
  const safeValue = Math.floor(value ?? 40);
  return Math.max(1, Math.min(50, safeValue));
};

const pruneLocalCache = () => {
  const now = Date.now();
  for (const [key, entry] of LOCAL_CACHE.entries()) {
    if (entry.expiresAt <= now) {
      LOCAL_CACHE.delete(key);
    }
  }
};

export const fetchYouTubeShorts = async ({
  limit,
  query,
  signal,
}: FetchYouTubeShortsParams = {}): Promise<YouTubeShortsResponse> => {
  const normalizedQuery = normalizeQuery(query);
  const normalizedLimit = normalizeLimit(limit);
  const cacheKey = `${normalizedQuery.toLowerCase()}|${normalizedLimit}`;

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

  const response = await fetch(`${SHORTS_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | YouTubeShortsResponse
    | { error?: string }
    | null;

  if (!response.ok || !payload) {
    throw new Error(getErrorMessage(payload, 'No se pudo cargar YouTube Shorts'));
  }

  if (!Array.isArray((payload as YouTubeShortsResponse).items)) {
    throw new Error('Respuesta invalida del servicio de YouTube Shorts');
  }

  const parsed = payload as YouTubeShortsResponse;
  LOCAL_CACHE.set(cacheKey, {
    expiresAt: now + LOCAL_CACHE_TTL_MS,
    payload: parsed,
  });
  return parsed;
};
