import { CATEGORIES, PUBLICATIONS } from '@/shared/constants';
import type { PostRead } from '@/features/posts/api';
import { getYouTubeThumbnailUrl } from '@/shared/lib/youtube';
import type { YouTubeSearchVideo } from '@/shared/lib/youtubeSearchApi';

/** The Discover "Publicaciones" feed: community posts, YouTube videos and editorial filler. */

export type PublicationSource = 'community' | 'editorial' | 'youtube';
export type PublicationStreamItem = {
  streamKey: string;
  id: string;
  postId: string | null;
  title: string;
  body: string;
  group: string;
  category: string;
  categoryId: string;
  image: string;
  likes: number;
  comments: number;
  source: PublicationSource;
  youtubeChannelTitle?: string | null;
  youtubePublishedAt?: string | null;
  youtubeUrl?: string | null;
  youtubeVideoId?: string | null;
};

export const PUBLICATION_BATCH_SIZE = 6;
export const PUBLICATION_MAX_ITEMS = 72;
const EDITORIAL_VARIANT_LIMIT = PUBLICATION_MAX_ITEMS * 3;
export const YOUTUBE_BATCH_SIZE = 6;
export const YOUTUBE_QUERY_DEBOUNCE_MS = 350;
export const YOUTUBE_FALLBACK_QUERY = 'ciencia tecnologia musica';

const EDITORIAL_TITLE_PATTERNS = [
  'Nuevas pistas en {subgroup}',
  'Debate abierto: {subgroup} y su impacto',
  'Lo que esta cambiando en {subgroup}',
  'Radar semanal de {subgroup}',
  '{subgroup}: señales para seguir',
  'Tensiones y avances en {subgroup}',
];

const EDITORIAL_BODY_PATTERNS = [
  'Curaduria editorial con foco en {subgroup} dentro de {category}.',
  'Resumen rapido para explorar {subgroup} sin salir de Discover.',
  'Lectura base para entender el contexto actual de {subgroup}.',
  'Panorama de ideas recientes en {subgroup} para abrir debate.',
  'Entrada recomendada para conectar tendencias y comunidad en {subgroup}.',
  'Punto de partida para seguir novedades de {subgroup} esta semana.',
];

const getFallbackPublicationByCategory = (categoryId: string | null | undefined) => {
  if (categoryId) {
    const categoryMatch = PUBLICATIONS.find((item) => item.categoryId === categoryId);
    if (categoryMatch) return categoryMatch;
  }
  return PUBLICATIONS[0];
};

const CATEGORY_HINTS: Record<string, string[]> = {
  history: ['historia', 'history', 'cultura', 'ancient', 'rome', 'medieval'],
  literature: ['literatura', 'poesia', 'poetry', 'fiction', 'filosofia', 'book', 'novel'],
  music: ['musica', 'music', 'jazz', 'salsa', 'classical', 'arte', 'artist', 'song'],
  nature: ['naturaleza', 'nature', 'wildlife', 'forest', 'botanica', 'birds', 'insects'],
  science: ['ciencia', 'science', 'quantum', 'fisica', 'physics', 'cosmology', 'astronomy'],
  technology: ['tecnologia', 'technology', 'ai', 'codigo', 'programming', 'software', 'startup'],
};

const normalizeKeyword = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const inferCategoryIdFromText = (value: string): string => {
  const normalized = normalizeKeyword(value);
  for (const category of CATEGORIES) {
    const customHints = CATEGORY_HINTS[category.id] ?? [];
    const labelHints = [category.label, ...category.subgroups.map((subgroup) => subgroup.name)];
    const hints = [...customHints, ...labelHints.map((hint) => normalizeKeyword(hint))];
    if (hints.some((hint) => hint && normalized.includes(hint))) {
      return category.id;
    }
  }
  return 'technology';
};

