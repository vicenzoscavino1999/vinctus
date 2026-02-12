import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit } from './lib/rateLimit.js';

interface YouTubeApiItem {
  contentDetails?: {
    duration?: string;
  };
  id?: string;
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    liveBroadcastContent?: string;
    publishedAt?: string;
    thumbnails?: {
      high?: { url?: string };
      maxres?: { url?: string };
      medium?: { url?: string };
      standard?: { url?: string };
      default?: { url?: string };
    };
    title?: string;
  };
  statistics?: {
    commentCount?: string;
    likeCount?: string;
    viewCount?: string;
  };
  status?: {
    embeddable?: boolean;
    licensedContent?: boolean;
    privacyStatus?: string;
  };
}

interface YouTubeApiResponse {
  items?: YouTubeApiItem[];
}

type YouTubeLookupPayload = {
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

type CacheEntry = {
  expiresAt: number;
  payload: Omit<YouTubeLookupPayload, 'cached'>;
};

const YOUTUBE_CACHE = new Map<string, CacheEntry>();
const YOUTUBE_CACHE_MAX_ENTRIES = 300;
const DEFAULT_CACHE_TTL_SECONDS = 4 * 60 * 60;
const REQUEST_TIMEOUT_MS = 8000;
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const DEFAULT_RATE_LIMITS = {
  day: 4000,
  minute: 120,
};

class RequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
  }
}

function getHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value[0] ?? null;
  return null;
}

function parseNumberEnv(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getRateLimitConfig() {
  return {
    day: parseNumberEnv(process.env.YOUTUBE_IP_DAY_LIMIT, DEFAULT_RATE_LIMITS.day, 100, 100_000),
    minute: parseNumberEnv(
      process.env.YOUTUBE_IP_MINUTE_LIMIT,
      DEFAULT_RATE_LIMITS.minute,
      10,
      10_000,
    ),
  };
}

function getCacheTtlSeconds(): number {
  return parseNumberEnv(
    process.env.YOUTUBE_CACHE_TTL_SECONDS,
    DEFAULT_CACHE_TTL_SECONDS,
    300,
    86400,
  );
}

function getClientIp(req: VercelRequest): string {
  const forwarded = getHeaderValue(req.headers['x-forwarded-for']);
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const remote = req.socket?.remoteAddress?.trim();
  return remote || 'unknown';
}

function buildCacheControl(ttlSeconds: number): string {
  const sMaxAge = Math.max(60, Math.min(ttlSeconds, 3600));
  const staleSeconds = Math.max(sMaxAge, Math.min(ttlSeconds * 2, 7200));
  return `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${staleSeconds}`;
}

function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of YOUTUBE_CACHE.entries()) {
    if (entry.expiresAt <= now) {
      YOUTUBE_CACHE.delete(key);
    }
  }

  if (YOUTUBE_CACHE.size <= YOUTUBE_CACHE_MAX_ENTRIES) return;
  const keys = [...YOUTUBE_CACHE.keys()];
  const extra = YOUTUBE_CACHE.size - YOUTUBE_CACHE_MAX_ENTRIES;
  for (let index = 0; index < extra; index += 1) {
    const key = keys[index];
    if (key) YOUTUBE_CACHE.delete(key);
  }
}

function parseVideoIdFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.replace(/\/+$/, '');

    if (host === 'youtu.be' || host === 'www.youtu.be') {
      const shortId = pathname.split('/').filter(Boolean)[0] ?? null;
      return shortId && VIDEO_ID_REGEX.test(shortId) ? shortId : null;
    }

    if (
      host !== 'youtube.com' &&
      host !== 'www.youtube.com' &&
      host !== 'm.youtube.com' &&
      host !== 'music.youtube.com' &&
      host !== 'youtube-nocookie.com' &&
      host !== 'www.youtube-nocookie.com'
    ) {
      return null;
    }

    const v = url.searchParams.get('v');
    if (v && VIDEO_ID_REGEX.test(v)) {
      return v;
    }

    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '')) {
      const id = parts[1] ?? null;
      return id && VIDEO_ID_REGEX.test(id) ? id : null;
    }

    const fallback = parts[0] ?? null;
    return fallback && VIDEO_ID_REGEX.test(fallback) ? fallback : null;
  } catch {
    return null;
  }
}

