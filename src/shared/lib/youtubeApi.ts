export type YouTubeVideoDetails = {
  cached: boolean;
  channelId: string | null;
  channelTitle: string | null;
  commentCount: number | null;
  durationIso: string | null;
  embeddable: boolean;
  fetchedAt: string;
  likeCount: number | null;
  liveBroadcastContent: string | null;
  licensedContent: boolean | null;
  privacyStatus: string | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  title: string | null;
  ttlSeconds: number;
  videoId: string;
  viewCount: number | null;
};

const YOUTUBE_PROXY_ENDPOINT = '/api/youtube';
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const LOCAL_CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  payload: YouTubeVideoDetails;
};

const LOCAL_CACHE = new Map<string, CacheEntry>();

const parseYouTubeDuration = (isoDuration: string | null): number | null => {
  if (!isoDuration) return null;
  const match = isoDuration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return null;
  const hours = Number.parseInt(match[1] ?? '0', 10) || 0;
  const minutes = Number.parseInt(match[2] ?? '0', 10) || 0;
  const seconds = Number.parseInt(match[3] ?? '0', 10) || 0;
  return hours * 3600 + minutes * 60 + seconds;
};

export const formatYouTubeDuration = (isoDuration: string | null): string | null => {
  const totalSeconds = parseYouTubeDuration(isoDuration);
  if (totalSeconds === null) return null;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export const formatYouTubeViews = (value: number | null): string | null => {
  if (value === null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 1,
    notation: 'compact',
  }).format(value);
};

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

const pruneLocalCache = () => {
  const now = Date.now();
  for (const [key, entry] of LOCAL_CACHE.entries()) {
    if (entry.expiresAt <= now) {
      LOCAL_CACHE.delete(key);
    }
  }
};

export const fetchYouTubeVideoDetails = async (
  videoId: string,
  signal?: AbortSignal,
): Promise<YouTubeVideoDetails> => {
  const normalizedId = videoId.trim();
  if (!VIDEO_ID_REGEX.test(normalizedId)) {
    throw new Error('Video de YouTube invalido');
  }

  pruneLocalCache();
  const now = Date.now();
  const cached = LOCAL_CACHE.get(normalizedId);
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }

  const params = new URLSearchParams({ videoId: normalizedId });
  const response = await fetch(`${YOUTUBE_PROXY_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | YouTubeVideoDetails
    | { error?: string }
    | null;
  if (!response.ok || !payload) {
    throw new Error(getErrorMessage(payload, 'No se pudo consultar YouTube'));
  }

  if (
    typeof (payload as YouTubeVideoDetails).videoId !== 'string' ||
    typeof (payload as YouTubeVideoDetails).embeddable !== 'boolean'
  ) {
    throw new Error('Respuesta invalida del servicio de YouTube');
  }

  const details = payload as YouTubeVideoDetails;
  LOCAL_CACHE.set(normalizedId, {
    expiresAt: now + LOCAL_CACHE_TTL_MS,
    payload: details,
  });
  return details;
};