export const buildEditorialPublication = (index: number): PublicationStreamItem => {
  const base = PUBLICATIONS[index % PUBLICATIONS.length];
  const cycle = Math.floor(index / PUBLICATIONS.length);
  const category = CATEGORIES.find((item) => item.id === base.categoryId);
  const subgroups = category?.subgroups ?? [];
  const subgroupName =
    subgroups.length > 0
      ? (subgroups[(index + cycle) % subgroups.length]?.name ?? base.category)
      : base.category;
  const titleTemplate = EDITORIAL_TITLE_PATTERNS[(index + cycle) % EDITORIAL_TITLE_PATTERNS.length];
  const bodyTemplate =
    EDITORIAL_BODY_PATTERNS[(index * 3 + cycle) % EDITORIAL_BODY_PATTERNS.length];
  const variantTitle = titleTemplate
    .replace('{subgroup}', subgroupName)
    .replace('{category}', base.category);
  const variantBody = bodyTemplate
    .replace('{subgroup}', subgroupName)
    .replace('{category}', base.category);
  const groupVariant =
    cycle === 0 ? base.group : `${base.group} · ${cycle % 2 === 0 ? 'Radar' : 'Curaduria'}`;
  const likesVariant = Math.max(0, base.likes + cycle * 11 + ((index % 7) - 3));
  const commentsVariant = Math.max(0, base.comments + cycle * 2 + ((index % 5) - 2));

  return {
    streamKey: `editorial-${base.id}-${cycle}-${index}`,
    id: `editorial-${base.id}-${cycle}-${index}`,
    postId: null,
    title: cycle === 0 ? base.title : variantTitle,
    body: cycle === 0 ? base.title : variantBody,
    group: groupVariant,
    category: base.category,
    categoryId: base.categoryId,
    image: base.image,
    likes: likesVariant,
    comments: commentsVariant,
    source: 'editorial',
  };
};

export const buildCommunityPublication = (post: PostRead, index: number): PublicationStreamItem => {
  const fallback = getFallbackPublicationByCategory(post.categoryId);
  const categoryId =
    typeof post.categoryId === 'string' &&
    CATEGORIES.some((category) => category.id === post.categoryId)
      ? post.categoryId
      : fallback.categoryId;
  const categoryLabel =
    CATEGORIES.find((category) => category.id === categoryId)?.label ?? fallback.category;
  const previewText = (post.text || post.content || '').trim();
  const authorDisplay = post.authorSnapshot?.displayName || post.authorName || 'Comunidad Vinctus';
  const titleCandidate = post.title?.trim() || previewText.split('\n')[0]?.trim() || fallback.title;
  const videoUrl = post.media.find((media) => media.type === 'video')?.url ?? null;
  const youtubeThumbnail = videoUrl ? getYouTubeThumbnailUrl(videoUrl) : null;
  const imageFromMedia =
    post.media.find((media) => media.type === 'image')?.url ??
    youtubeThumbnail ??
    videoUrl ??
    fallback.image;
  return {
    streamKey: `community-${post.id}-${index}`,
    id: post.id,
    postId: post.id,
    title: titleCandidate,
    body: previewText || titleCandidate,
    group: authorDisplay,
    category: categoryLabel,
    categoryId,
    image: imageFromMedia,
    likes: typeof post.likeCount === 'number' ? Math.max(0, post.likeCount) : 0,
    comments: typeof post.commentCount === 'number' ? Math.max(0, post.commentCount) : 0,
    source: 'community',
  };
};

export const buildYouTubePublication = (
  video: YouTubeSearchVideo,
  index: number,
  query: string,
): PublicationStreamItem => {
  const categoryId = inferCategoryIdFromText(
    `${video.title} ${video.description ?? ''} ${video.channelTitle ?? ''} ${query}`,
  );
  const fallback = getFallbackPublicationByCategory(categoryId);
  const category = CATEGORIES.find((item) => item.id === categoryId);
  const title = video.title.trim() || 'Video en YouTube';
  const body =
    video.description?.trim() ||
    `Video recomendado para ${category?.label ?? fallback.category} en Discover.`;

  return {
    streamKey: `youtube-${video.videoId}-${index}`,
    id: `youtube-${video.videoId}`,
    postId: null,
    title,
    body,
    group: video.channelTitle ?? 'YouTube',
    category: category?.label ?? fallback.category,
    categoryId,
    image: video.thumbnailUrl ?? fallback.image,
    likes: 0,
    comments: 0,
    source: 'youtube',
    youtubeChannelTitle: video.channelTitle,
    youtubePublishedAt: video.publishedAt,
    youtubeUrl: video.watchUrl,
    youtubeVideoId: video.videoId,
  };
};