function parseVideoId(req: VercelRequest): string {
  const rawVideoId = getHeaderValue(req.query.videoId as string | string[] | undefined);
  const rawUrl = getHeaderValue(req.query.url as string | string[] | undefined);

  if (rawVideoId) {
    const normalizedId = rawVideoId.trim();
    if (VIDEO_ID_REGEX.test(normalizedId)) return normalizedId;
    throw new RequestError('Invalid "videoId"', 400);
  }

  if (rawUrl) {
    const parsedId = parseVideoIdFromUrl(rawUrl.trim());
    if (parsedId) return parsedId;
    throw new RequestError('Invalid "url"', 400);
  }

  throw new RequestError('Missing "videoId" or "url"', 400);
}

function toNullableInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function normalizeString(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getThumbnailUrl(item: YouTubeApiItem): string | null {
  return (
    item.snippet?.thumbnails?.maxres?.url ||
    item.snippet?.thumbnails?.standard?.url ||
    item.snippet?.thumbnails?.high?.url ||
    item.snippet?.thumbnails?.medium?.url ||
    item.snippet?.thumbnails?.default?.url ||
    null
  );
}

async function fetchVideoData(
  videoId: string,
  apiKey: string,
): Promise<Omit<YouTubeLookupPayload, 'cached' | 'ttlSeconds'>> {
  const params = new URLSearchParams({
    id: videoId,
    key: apiKey,
    part: 'snippet,contentDetails,statistics,status',
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      if (response.status === 403) {
        throw new RequestError(
          `YouTube API rejected request (403). Verify key/quota. ${responseText.slice(0, 180)}`,
          502,
        );
      }
      throw new RequestError(`YouTube API error (${response.status})`, 502);
    }

    const payload = (await response.json().catch(() => null)) as YouTubeApiResponse | null;
    const item = payload?.items?.[0];
    if (!item) {
      throw new RequestError('Video not found on YouTube', 404);
    }

    return {
      channelId: normalizeString(item.snippet?.channelId),
      channelTitle: normalizeString(item.snippet?.channelTitle),
      commentCount: toNullableInt(item.statistics?.commentCount),
      durationIso: normalizeString(item.contentDetails?.duration),
      embeddable: item.status?.embeddable !== false,
      fetchedAt: new Date().toISOString(),
      likeCount: toNullableInt(item.statistics?.likeCount),
      liveBroadcastContent: normalizeString(item.snippet?.liveBroadcastContent),
      licensedContent:
        typeof item.status?.licensedContent === 'boolean' ? item.status.licensedContent : null,
      privacyStatus: normalizeString(item.status?.privacyStatus),
      publishedAt: normalizeString(item.snippet?.publishedAt),
      thumbnailUrl: getThumbnailUrl(item),
      title: normalizeString(item.snippet?.title),
      videoId,
      viewCount: toNullableInt(item.statistics?.viewCount),
    };
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new RequestError('YouTube API timeout', 504);
    }
    if (error instanceof RequestError) throw error;
    throw new RequestError('Failed to fetch YouTube metadata', 502);
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateLimits = getRateLimitConfig();
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(ip, {
    dayLimit: rateLimits.day,
    keyPrefix: 'youtube-ip',
    minuteLimit: rateLimits.minute,
  });
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  const apiKey = (process.env.YOUTUBE_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(503).json({ error: 'YouTube API key not configured' });
  }

  try {
    const videoId = parseVideoId(req);
    const ttlSeconds = getCacheTtlSeconds();
    const cacheKey = `youtube:${videoId}`;
    const now = Date.now();
    const cachedEntry = YOUTUBE_CACHE.get(cacheKey);

    if (cachedEntry && cachedEntry.expiresAt > now) {
      res.setHeader('Cache-Control', buildCacheControl(ttlSeconds));
      res.setHeader('X-YouTube-Cache', 'HIT');
      return res.status(200).json({
        ...cachedEntry.payload,
        cached: true,
        ttlSeconds,
      } satisfies YouTubeLookupPayload);
    }

    const fetched = await fetchVideoData(videoId, apiKey);
    const payload: Omit<YouTubeLookupPayload, 'cached'> = {
      ...fetched,
      ttlSeconds,
    };
    YOUTUBE_CACHE.set(cacheKey, {
      expiresAt: now + ttlSeconds * 1000,
      payload,
    });
    pruneCache();

    res.setHeader('Cache-Control', buildCacheControl(ttlSeconds));
    res.setHeader('X-YouTube-Cache', 'MISS');
    return res.status(200).json({
      ...payload,
      cached: false,
    } satisfies YouTubeLookupPayload);
  } catch (error) {
    const requestError =
      error instanceof RequestError ? error : new RequestError('Internal error', 500);
    return res.status(requestError.status).json({ error: requestError.message });
  }
}

export function __resetYouTubeCache() {
  YOUTUBE_CACHE.clear();
}
