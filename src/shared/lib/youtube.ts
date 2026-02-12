export type YouTubeVideoMeta = {
  videoId: string;
  watchUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
};

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const getVideoIdFromUrl = (url: URL): string | null => {
  const host = url.hostname.toLowerCase();
  const pathname = url.pathname.replace(/\/+$/, '');

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    const id = pathname.split('/').filter(Boolean)[0] ?? null;
    return id && VIDEO_ID_REGEX.test(id) ? id : null;
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

  const searchId = url.searchParams.get('v');
  if (searchId && VIDEO_ID_REGEX.test(searchId)) {
    return searchId;
  }

  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '')) {
    const id = parts[1] ?? null;
    return id && VIDEO_ID_REGEX.test(id) ? id : null;
  }

  const fallback = parts[0] ?? null;
  return fallback && VIDEO_ID_REGEX.test(fallback) ? fallback : null;
};

const buildMetaFromId = (videoId: string): YouTubeVideoMeta => ({
  videoId,
  watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
  embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
  thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
});

export const parseYouTubeUrl = (input: string): YouTubeVideoMeta | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (VIDEO_ID_REGEX.test(trimmed)) {
    return buildMetaFromId(trimmed);
  }

  try {
    const url = new URL(trimmed);
    const videoId = getVideoIdFromUrl(url);
    if (!videoId) return null;
    return buildMetaFromId(videoId);
  } catch {
    return null;
  }
};

export const isYouTubeUrl = (input: string): boolean => parseYouTubeUrl(input) !== null;

export const getYouTubeThumbnailUrl = (input: string): string | null =>
  parseYouTubeUrl(input)?.thumbnailUrl ?? null;