export const getPublicationDedupeKey = (item: PublicationStreamItem): string =>
  item.source === 'community'
    ? `community:${item.id}`
    : item.source === 'youtube'
      ? `youtube:${item.youtubeVideoId ?? item.id}`
      : `editorial:${item.title.toLowerCase().trim()}`;

export const isYouTubeSearchActive = (youtubeQuery: string): boolean =>
  youtubeQuery.trim().toLowerCase() !== YOUTUBE_FALLBACK_QUERY.toLowerCase();

/**
 * Ideal mix of `targetCount` items. It is recomputed from scratch, so posts or videos that load
 * later land in the middle of it; the rendered feed only appends from it (see appendOnlyStream).
 */
export const buildCandidatePublicationStream = ({
  communityPublications,
  youtubePublications,
  targetCount,
  youtubeQuery,
}: {
  communityPublications: PublicationStreamItem[];
  youtubePublications: PublicationStreamItem[];
  targetCount: number;
  youtubeQuery: string;
}): PublicationStreamItem[] => {
  const searchActive = isYouTubeSearchActive(youtubeQuery);

  let communitySlice: PublicationStreamItem[] = [];
  let youtubeSlice: PublicationStreamItem[] = [];

  if (searchActive) {
    // During explicit YouTube search, prioritize YouTube results first.
    youtubeSlice = youtubePublications.slice(0, targetCount);
    const remainingSlots = Math.max(0, targetCount - youtubeSlice.length);
    communitySlice = communityPublications.slice(0, remainingSlots);
  } else {
    // In mixed feed mode, reserve slots for YouTube so it never disappears behind community posts.
    const reservedYoutubeSlots = Math.min(
      Math.ceil(targetCount * 0.35),
      youtubePublications.length,
    );
    const communitySlots = Math.max(0, targetCount - reservedYoutubeSlots);
    communitySlice = communityPublications.slice(0, communitySlots);
    const remainingSlots = Math.max(0, targetCount - communitySlice.length);
    youtubeSlice = youtubePublications.slice(0, remainingSlots);
  }

  const missingCount = Math.max(0, targetCount - communitySlice.length - youtubeSlice.length);
  const editorialStartIndex = Math.max(0, communitySlice.length + youtubeSlice.length);
  const editorialItems = Array.from({ length: missingCount + PUBLICATION_BATCH_SIZE }, (_, index) =>
    buildEditorialPublication(editorialStartIndex + index),
  );
  const merged = searchActive
    ? [...youtubeSlice, ...communitySlice, ...editorialItems]
    : [...communitySlice, ...youtubeSlice, ...editorialItems];
  const uniqueItems: PublicationStreamItem[] = [];
  const seen = new Set<string>();

  for (const item of merged) {
    const dedupeKey = getPublicationDedupeKey(item);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    uniqueItems.push(item);
    if (uniqueItems.length >= targetCount) {
      return uniqueItems;
    }
  }

  // Safety net: keep filling with deterministic editorial variants if dedupe removed too many items.
  let variantCursor = editorialStartIndex + editorialItems.length;
  while (uniqueItems.length < targetCount && variantCursor < EDITORIAL_VARIANT_LIMIT) {
    const candidate = buildEditorialPublication(variantCursor);
    const candidateKey = `editorial:${candidate.title.toLowerCase().trim()}`;
    variantCursor += 1;
    if (seen.has(candidateKey)) continue;
    seen.add(candidateKey);
    uniqueItems.push(candidate);
  }

  return uniqueItems;
};
