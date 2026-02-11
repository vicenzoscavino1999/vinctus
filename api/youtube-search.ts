import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit } from './lib/rateLimit.js';

interface YouTubeSearchApiItem {
  id?: {
    videoId?: string;
  };
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    description?: string;
    liveBroadcastContent?: string;
    publishedAt?: string;
    thumbnails?: {
      default?: { url?: string };
      high?: { url?: string };
      medium?: { url?: string };
    };
    title?: string;
  };
}

interface YouTubeSearchApiResponse {
  items?: YouTubeSearchApiItem[];
  nextPageToken?: string;
}

type YouTubeSearchItem = {
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

type YouTubeSearchPayload = {
  cached: boolean;
  fetchedAt: string;
  items: YouTubeSearchItem[];
  limit: number;
  nextPageToken: string | null;
  query: string;
  ttlSeconds: number;
};

type CacheEntry = {
  expiresAt: number;
  payload: Omit<YouTubeSearchPayload, 'cached'>;
};

const SEARCH_CACHE = new Map<string, CacheEntry>();
const SEARCH_CACHE_MAX_ENTRIES = 240;
const DEFAULT_CACHE_TTL_SECONDS = 20 * 60;
const DEFAULT_QUERY = 'tendencias musica ciencia tecnologia';
const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_RATE_LIMITS = {
  day: 800,
  minute: 24,
};
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const PAGE_TOKEN_REGEX = /^[a-zA-Z0-9._-]{1,240}$/;
const ORDER_VALUES = new Set(['relevance', 'date', 'viewCount']);

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

function normalizeString(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeQuery(rawQuery: string | null): string {
  if (!rawQuery) return DEFAULT_QUERY;
  const normalized = rawQuery.trim().replace(/\s+/g, ' ');
  if (!normalized) return DEFAULT_QUERY;
  if (normalized.length > 120) {
    throw new RequestError('"q" is too long (max 120 chars)', 400);
  }
  return normalized;
}

function parseLimit(rawLimit: string | null): number {
  if (!rawLimit) return 6;
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed)) {
    throw new RequestError('Invalid "limit"', 400);
  }
  if (parsed < 1 || parsed > 12) {
    throw new RequestError('"limit" must be between 1 and 12', 400);
  }
  return parsed;
}

function parsePageToken(rawToken: string | null): string | null {
  if (!rawToken) return null;
  const normalized = rawToken.trim();
  if (!normalized) return null;
  if (!PAGE_TOKEN_REGEX.test(normalized)) {
    throw new RequestError('Invalid "pageToken"', 400);
  }
  return normalized;
}

function parseOrder(rawOrder: string | null): 'relevance' | 'date' | 'viewCount' {
  const normalized = (rawOrder ?? 'relevance').trim();
  if (!ORDER_VALUES.has(normalized)) {
    throw new RequestError('Invalid "order"', 400);
  }
  return normalized as 'relevance' | 'date' | 'viewCount';
}

function getRateLimitConfig() {
  return {
    day: parseNumberEnv(
      process.env.YOUTUBE_SEARCH_IP_DAY_LIMIT,
      DEFAULT_RATE_LIMITS.day,
      120,
      40_000,
    ),
    minute: parseNumberEnv(
      process.env.YOUTUBE_SEARCH_IP_MINUTE_LIMIT,
      DEFAULT_RATE_LIMITS.minute,
      6,
      8_000,
    ),
  };
}

function getCacheTtlSeconds(): number {
  return parseNumberEnv(
    process.env.YOUTUBE_SEARCH_CACHE_TTL_SECONDS,
    DEFAULT_CACHE_TTL_SECONDS,
    120,
    43_200,
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
  const sMaxAge = Math.max(60, Math.min(ttlSeconds, 900));
  const staleSeconds = Math.max(sMaxAge, Math.min(ttlSeconds * 2, 1800));
  return `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${staleSeconds}`;
}

function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of SEARCH_CACHE.entries()) {
    if (entry.expiresAt <= now) {
      SEARCH_CACHE.delete(key);
    }
  }
  if (SEARCH_CACHE.size <= SEARCH_CACHE_MAX_ENTRIES) return;

  const keys = [...SEARCH_CACHE.keys()];
  const extra = SEARCH_CACHE.size - SEARCH_CACHE_MAX_ENTRIES;
  for (let index = 0; index < extra; index += 1) {
    const key = keys[index];
    if (key) SEARCH_CACHE.delete(key);
  }
}

function getThumbnailUrl(item: YouTubeSearchApiItem): string | null {
  return (
    item.snippet?.thumbnails?.high?.url ||
    item.snippet?.thumbnails?.medium?.url ||
    item.snippet?.thumbnails?.default?.url ||
    null
  );
}

function mapSearchItems(items: YouTubeSearchApiItem[]): YouTubeSearchItem[] {
  return items
    .map((item) => {
      const videoId = normalizeString(item.id?.videoId);
      if (!videoId || !VIDEO_ID_REGEX.test(videoId)) return null;
      const title = normalizeString(item.snippet?.title) ?? 'Video en YouTube';
      return {
        channelId: normalizeString(item.snippet?.channelId),
        channelTitle: normalizeString(item.snippet?.channelTitle),
        description: normalizeString(item.snippet?.description),
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
        liveBroadcastContent: normalizeString(item.snippet?.liveBroadcastContent),
        publishedAt: normalizeString(item.snippet?.publishedAt),
        thumbnailUrl: getThumbnailUrl(item),
        title,
        videoId,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      } satisfies YouTubeSearchItem;
    })
    .filter((item): item is YouTubeSearchItem => item !== null);
}

async function fetchSearchData(params: {
  apiKey: string;
  limit: number;
  order: 'relevance' | 'date' | 'viewCount';
  pageToken: string | null;
  query: string;
  regionCode: string;
}): Promise<Omit<YouTubeSearchPayload, 'cached' | 'ttlSeconds'>> {
  const searchParams = new URLSearchParams({
    key: params.apiKey,
    maxResults: String(params.limit),
    order: params.order,
    part: 'snippet',
    q: params.query,
    regionCode: params.regionCode,
    safeSearch: 'moderate',
    type: 'video',
    videoEmbeddable: 'true',
  });
  if (params.pageToken) {
    searchParams.set('pageToken', params.pageToken);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      if (response.status === 403) {
        throw new RequestError(
          `YouTube Search API rejected request (403). Verify key/quota. ${responseText.slice(0, 180)}`,
          502,
        );
      }
      throw new RequestError(`YouTube Search API error (${response.status})`, 502);
    }

    const payload = (await response.json().catch(() => null)) as YouTubeSearchApiResponse | null;
    const itemsRaw = Array.isArray(payload?.items) ? payload?.items : [];
    const items = mapSearchItems(itemsRaw);

    return {
      fetchedAt: new Date().toISOString(),
      items,
      limit: params.limit,
      nextPageToken: normalizeString(payload?.nextPageToken) ?? null,
      query: params.query,
    };
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new RequestError('YouTube Search API timeout', 504);
    }
    if (error instanceof RequestError) throw error;
    throw new RequestError('Failed to fetch YouTube search results', 502);
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
    keyPrefix: 'youtube-search-ip',
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
    const query = normalizeQuery(getHeaderValue(req.query.q as string | string[] | undefined));
    const limit = parseLimit(getHeaderValue(req.query.limit as string | string[] | undefined));
    const pageToken = parsePageToken(
      getHeaderValue(req.query.pageToken as string | string[] | undefined),
    );
    const order = parseOrder(getHeaderValue(req.query.order as string | string[] | undefined));
    const regionCode =
      normalizeString(process.env.YOUTUBE_SEARCH_REGION_CODE)?.toUpperCase() || 'US';
    const ttlSeconds = getCacheTtlSeconds();
    const cacheKey = [
      'youtube-search',
      query.toLowerCase(),
      String(limit),
      pageToken ?? '',
      order,
      regionCode,
    ].join(':');
    const now = Date.now();
    const cachedEntry = SEARCH_CACHE.get(cacheKey);

    if (cachedEntry && cachedEntry.expiresAt > now) {
      res.setHeader('Cache-Control', buildCacheControl(ttlSeconds));
      res.setHeader('X-YouTube-Search-Cache', 'HIT');
      return res.status(200).json({
        ...cachedEntry.payload,
        cached: true,
        ttlSeconds,
      } satisfies YouTubeSearchPayload);
    }

    const fetched = await fetchSearchData({
      apiKey,
      limit,
      order,
      pageToken,
      query,
      regionCode,
    });
    const payload: Omit<YouTubeSearchPayload, 'cached'> = {
      ...fetched,
      ttlSeconds,
    };

    SEARCH_CACHE.set(cacheKey, {
      expiresAt: now + ttlSeconds * 1000,
      payload,
    });
    pruneCache();

    res.setHeader('Cache-Control', buildCacheControl(ttlSeconds));
    res.setHeader('X-YouTube-Search-Cache', 'MISS');
    return res.status(200).json({
      ...payload,
      cached: false,
    } satisfies YouTubeSearchPayload);
  } catch (error) {
    const requestError =
      error instanceof RequestError ? error : new RequestError('Internal error', 500);
    return res.status(requestError.status).json({ error: requestError.message });
  }
}

export function __resetYouTubeSearchCache() {
  SEARCH_CACHE.clear();
}
