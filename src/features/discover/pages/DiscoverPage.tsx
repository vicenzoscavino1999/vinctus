import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  Search,
  BookOpen,
  ArrowRight,
  Filter,
  Users,
  UserPlus,
  Heart,
  MessageCircle,
  Bookmark,
  X,
} from 'lucide-react';
import SearchFilters from '@/features/discover/components/SearchFilters';
import StoriesWidget from '@/features/posts/components/StoriesWidget';
import { useAppState } from '@/context/app-state';
import { useAuth } from '@/context/auth';
import { CATEGORIES, PUBLICATIONS } from '@/shared/constants';
import type { Category } from '@/shared/types';
import { useToast } from '@/shared/ui/Toast';
import {
  fetchArxivPapers,
  fetchBooks,
  fetchHackerNews,
  fetchMusicInfo,
  fetchNatureObservations,
  fetchWikipediaArticles,
} from '@/shared/lib/api';
import {
  getGroupJoinStatus,
  getGroups,
  joinPublicGroup,
  sendGroupJoinRequest,
  type FirestoreGroup,
  type GroupJoinStatus,
} from '@/features/groups/api';
import { getPublicArenaDebates } from '@/features/arena/api/queries';
import { getPersonaById, type Debate } from '@/features/arena/types';
import { getGlobalFeed, type PostCursor, type PostRead } from '@/features/posts/api';
import { toDate } from '@/shared/lib/formatUtils';
import { getYouTubeThumbnailUrl } from '@/shared/lib/youtube';
import { fetchYouTubeSearchVideos, type YouTubeSearchVideo } from '@/shared/lib/youtubeSearchApi';

type SearchFiltersState = {
  category: string | null;
  sortBy: string;
};

type DiscoverCategoryNavigationSource =
  | 'trend-card'
  | 'trend-preview'
  | 'category-grid'
  | 'publication-feed';
type PublicationSource = 'community' | 'editorial' | 'youtube';
type PublicationStreamItem = {
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
const PUBLICATION_BATCH_SIZE = 6;
const PUBLICATION_MAX_ITEMS = 72;
const EDITORIAL_VARIANT_LIMIT = PUBLICATION_MAX_ITEMS * 3;
const YOUTUBE_BATCH_SIZE = 6;
const YOUTUBE_QUERY_DEBOUNCE_MS = 350;
const YOUTUBE_FALLBACK_QUERY = 'ciencia tecnologia musica';

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

const extractHostname = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
};

const getDebateSourceCount = (debate: Debate): number =>
  typeof debate.sourceCount === 'number' ? debate.sourceCount : (debate.linkCount ?? 0);

const getDebateLikesCount = (debate: Debate): number =>
  typeof debate.likesCount === 'number' ? Math.max(0, debate.likesCount) : 0;

const getDebateCurationScore = (debate: Debate): number =>
  getDebateSourceCount(debate) * 3 + getDebateLikesCount(debate) * 2;

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
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const inferCategoryIdFromText = (value: string): string => {
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

const buildEditorialPublication = (index: number): PublicationStreamItem => {
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

const buildCommunityPublication = (post: PostRead, index: number): PublicationStreamItem => {
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

const buildYouTubePublication = (
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

type TrendPreviewItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  href: string | null;
};

type TrendPreviewState = {
  loading: boolean;
  error: string | null;
  items: TrendPreviewItem[];
  liveCount: number;
};

const getCategoryPrimaryQuery = (category: Category): string => {
  const firstSubgroupQuery = category.subgroups[0]?.apiQuery;
  if (typeof firstSubgroupQuery === 'string' && firstSubgroupQuery.trim().length > 0) {
    return firstSubgroupQuery;
  }
  return category.id;
};

const getLiveSignalLabel = (category: Category, liveCount: number): string => {
  const normalizedCount = Math.max(0, liveCount);
  if (category.apiSource === 'arxiv') {
    return `${normalizedCount} papers hoy`;
  }
  return `${normalizedCount} novedades hoy`;
};

const formatWeeklyDelta = (deltaPercent: number): string => {
  if (deltaPercent > 0) return `+${deltaPercent}% semanal`;
  if (deltaPercent < 0) return `${deltaPercent}% semanal`;
  return '0% semanal';
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const normalizeByMax = (value: number, max: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return clamp01(value / max);
};

const getTrendPreviewForCategory = async (
  category: Category,
): Promise<{ items: TrendPreviewItem[]; liveCount: number }> => {
  const query = getCategoryPrimaryQuery(category);

  switch (category.apiSource) {
    case 'arxiv': {
      const papers = await fetchArxivPapers(query, 6);
      return {
        liveCount: papers.length,
        items: papers.slice(0, 2).map((paper) => ({
          id: paper.id,
          title: paper.title,
          subtitle: paper.authors || 'Autores no disponibles',
          meta: paper.published || 'Paper reciente',
          href: paper.link || null,
        })),
      };
    }
    case 'wikipedia': {
      const articles = await fetchWikipediaArticles(query, 6);
      return {
        liveCount: articles.length,
        items: articles.slice(0, 2).map((article) => ({
          id: String(article.id),
          title: article.title,
          subtitle: article.summary || 'Resumen no disponible',
          meta: 'Wikipedia',
          href: article.link || null,
        })),
      };
    }
    case 'hackernews': {
      const stories = await fetchHackerNews(query, 6);
      return {
        liveCount: stories.length,
        items: stories.slice(0, 2).map((story) => ({
          id: String(story.id),
          title: story.title,
          subtitle: `${story.score.toLocaleString('es-ES')} puntos · ${story.comments.toLocaleString('es-ES')} comentarios`,
          meta: story.time || 'Hacker News',
          href: story.url || null,
        })),
      };
    }
    case 'openlibrary': {
      const books = await fetchBooks(query, 6);
      return {
        liveCount: books.length,
        items: books.slice(0, 2).map((book) => ({
          id: book.id,
          title: book.title,
          subtitle: book.authors || 'Autor no disponible',
          meta: String(book.firstPublished ?? 'Sin fecha'),
          href: book.link || null,
        })),
      };
    }
    case 'inaturalist': {
      const observations = await fetchNatureObservations(query, 6);
      return {
        liveCount: observations.length,
        items: observations.slice(0, 2).map((observation) => ({
          id: String(observation.id),
          title: observation.species,
          subtitle: observation.location || observation.scientificName || 'Ubicacion no disponible',
          meta: observation.observer || 'iNaturalist',
          href: observation.link || null,
        })),
      };
    }
    case 'lastfm': {
      const tracks = await fetchMusicInfo(query, 6);
      return {
        liveCount: tracks.length,
        items: tracks.slice(0, 2).map((track) => ({
          id: String(track.id),
          title: track.title,
          subtitle: track.artist || 'Artista no disponible',
          meta: track.listeners ? `${track.listeners} oyentes` : 'Musica en vivo',
          href: track.link || null,
        })),
      };
    }
    default:
      return { items: [], liveCount: 0 };
  }
};

const DiscoverPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';

  // Load user interests from onboarding for personalization
  const userInterests = useMemo(() => {
    try {
      const stored = localStorage.getItem('vinctus_interests');
      const parsed = stored ? JSON.parse(stored) : [];
      // Ensure it's always an array to prevent .length/.includes errors
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  // Use global state from context
  const {
    toggleSaveCategory,
    isCategorySaved,
    followedCategories,
    toggleFollowCategory,
    isCategoryFollowed,
    toggleLikePost,
    isPostLiked,
    toggleSavePost,
    isPostSaved,
  } = useAppState();
  const { user } = useAuth();
  const { showToast } = useToast();

  // Search filters state (local, not persisted)
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFiltersState>({
    category: null,
    sortBy: 'relevance',
  });
  const [allGroups, setAllGroups] = useState<FirestoreGroup[]>([]);
  const [groups, setGroups] = useState<FirestoreGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [groupJoinStatusMap, setGroupJoinStatusMap] = useState<Record<string, GroupJoinStatus>>({});
  const [groupActionLoading, setGroupActionLoading] = useState<string | null>(null);
  const [arenaDebates, setArenaDebates] = useState<Debate[]>([]);
  const [arenaDebatesLoading, setArenaDebatesLoading] = useState(false);
  const [arenaDebatesError, setArenaDebatesError] = useState<string | null>(null);
  const [activeTrendCategoryId, setActiveTrendCategoryId] = useState<string | null>(null);
  const [trendPreviewState, setTrendPreviewState] = useState<Record<string, TrendPreviewState>>({});
  const previewRequestedRef = useRef<Set<string>>(new Set());
  const publicationLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const publicationObserverLockedRef = useRef(false);
  const [visiblePublicationCount, setVisiblePublicationCount] = useState(PUBLICATION_BATCH_SIZE);
  const [communityPublications, setCommunityPublications] = useState<PublicationStreamItem[]>([]);
  const [communityCursor, setCommunityCursor] = useState<PostCursor>(null);
  const [communityHasMore, setCommunityHasMore] = useState(true);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityReady, setCommunityReady] = useState(false);
  const [youtubeQueryInput, setYoutubeQueryInput] = useState(YOUTUBE_FALLBACK_QUERY);
  const [youtubeQuery, setYoutubeQuery] = useState(YOUTUBE_FALLBACK_QUERY);
  const [youtubePublications, setYoutubePublications] = useState<PublicationStreamItem[]>([]);
  const [youtubeNextPageToken, setYoutubeNextPageToken] = useState<string | null>(null);
  const [youtubeHasMore, setYoutubeHasMore] = useState(false);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeReady, setYoutubeReady] = useState(false);
  const [activeYouTubePublication, setActiveYouTubePublication] =
    useState<PublicationStreamItem | null>(null);

  const filteredCategories = useMemo(() => {
    let result = [...CATEGORIES];

    // Sort: user interests first (personalization from onboarding)
    if (userInterests.length > 0 && filters.sortBy === 'relevance') {
      result.sort((a, b) => {
        const aIsInterest = userInterests.includes(a.id);
        const bIsInterest = userInterests.includes(b.id);
        if (aIsInterest && !bIsInterest) return -1;
        if (!aIsInterest && bIsInterest) return 1;
        return 0;
      });
    }
    if (filters.category) {
      result = result.filter((cat) => cat.id === filters.category);
    }

    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (cat) =>
          cat.label.toLowerCase().includes(query) ||
          cat.description.toLowerCase().includes(query) ||
          cat.subgroups.some((sub) => sub.name.toLowerCase().includes(query)),
      );
    }

    // Apply sorting
    if (filters.sortBy === 'alphabetical') {
      result = [...result].sort((a, b) => a.label.localeCompare(b.label));
    } else if (filters.sortBy === 'popular') {
      // Sort by number of subgroups as proxy for popularity
      result = [...result].sort((a, b) => b.subgroups.length - a.subgroups.length);
    } else if (filters.sortBy === 'recent') {
      // For now, reverse the default order to simulate "recent"
      // In production, this would sort by a real timestamp
      result = [...result].reverse();
    }

    return result;
  }, [searchQuery, filters, userInterests]);

  const curatedArenaDebates = useMemo(() => {
    return [...arenaDebates]
      .filter((debate) => debate.status === 'done' && getDebateSourceCount(debate) > 0)
      .sort((a, b) => {
        const scoreDiff = getDebateCurationScore(b) - getDebateCurationScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        const sourceDiff = getDebateSourceCount(b) - getDebateSourceCount(a);
        if (sourceDiff !== 0) return sourceDiff;
        const likesDiff = getDebateLikesCount(b) - getDebateLikesCount(a);
        if (likesDiff !== 0) return likesDiff;
        const aTime = toDate(a.createdAt)?.getTime() ?? 0;
        const bTime = toDate(b.createdAt)?.getTime() ?? 0;
        return bTime - aTime;
      })
      .slice(0, 6);
  }, [arenaDebates]);

  const publicationStream = useMemo<PublicationStreamItem[]>(() => {
    const targetCount = Math.max(PUBLICATION_BATCH_SIZE, visiblePublicationCount);
    const isYouTubeSearchActive =
      youtubeQuery.trim().toLowerCase() !== YOUTUBE_FALLBACK_QUERY.toLowerCase();

    let communitySlice: PublicationStreamItem[] = [];
    let youtubeSlice: PublicationStreamItem[] = [];

    if (isYouTubeSearchActive) {
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
    const editorialItems = Array.from(
      { length: missingCount + PUBLICATION_BATCH_SIZE },
      (_, index) => buildEditorialPublication(editorialStartIndex + index),
    );
    const merged = isYouTubeSearchActive
      ? [...youtubeSlice, ...communitySlice, ...editorialItems]
      : [...communitySlice, ...youtubeSlice, ...editorialItems];
    const uniqueItems: PublicationStreamItem[] = [];
    const seen = new Set<string>();

    for (const item of merged) {
      const normalizedTitle = item.title.toLowerCase().trim();
      const dedupeKey =
        item.source === 'community'
          ? `community:${item.id}`
          : item.source === 'youtube'
            ? `youtube:${item.youtubeVideoId ?? item.id}`
            : `editorial:${normalizedTitle}`;
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
  }, [communityPublications, youtubePublications, visiblePublicationCount, youtubeQuery]);

  const hasMoreEditorial = visiblePublicationCount < PUBLICATION_MAX_ITEMS;
  const hasMorePublications = communityHasMore || youtubeHasMore || hasMoreEditorial;

  useEffect(() => {
    let active = true;

    const loadInitialCommunityPublications = async () => {
      setCommunityLoading(true);
      try {
        const result = await getGlobalFeed(PUBLICATION_BATCH_SIZE);
        if (!active) return;
        const mapped = result.items.map((post, index) => buildCommunityPublication(post, index));
        setCommunityPublications(mapped);
        setCommunityCursor(result.lastDoc ?? null);
        setCommunityHasMore(result.hasMore);
      } catch (error) {
        console.error('Error loading community publications for Discover:', error);
        if (!active) return;
        setCommunityPublications([]);
        setCommunityCursor(null);
        setCommunityHasMore(false);
      } finally {
        if (active) {
          setCommunityLoading(false);
          setCommunityReady(true);
        }
      }
    };

    void loadInitialCommunityPublications();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalized = youtubeQueryInput.trim().replace(/\s+/g, ' ');
      const nextQuery = normalized.length >= 2 ? normalized : YOUTUBE_FALLBACK_QUERY;
      setYoutubeQuery((prev) => (prev === nextQuery ? prev : nextQuery));
    }, YOUTUBE_QUERY_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [youtubeQueryInput]);

  useEffect(() => {
    let active = true;

    const loadInitialYouTubePublications = async () => {
      setYoutubeLoading(true);
      setYoutubeReady(false);
      try {
        const result = await fetchYouTubeSearchVideos({
          query: youtubeQuery,
          limit: YOUTUBE_BATCH_SIZE,
        });
        if (!active) return;

        const mapped = result.items.map((item, index) =>
          buildYouTubePublication(item, index, youtubeQuery),
        );
        const unique = Array.from(new Map(mapped.map((item) => [item.id, item])).values());
        setYoutubePublications(unique);
        setYoutubeNextPageToken(result.nextPageToken ?? null);
        setYoutubeHasMore(Boolean(result.nextPageToken));
      } catch (error) {
        console.error('Error loading YouTube publications for Discover:', error);
        if (!active) return;
        setYoutubePublications([]);
        setYoutubeNextPageToken(null);
        setYoutubeHasMore(false);
      } finally {
        if (active) {
          setYoutubeLoading(false);
          setYoutubeReady(true);
        }
      }
    };

    void loadInitialYouTubePublications();
    return () => {
      active = false;
    };
  }, [youtubeQuery]);

  useEffect(() => {
    if (!activeYouTubePublication) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveYouTubePublication(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeYouTubePublication]);

  const groupCountByCategory = useMemo(() => {
    return allGroups.reduce<Record<string, number>>((acc, group) => {
      const categoryId = group.categoryId;
      if (!categoryId) return acc;
      acc[categoryId] = (acc[categoryId] ?? 0) + 1;
      return acc;
    }, {});
  }, [allGroups]);

  const groupSocialByCategory = useMemo(() => {
    return allGroups.reduce<Record<string, { groups: number; members: number }>>((acc, group) => {
      const categoryId = group.categoryId;
      if (!categoryId) return acc;
      if (!acc[categoryId]) {
        acc[categoryId] = { groups: 0, members: 0 };
      }
      acc[categoryId].groups += 1;
      acc[categoryId].members += Math.max(0, group.memberCount ?? 0);
      return acc;
    }, {});
  }, [allGroups]);

  const weeklyDeltaByCategory = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const currentWeekStart = now - weekMs;
    const previousWeekStart = now - weekMs * 2;
    const counters: Record<string, { current: number; previous: number }> = {};

    for (const group of allGroups) {
      if (!group.categoryId || !group.createdAt) continue;
      const createdAtTime = group.createdAt.getTime();
      if (!Number.isFinite(createdAtTime) || createdAtTime <= 0) continue;
      if (!counters[group.categoryId]) {
        counters[group.categoryId] = { current: 0, previous: 0 };
      }
      if (createdAtTime >= currentWeekStart && createdAtTime <= now) {
        counters[group.categoryId].current += 1;
      } else if (createdAtTime >= previousWeekStart && createdAtTime < currentWeekStart) {
        counters[group.categoryId].previous += 1;
      }
    }

    const result: Record<string, number> = {};
    for (const category of CATEGORIES) {
      const current = counters[category.id]?.current ?? 0;
      const previous = counters[category.id]?.previous ?? 0;
      if (previous === 0) {
        result[category.id] = current > 0 ? 100 : 0;
      } else {
        const raw = ((current - previous) / previous) * 100;
        result[category.id] = Math.round(raw);
      }
    }

    return result;
  }, [allGroups]);

  const sourceSignalByCategory = useMemo(() => {
    return CATEGORIES.reduce<Record<string, { linkCoverage: number; uniqueHosts: number }>>(
      (acc, category) => {
        const preview = trendPreviewState[category.id];
        const items = preview?.items ?? [];
        const hrefs = items
          .map((item) => item.href)
          .filter((href): href is string => typeof href === 'string' && href.trim().length > 0);
        const uniqueHosts = new Set(
          hrefs.map((href) => {
            const host = extractHostname(href);
            return host || href;
          }),
        ).size;
        const linkCoverage = items.length > 0 ? hrefs.length / items.length : 0;
        acc[category.id] = {
          linkCoverage: clamp01(linkCoverage),
          uniqueHosts,
        };
        return acc;
      },
      {},
    );
  }, [trendPreviewState]);

  const followedCategorySet = useMemo(() => new Set(followedCategories), [followedCategories]);
  const userInterestSet = useMemo(() => new Set(userInterests), [userInterests]);

  const trendScoresByCategory = useMemo(() => {
    const liveCounts = filteredCategories.map(
      (category) => trendPreviewState[category.id]?.liveCount ?? 0,
    );
    const groupCounts = filteredCategories.map(
      (category) => groupCountByCategory[category.id] ?? 0,
    );
    const memberCounts = filteredCategories.map(
      (category) => groupSocialByCategory[category.id]?.members ?? 0,
    );
    const sourceHosts = filteredCategories.map(
      (category) => sourceSignalByCategory[category.id]?.uniqueHosts ?? 0,
    );

    const maxLive = Math.max(1, ...liveCounts);
    const maxGroupCount = Math.max(1, ...groupCounts);
    const maxMembers = Math.max(1, ...memberCounts);
    const maxSourceHosts = Math.max(1, ...sourceHosts);

    return filteredCategories.reduce<
      Record<
        string,
        {
          follows: number;
          freshness: number;
          score: number;
          social: number;
          sources: number;
        }
      >
    >((acc, category) => {
      const categoryId = category.id;
      const liveCount = trendPreviewState[categoryId]?.liveCount ?? 0;
      const weeklyDelta = weeklyDeltaByCategory[categoryId] ?? 0;
      const groupCount = groupCountByCategory[categoryId] ?? 0;
      const memberCount = groupSocialByCategory[categoryId]?.members ?? 0;
      const uniqueHosts = sourceSignalByCategory[categoryId]?.uniqueHosts ?? 0;
      const linkCoverage = sourceSignalByCategory[categoryId]?.linkCoverage ?? 0;

      const freshness = clamp01(
        normalizeByMax(liveCount, maxLive) * 0.65 + clamp01((weeklyDelta + 100) / 200) * 0.35,
      );
      const social = clamp01(
        normalizeByMax(groupCount, maxGroupCount) * 0.45 +
          normalizeByMax(memberCount, maxMembers) * 0.55,
      );
      const sources = clamp01(
        normalizeByMax(uniqueHosts, maxSourceHosts) * 0.7 + clamp01(linkCoverage) * 0.3,
      );
      const follows = followedCategorySet.has(categoryId)
        ? 1
        : userInterestSet.has(categoryId)
          ? 0.45
          : 0;

      const score = clamp01(freshness * 0.35 + social * 0.3 + sources * 0.2 + follows * 0.15);

      acc[categoryId] = {
        follows,
        freshness,
        score,
        social,
        sources,
      };
      return acc;
    }, {});
  }, [
    filteredCategories,
    trendPreviewState,
    weeklyDeltaByCategory,
    groupCountByCategory,
    groupSocialByCategory,
    sourceSignalByCategory,
    followedCategorySet,
    userInterestSet,
  ]);

  const rankedTrendCategories = useMemo(() => {
    return [...filteredCategories].sort((a, b) => {
      const scoreDiff =
        (trendScoresByCategory[b.id]?.score ?? 0) - (trendScoresByCategory[a.id]?.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;

      const weeklyDiff = (weeklyDeltaByCategory[b.id] ?? 0) - (weeklyDeltaByCategory[a.id] ?? 0);
      if (weeklyDiff !== 0) return weeklyDiff;

      const liveDiff =
        (trendPreviewState[b.id]?.liveCount ?? 0) - (trendPreviewState[a.id]?.liveCount ?? 0);
      if (liveDiff !== 0) return liveDiff;

      return a.label.localeCompare(b.label, 'es');
    });
  }, [filteredCategories, trendScoresByCategory, weeklyDeltaByCategory, trendPreviewState]);

  const trendRankPositionByCategory = useMemo(() => {
    return rankedTrendCategories.reduce<Record<string, number>>((acc, category, index) => {
      acc[category.id] = index + 1;
      return acc;
    }, {});
  }, [rankedTrendCategories]);

  const trendCards = useMemo(() => rankedTrendCategories.slice(0, 4), [rankedTrendCategories]);
  const featuredTrendCategory = trendCards[0] ?? null;
  const secondaryTrendCategories = trendCards.slice(1);
  const activeTrendCategory = useMemo(
    () =>
      trendCards.find((category) => category.id === activeTrendCategoryId) ?? trendCards[0] ?? null,
    [trendCards, activeTrendCategoryId],
  );
  const activeTrendPreview = activeTrendCategory
    ? (trendPreviewState[activeTrendCategory.id] ?? {
        loading: false,
        error: null,
        items: [],
        liveCount: 0,
      })
    : null;
  const getTrendSignals = useCallback(
    (categoryId: string): { liveLabel: string; groupsLabel: string; weeklyLabel: string } => {
      const liveCount = trendPreviewState[categoryId]?.liveCount ?? 0;
      const groupCount = groupCountByCategory[categoryId] ?? 0;
      const category = CATEGORIES.find((item) => item.id === categoryId);
      const weeklyDelta = weeklyDeltaByCategory[categoryId] ?? 0;
      return {
        liveLabel: category
          ? getLiveSignalLabel(category, liveCount)
          : `${liveCount} novedades hoy`,
        groupsLabel: `${groupCount} grupos activos`,
        weeklyLabel: formatWeeklyDelta(weeklyDelta),
      };
    },
    [groupCountByCategory, trendPreviewState, weeklyDeltaByCategory],
  );

  const loadMoreCommunityPublications = useCallback(async () => {
    if (communityLoading || !communityHasMore) return;
    setCommunityLoading(true);
    try {
      const result = await getGlobalFeed(PUBLICATION_BATCH_SIZE, communityCursor ?? undefined);
      setCommunityPublications((prev) => {
        const offset = prev.length;
        const mapped = result.items.map((post, index) =>
          buildCommunityPublication(post, offset + index),
        );
        return [...prev, ...mapped];
      });
      setCommunityCursor(result.lastDoc ?? null);
      setCommunityHasMore(result.hasMore);
    } catch (error) {
      console.error('Error loading more community publications for Discover:', error);
      setCommunityHasMore(false);
      showToast('No se pudieron cargar más publicaciones de la comunidad.', 'error');
    } finally {
      setCommunityLoading(false);
    }
  }, [communityLoading, communityHasMore, communityCursor, showToast]);

  const loadMoreYouTubePublications = useCallback(async () => {
    if (youtubeLoading || !youtubeHasMore || !youtubeNextPageToken) return;
    setYoutubeLoading(true);
    try {
      const result = await fetchYouTubeSearchVideos({
        query: youtubeQuery,
        limit: YOUTUBE_BATCH_SIZE,
        pageToken: youtubeNextPageToken,
      });
      setYoutubePublications((prev) => {
        const offset = prev.length;
        const mapped = result.items.map((item, index) =>
          buildYouTubePublication(item, offset + index, youtubeQuery),
        );
        return Array.from(new Map([...prev, ...mapped].map((item) => [item.id, item])).values());
      });
      setYoutubeNextPageToken(result.nextPageToken ?? null);
      setYoutubeHasMore(Boolean(result.nextPageToken));
    } catch (error) {
      console.error('Error loading more YouTube publications for Discover:', error);
      setYoutubeHasMore(false);
      showToast('No se pudieron cargar mas videos de YouTube.', 'error');
    } finally {
      setYoutubeLoading(false);
    }
  }, [youtubeHasMore, youtubeLoading, youtubeNextPageToken, youtubeQuery, showToast]);

  const loadTrendPreview = useCallback(async (category: Category) => {
    const categoryId = category.id;
    if (previewRequestedRef.current.has(categoryId)) return;

    previewRequestedRef.current.add(categoryId);
    setTrendPreviewState((prev) => ({
      ...prev,
      [categoryId]: {
        loading: true,
        error: null,
        items: prev[categoryId]?.items ?? [],
        liveCount: prev[categoryId]?.liveCount ?? 0,
      },
    }));

    try {
      const preview = await getTrendPreviewForCategory(category);
      setTrendPreviewState((prev) => ({
        ...prev,
        [categoryId]: {
          loading: false,
          error: null,
          items: preview.items,
          liveCount: preview.liveCount,
        },
      }));
    } catch (previewError) {
      console.error('Error loading trend preview:', previewError);
      previewRequestedRef.current.delete(categoryId);
      setTrendPreviewState((prev) => ({
        ...prev,
        [categoryId]: {
          loading: false,
          error: 'No se pudo cargar la vista previa.',
          items: prev[categoryId]?.items ?? [],
          liveCount: prev[categoryId]?.liveCount ?? 0,
        },
      }));
    }
  }, []);

  useEffect(() => {
    if (trendCards.length === 0) {
      setActiveTrendCategoryId(null);
      return;
    }
    const hasActive = activeTrendCategoryId
      ? trendCards.some((category) => category.id === activeTrendCategoryId)
      : false;
    if (!hasActive) {
      setActiveTrendCategoryId(trendCards[0].id);
    }
  }, [activeTrendCategoryId, trendCards]);

  useEffect(() => {
    if (!activeTrendCategory) return;
    void loadTrendPreview(activeTrendCategory);
  }, [activeTrendCategory, loadTrendPreview]);

  useEffect(() => {
    filteredCategories.forEach((category) => {
      void loadTrendPreview(category);
    });
  }, [filteredCategories, loadTrendPreview]);

  useEffect(() => {
    if (!hasMorePublications) return;
    const sentinel = publicationLoadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting || publicationObserverLockedRef.current) return;
        publicationObserverLockedRef.current = true;
        setVisiblePublicationCount((prev) =>
          Math.min(prev + PUBLICATION_BATCH_SIZE, PUBLICATION_MAX_ITEMS),
        );
        if (communityHasMore) {
          void loadMoreCommunityPublications();
        }
        if (youtubeHasMore) {
          void loadMoreYouTubePublications();
        }
        window.setTimeout(() => {
          publicationObserverLockedRef.current = false;
        }, 220);
      },
      {
        root: null,
        rootMargin: '420px 0px',
        threshold: 0.01,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    hasMorePublications,
    communityHasMore,
    youtubeHasMore,
    loadMoreCommunityPublications,
    loadMoreYouTubePublications,
  ]);

  useEffect(() => {
    let isActive = true;

    const loadGroups = async () => {
      setGroupsLoading(true);
      setGroupsError(null);
      try {
        const data = await getGroups();
        const sorted = [...data].sort((a, b) => {
          const aMembers = a.memberCount ?? 0;
          const bMembers = b.memberCount ?? 0;
          if (aMembers !== bMembers) return bMembers - aMembers;
          const aTime = a.createdAt ? a.createdAt.getTime() : 0;
          const bTime = b.createdAt ? b.createdAt.getTime() : 0;
          return bTime - aTime;
        });
        if (isActive) {
          setAllGroups(sorted);
          setGroups(sorted.slice(0, 4));
        }
      } catch (loadError) {
        console.error('Error loading groups:', loadError);
        if (isActive) {
          setGroupsError('No se pudieron cargar grupos.');
        }
      } finally {
        if (isActive) {
          setGroupsLoading(false);
        }
      }
    };

    loadGroups();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadArenaDebates = async () => {
      setArenaDebatesLoading(true);
      setArenaDebatesError(null);
      try {
        const data = await getPublicArenaDebates(80);
        if (isActive) {
          setArenaDebates(data);
        }
      } catch (loadError) {
        console.error('Error loading arena debates for curation:', loadError);
        if (isActive) {
          setArenaDebatesError('No se pudieron cargar debates de Arena IA.');
        }
      } finally {
        if (isActive) {
          setArenaDebatesLoading(false);
        }
      }
    };

    void loadArenaDebates();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!user || groups.length === 0) {
      if (!user) setGroupJoinStatusMap({});
      return;
    }
    let isActive = true;
    const pending = groups.filter((group) => groupJoinStatusMap[group.id] === undefined);
    if (pending.length === 0) return;

    const loadStatuses = async () => {
      try {
        const updates: Record<string, GroupJoinStatus> = {};
        await Promise.all(
          pending.map(async (group) => {
            const status = await getGroupJoinStatus(group.id, user.uid);
            updates[group.id] = status;
          }),
        );
        if (isActive) {
          setGroupJoinStatusMap((prev) => ({ ...prev, ...updates }));
        }
      } catch (statusError) {
        console.error('Error loading group status:', statusError);
      }
    };

    loadStatuses();

    return () => {
      isActive = false;
    };
  }, [groups, user, groupJoinStatusMap]);

  const handleGroupAction = async (group: FirestoreGroup) => {
    if (!user) {
      showToast('Inicia sesion para unirte a grupos', 'info');
      return;
    }

    const status = groupJoinStatusMap[group.id] ?? 'none';
    const isOwner = group.ownerId && group.ownerId === user.uid;
    if (isOwner || status === 'member') {
      navigate(`/group/${group.id}`);
      return;
    }
    if (status === 'pending') {
      showToast('Solicitud pendiente', 'info');
      return;
    }

    setGroupActionLoading(group.id);
    try {
      const visibility = group.visibility ?? 'public';
      if (visibility === 'public') {
        await joinPublicGroup(group.id, user.uid);
        setGroupJoinStatusMap((prev) => ({ ...prev, [group.id]: 'member' }));
        showToast('Te uniste al grupo', 'success');
      } else {
        if (!group.ownerId) {
          throw new Error('Grupo privado sin owner');
        }
        await sendGroupJoinRequest({
          groupId: group.id,
          groupName: group.name,
          fromUid: user.uid,
          toUid: group.ownerId,
          message: null,
          fromUserName: user.displayName || 'Usuario',
          fromUserPhoto: user.photoURL || null,
        });
        setGroupJoinStatusMap((prev) => ({ ...prev, [group.id]: 'pending' }));
        showToast('Solicitud enviada', 'success');
      }
    } catch (actionError) {
      console.error('Error joining group:', actionError);
      showToast('No se pudo procesar la solicitud', 'error');
    } finally {
      setGroupActionLoading(null);
    }
  };

  const getGroupActionLabel = (group: FirestoreGroup): string => {
    if (user && group.ownerId === user.uid) return 'Tu grupo';
    const status = groupJoinStatusMap[group.id] ?? 'none';
    if (status === 'member') return 'Unido';
    if (status === 'pending') return 'Pendiente';
    return (group.visibility ?? 'public') === 'public' ? 'Unirme' : 'Solicitar';
  };

  const getGroupStats = (group: FirestoreGroup): { members: number; postsWeek: number } => {
    return {
      members: group.memberCount ?? 0,
      postsWeek: 0,
    };
  };

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchParams(value ? { q: value } : {}, { replace: true });
  };

  const activateTrendCategory = (category: Category) => {
    setActiveTrendCategoryId(category.id);
    void loadTrendPreview(category);
  };

  const openCategoryFromDiscover = (
    categoryId: string,
    source: DiscoverCategoryNavigationSource,
  ) => {
    navigate(`/category/${categoryId}`, {
      state: {
        fromDiscover: true,
        source,
        enteredAt: Date.now(),
      },
    });
  };

  const openPublicationFromDiscover = (publication: PublicationStreamItem) => {
    if (publication.source === 'youtube') {
      setActiveYouTubePublication(publication);
      return;
    }
    if (publication.postId) {
      navigate(`/post/${publication.postId}`, {
        state: {
          fromDiscover: true,
          source: 'publication-feed',
          enteredAt: Date.now(),
        },
      });
      return;
    }
    openCategoryFromDiscover(publication.categoryId, 'publication-feed');
  };

  const loadNextPublicationBatch = () => {
    setVisiblePublicationCount((prev) =>
      Math.min(prev + PUBLICATION_BATCH_SIZE, PUBLICATION_MAX_ITEMS),
    );
    if (communityHasMore) {
      void loadMoreCommunityPublications();
    }
    if (youtubeHasMore) {
      void loadMoreYouTubePublications();
    }
  };

  const renderPublicationFeedItem = (publication: PublicationStreamItem, index: number) => {
    const category = CATEGORIES.find((item) => item.id === publication.categoryId);
    const supportsCommunityActions =
      publication.source === 'community' && Boolean(publication.postId);
    const liked = supportsCommunityActions ? isPostLiked(publication.id) : false;
    const saved = supportsCommunityActions ? isPostSaved(publication.id) : false;
    const displayLikes = publication.likes + (liked ? 1 : 0);
    const bodyText = (publication.body || category?.description || '').replace(/\s+/g, ' ').trim();
    const youtubeDateLabel = publication.youtubePublishedAt
      ? toDate(publication.youtubePublishedAt)?.toLocaleDateString('es-ES', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : null;

    return (
      <article
        key={publication.streamKey}
        style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}
        className="overflow-hidden rounded-card border border-neutral-800/70 bg-surface-overlay/85 card-premium animate-in fade-in slide-in-from-bottom-2 duration-500"
      >
        <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 md:px-5">
          <div className="min-w-0 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-gold/35 bg-brand-gold/12">
              {category ? (
                <category.icon size={16} className={category.color} strokeWidth={1.6} />
              ) : (
                <BookOpen size={16} className="text-brand-gold" strokeWidth={1.6} />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{publication.group}</p>
              <p className="truncate text-[11px] uppercase tracking-wider text-neutral-400">
                {publication.category}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => openPublicationFromDiscover(publication)}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900/75 px-3 py-1.5 text-[10px] uppercase tracking-wider text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white"
          >
            {publication.source === 'youtube'
              ? 'Ver video'
              : publication.postId
                ? 'Ver publicacion'
                : 'Ver categoria'}
            <ArrowRight size={12} />
          </button>
        </header>

        <button
          type="button"
          onClick={() => openPublicationFromDiscover(publication)}
          className="group relative block w-full text-left"
        >
          <img
            src={publication.image}
            alt={publication.title}
            className="h-[280px] w-full object-cover md:h-[360px] transition-transform duration-700 group-hover:scale-[1.02]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
            <h3 className="text-heading-md font-display text-white leading-tight line-clamp-2">
              {publication.title}
            </h3>
            {bodyText && <p className="mt-1 text-sm text-neutral-300 line-clamp-2">{bodyText}</p>}
            {publication.source === 'youtube' && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-neutral-300">
                <span>{publication.youtubeChannelTitle || publication.group}</span>
                {youtubeDateLabel && <span>{youtubeDateLabel}</span>}
              </div>
            )}
          </div>
        </button>

        <div className="px-4 pb-4 pt-3 md:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!supportsCommunityActions) return;
                toggleLikePost(publication.id);
              }}
              disabled={!supportsCommunityActions}
              aria-label={`Me gusta: ${displayLikes}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                !supportsCommunityActions
                  ? 'cursor-not-allowed border-neutral-800 bg-neutral-900/40 text-neutral-500'
                  : liked
                    ? 'border-red-400/60 bg-red-500/15 text-red-300'
                    : 'border-neutral-700 bg-neutral-900/70 text-neutral-200 hover:border-neutral-500'
              }`}
            >
              <Heart size={13} fill={liked ? 'currentColor' : 'none'} />
              {displayLikes}
            </button>

            {publication.postId && (
              <button
                type="button"
                onClick={() => {
                  navigate(`/post/${publication.postId}`, {
                    state: {
                      fromDiscover: true,
                      source: 'publication-feed',
                      enteredAt: Date.now(),
                      openComments: true,
                    },
                  });
                }}
                aria-label={`Comentarios: ${publication.comments}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900/70 px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:border-neutral-500"
              >
                <MessageCircle size={13} />
                {publication.comments}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (!supportsCommunityActions) return;
                toggleSavePost(publication.id);
              }}
              disabled={!supportsCommunityActions}
              aria-label="Guardar publicacion"
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                !supportsCommunityActions
                  ? 'cursor-not-allowed border-neutral-800 bg-neutral-900/40 text-neutral-500'
                  : saved
                    ? 'border-brand-gold/50 bg-brand-gold/15 text-brand-gold'
                    : 'border-neutral-700 bg-neutral-900/70 text-neutral-200 hover:border-neutral-500'
              }`}
            >
              <Bookmark size={13} fill={saved ? 'currentColor' : 'none'} />
              {saved ? 'Guardado' : 'Guardar'}
            </button>

            <span className="ml-auto text-[10px] uppercase tracking-[0.2em] text-neutral-500">
              {publication.source === 'community'
                ? 'Comunidad'
                : publication.source === 'youtube'
                  ? 'YouTube'
                  : 'Editorial'}
            </span>
          </div>
        </div>
      </article>
    );
  };
  const renderTrendCard = (
    category: Category,
    variant: 'featured' | 'compact',
    rankIndex: number,
  ) => {
    const isFeatured = variant === 'featured';
    const isActive = activeTrendCategory?.id === category.id;
    const isSaved = isCategorySaved(category.id);
    const isFollowed = isCategoryFollowed(category.id);
    const signals = getTrendSignals(category.id);
    const rankPosition = trendRankPositionByCategory[category.id] ?? rankIndex + 1;
    const trendScore = Math.round((trendScoresByCategory[category.id]?.score ?? 0) * 100);
    const subgroupLimit = isFeatured ? 3 : 2;
    const titleClass = isFeatured ? 'text-[2.4rem]' : 'text-[1.85rem]';

    return (
      <article
        key={category.id}
        role="button"
        tabIndex={0}
        onMouseEnter={() => activateTrendCategory(category)}
        onFocus={() => activateTrendCategory(category)}
        onClick={() => activateTrendCategory(category)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activateTrendCategory(category);
          }
        }}
        style={{ animationDelay: `${Math.min(rankIndex, 5) * 80}ms` }}
        className={`group relative overflow-hidden rounded-card border bg-surface-overlay/90 p-5 transition-all duration-300 card-premium animate-in fade-in slide-in-from-bottom-2 ${
          isFeatured ? 'min-h-[320px] lg:min-h-[360px] lg:p-7' : 'min-h-[250px]'
        } ${
          isActive
            ? 'border-brand-gold/60 shadow-[0_0_0_1px_rgba(212,175,55,0.25),0_18px_42px_-18px_rgba(212,175,55,0.45)]'
            : 'border-neutral-800/70 hover:border-neutral-600'
        }`}
      >
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-brand-gold/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <div className="relative z-10 flex h-full flex-col">
          <div
            className={`flex ${isFeatured ? 'items-start justify-between gap-3' : 'flex-col gap-3'}`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className={`${category.color} mt-0.5`}>
                <category.icon size={isFeatured ? 30 : 24} strokeWidth={1.2} />
              </div>
              <div className="min-w-0">
                <h3 className={`${titleClass} text-white font-display leading-tight`}>
                  {category.label}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-brand-gold/35 bg-brand-gold/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-brand-gold">
                    Top {rankPosition}
                  </span>
                  <span className="rounded-full border border-neutral-700 bg-neutral-900/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neutral-300">
                    {trendScore} score
                  </span>
                </div>
                <p className="text-sm text-neutral-400 mt-1 line-clamp-2">{category.description}</p>
              </div>
            </div>

            <div
              className={`flex items-center gap-2 ${isFeatured ? 'shrink-0' : 'self-start flex-wrap'}`}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  const alreadyFollowed = isCategoryFollowed(category.id);
                  toggleFollowCategory(category.id);
                  showToast(
                    alreadyFollowed ? 'Categoria dejada de seguir' : 'Categoria seguida',
                    alreadyFollowed ? 'info' : 'success',
                  );
                }}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] uppercase tracking-wider transition-colors ${
                  isFollowed
                    ? 'border-brand-gold/50 bg-brand-gold/15 text-brand-gold'
                    : 'border-neutral-700 bg-neutral-900/80 text-neutral-300 hover:border-neutral-500'
                }`}
              >
                <UserPlus size={11} />
                {isFollowed ? 'Siguiendo' : 'Seguir'}
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleSaveCategory(category.id);
                }}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] uppercase tracking-wider transition-colors ${
                  isSaved
                    ? 'border-brand-gold/50 bg-brand-gold/15 text-brand-gold'
                    : 'border-neutral-700 bg-neutral-900/80 text-neutral-300 hover:border-neutral-500'
                }`}
              >
                <BookOpen size={11} />
                {isSaved ? 'Guardado' : 'Guardar'}
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full border border-brand-gold/30 bg-brand-gold/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-brand-gold">
              {signals.liveLabel}
            </span>
            <span className="rounded-full border border-neutral-700 bg-neutral-900/70 px-2.5 py-1 text-[10px] uppercase tracking-wider text-neutral-300">
              {signals.groupsLabel}
            </span>
            {isFeatured && (
              <span className="rounded-full border border-neutral-700 bg-neutral-900/70 px-2.5 py-1 text-[10px] uppercase tracking-wider text-neutral-400">
                {signals.weeklyLabel}
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {category.subgroups.slice(0, subgroupLimit).map((subgroup) => (
              <span
                key={subgroup.id}
                className="text-[10px] uppercase tracking-wider text-neutral-400 bg-neutral-800/60 px-2.5 py-1 rounded"
              >
                {subgroup.name}
              </span>
            ))}
          </div>

          <div className="mt-auto pt-5 flex items-center justify-between">
            {isFeatured ? (
              <span className="text-xs text-neutral-500">
                {isFollowed ? 'Recibiras novedades semanales' : 'Activa seguimiento para novedades'}
              </span>
            ) : (
              <span className="text-xs text-neutral-500">
                {isFollowed ? 'Siguiendo categoria' : 'Categoria en tendencia'}
              </span>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openCategoryFromDiscover(category.id, 'trend-card');
              }}
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-neutral-200 hover:text-white transition-colors"
            >
              Abrir
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </article>
    );
  };

  const renderTrendPreviewPanel = (className?: string) => {
    if (!activeTrendCategory || !activeTrendPreview) return null;
    return (
      <div
        className={`rounded-card border border-neutral-800/70 bg-surface-overlay/80 p-5 md:p-6 animate-in fade-in duration-300 ${
          className ?? ''
        }`}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
              Preview instantaneo
            </p>
            <h3 className="text-white text-xl font-display mt-1">{activeTrendCategory.label}</h3>
            <p className="text-sm text-neutral-400 mt-1">
              Top hallazgos recientes de la categoria, sin salir de Discover.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCategoryFromDiscover(activeTrendCategory.id, 'trend-preview')}
            className="inline-flex items-center gap-2 rounded-full border border-neutral-700 px-4 py-2 text-xs uppercase tracking-wider text-neutral-200 hover:border-neutral-500 hover:text-white transition-colors"
          >
            Ver categoria
            <ArrowRight size={12} />
          </button>
        </div>

        <div className="mt-4">
          {activeTrendPreview.loading ? (
            <div className="text-sm text-neutral-500">Cargando vista previa...</div>
          ) : activeTrendPreview.error ? (
            <div className="text-sm text-red-400">{activeTrendPreview.error}</div>
          ) : activeTrendPreview.items.length === 0 ? (
            <div className="text-sm text-neutral-500">
              No hay resultados disponibles para esta categoria ahora.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeTrendPreview.items.map((item, index) => {
                if (item.href) {
                  return (
                    <a
                      key={`${activeTrendCategory.id}-${item.id}`}
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      style={{ animationDelay: `${index * 90}ms` }}
                      className="block rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-4 hover:border-neutral-600 transition-colors animate-in fade-in slide-in-from-bottom-1 duration-500"
                    >
                      <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
                        {item.meta}
                      </p>
                      <h4 className="text-sm text-white font-medium line-clamp-2">{item.title}</h4>
                      <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{item.subtitle}</p>
                    </a>
                  );
                }

                return (
                  <div
                    key={`${activeTrendCategory.id}-${item.id}`}
                    style={{ animationDelay: `${index * 90}ms` }}
                    className="block rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-4 animate-in fade-in slide-in-from-bottom-1 duration-500"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
                      {item.meta}
                    </p>
                    <h4 className="text-sm text-white font-medium line-clamp-2">{item.title}</h4>
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{item.subtitle}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="page-discover pb-32">
      <header className="mb-12 pt-6 md:pt-10 flex flex-col items-center text-center">
        <div className="w-full max-w-4xl mb-8">
          <StoriesWidget />
        </div>
        <span className="text-caption font-medium tracking-[0.3em] text-neutral-500 uppercase mb-4">
          DESCUBRIR
        </span>
        <h1 className="text-display-sm md:text-display-md font-display font-normal text-white mb-8 tracking-tight">
          Curaduria de <span className="text-brand-gold italic">Intereses</span>
        </h1>

        <div className="w-full max-w-lg mt-4">
          <div className="relative bg-neutral-900/50 border border-neutral-800 rounded-full px-6 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowFilters(true)}
              aria-label="Abrir filtros"
              className={`p-1 rounded transition-colors ${filters.category || filters.sortBy !== 'relevance' ? 'text-brand-gold' : 'text-neutral-600 hover:text-white'}`}
            >
              <Filter size={18} />
            </button>
            <input
              type="text"
              aria-label="Buscar intereses o grupos"
              placeholder="Buscar intereses o grupos..."
              value={searchQuery}
              onChange={handleSearch}
              className="flex-1 bg-transparent text-white text-center focus:outline-none placeholder:text-neutral-600 font-light text-sm"
            />
            <Search className="text-neutral-600" size={18} />
          </div>
        </div>
      </header>

      <SearchFilters
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        filters={filters}
        onApply={setFilters}
      />

      <section className="mb-12">
        <h2 className="text-heading-lg font-display font-normal text-white mb-6">
          <span className="text-brand-gold">Tendencias</span> esta semana
        </h2>

        {trendCards.length === 0 ? (
          <div className="text-neutral-500 text-sm border border-dashed border-neutral-800 rounded-card p-6 text-center">
            No hay categorias para mostrar con los filtros actuales.
          </div>
        ) : (
          <>
            <div className="hidden lg:grid lg:grid-cols-12 gap-4 items-start stagger-premium">
              {featuredTrendCategory && (
                <div className="lg:col-span-8 space-y-4">
                  {renderTrendCard(featuredTrendCategory, 'featured', 0)}
                  {renderTrendPreviewPanel()}
                </div>
              )}
              <div className="lg:col-span-4 grid gap-4">
                {secondaryTrendCategories.map((category, index) => (
                  <div key={category.id}>{renderTrendCard(category, 'compact', index + 1)}</div>
                ))}
              </div>
            </div>

            <div className="lg:hidden flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
              {trendCards.map((category, index) => (
                <div key={category.id} className="w-[320px] flex-shrink-0">
                  {renderTrendCard(category, 'compact', index)}
                </div>
              ))}
            </div>

            {renderTrendPreviewPanel('mt-4 lg:hidden')}
          </>
        )}
      </section>

      <section className="mb-12">
        <h2 className="text-heading-lg font-display font-normal text-white mb-6">
          <span className="text-brand-gold">Debates IA</span> destacados
        </h2>

        {arenaDebatesLoading ? (
          <div className="text-center text-neutral-500 py-6">Cargando debates de Arena IA...</div>
        ) : arenaDebatesError ? (
          <div className="text-center text-red-400 py-6">{arenaDebatesError}</div>
        ) : curatedArenaDebates.length === 0 ? (
          <div className="text-center text-neutral-500 py-6">
            Aun no hay debates con fuentes detectadas. Cuando aparezcan referencias, se mostraran
            aqui.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {curatedArenaDebates.map((debate) => {
              const personaAName = getPersonaById(debate.personaA)?.name || 'Persona A';
              const personaBName = getPersonaById(debate.personaB)?.name || 'Persona B';
              const sourceCount = getDebateSourceCount(debate);
              const likesCount = getDebateLikesCount(debate);
              const sourceLinks = Array.isArray(debate.sourceLinks)
                ? debate.sourceLinks.slice(0, 2)
                : [];
              const sourceMentions = Array.isArray(debate.sourceMentions)
                ? debate.sourceMentions.slice(0, 2)
                : [];
              const createdDate = toDate(debate.createdAt);
              const dateLabel = createdDate
                ? createdDate.toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                  })
                : 'Reciente';

              return (
                <article
                  key={debate.id}
                  role="button"
                  tabIndex={0}
                  className="bg-surface-overlay border border-neutral-800/60 rounded-card p-5 cursor-pointer card-premium"
                  onClick={() => navigate(`/arena/${debate.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/arena/${debate.id}`);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-white font-medium text-lg line-clamp-2">
                        {debate.topic}
                      </h3>
                      <p className="text-xs text-neutral-500 mt-1">
                        {personaAName} vs {personaBName} - {dateLabel}
                      </p>
                    </div>
                    <div className="px-2.5 py-1 rounded bg-brand-gold/15 text-brand-gold text-xs uppercase tracking-wider whitespace-nowrap">
                      {sourceCount} fuentes - {likesCount} likes
                    </div>
                  </div>

                  {debate.summary && (
                    <p className="text-sm text-neutral-400 mt-3 line-clamp-3">{debate.summary}</p>
                  )}

                  {sourceLinks.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {sourceLinks.map((url) => {
                        const host = extractHostname(url) || url;
                        return (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="text-[10px] uppercase tracking-wider text-neutral-300 bg-neutral-800/80 hover:bg-neutral-700 px-2 py-1 rounded transition-colors"
                          >
                            {host}
                          </a>
                        );
                      })}
                    </div>
                  )}

                  {sourceMentions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sourceMentions.map((mention) => (
                        <span
                          key={`${debate.id}-${mention}`}
                          className="text-[10px] uppercase tracking-wider text-neutral-300 bg-neutral-800/80 px-2 py-1 rounded max-w-[220px] truncate"
                          title={mention}
                        >
                          {mention}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-12">
        <h2 className="text-lg font-light text-white mb-6">
          <span className="text-neutral-400">Grupos</span> recomendados
        </h2>

        {groupsLoading ? (
          <div className="text-center text-neutral-500 py-6">Cargando grupos...</div>
        ) : groupsError ? (
          <div className="text-center text-red-400 py-6">{groupsError}</div>
        ) : groups.length === 0 ? (
          <div className="text-center text-neutral-500 py-6">Aun no hay grupos disponibles.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((group) => {
              const stats = getGroupStats(group);
              const joinLabel = getGroupActionLabel(group);
              const isLoading = groupActionLoading === group.id;
              const actionLabel = isLoading ? 'Procesando...' : joinLabel;
              const isJoined = joinLabel === 'Unido' || joinLabel === 'Tu grupo';
              const isPending = joinLabel === 'Pendiente';
              const visibilityLabel =
                (group.visibility ?? 'public') === 'public' ? 'Publico' : 'Privado';

              return (
                <div
                  key={group.id}
                  role="button"
                  tabIndex={0}
                  className="bg-surface-1 border border-neutral-800/50 rounded-lg p-5 cursor-pointer hover:border-neutral-700 transition-colors"
                  onClick={() => navigate(`/group/${group.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/group/${group.id}`);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center overflow-hidden">
                        {group.iconUrl ? (
                          <img
                            src={group.iconUrl}
                            alt={group.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Users size={20} className="text-neutral-500" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-white font-medium text-lg truncate">{group.name}</h3>
                        <p className="text-neutral-500 text-sm mt-1 line-clamp-2">
                          {group.description || 'Sin descripcion.'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleGroupAction(group);
                      }}
                      disabled={isLoading}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all btn-premium press-scale ${
                        isJoined
                          ? 'bg-brand-gold text-black'
                          : isPending
                            ? 'bg-neutral-800 text-neutral-500'
                            : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                      } ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      {actionLabel}
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-neutral-800/50 mt-4">
                    <div className="text-neutral-500 text-xs">
                      {stats.members.toLocaleString('es-ES')} miembros - {stats.postsWeek}{' '}
                      posts/semana
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                      {visibilityLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-heading-lg font-display font-normal text-white mb-3">Publicaciones</h2>
        <p className="text-neutral-400 text-sm mb-6 max-w-2xl">
          Feed continuo de comunidad + YouTube para mantener Discover activo sin verse vacio.
        </p>

        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="relative w-full md:max-w-md">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
            />
            <input
              type="text"
              value={youtubeQueryInput}
              onChange={(event) => setYoutubeQueryInput(event.target.value)}
              placeholder="Buscar videos en YouTube dentro de Vinctus..."
              className="w-full rounded-full border border-neutral-700 bg-neutral-900/70 py-2 pl-9 pr-4 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </label>
          <span className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
            {youtubeLoading
              ? 'Buscando videos en vivo...'
              : `YouTube en vivo · ${youtubePublications.length.toLocaleString('es-ES')} items`}
          </span>
        </div>

        {communityReady && communityPublications.length === 0 && (
          <div className="mb-5 rounded-xl border border-neutral-800/70 bg-neutral-950/40 p-4 text-sm text-neutral-400">
            Aun no hay publicaciones recientes de usuarios. Mostramos una mezcla de YouTube y
            contenido editorial para mantener Discover activo.
          </div>
        )}

        <div className="rounded-card border border-neutral-800/60 bg-neutral-950/20 p-3 md:p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-[10px] uppercase tracking-[0.26em] text-neutral-500">
              Feed social en Discover
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-600">
              {communityPublications.length > 0
                ? 'Mixto: comunidad + YouTube + editorial'
                : youtubeReady && youtubePublications.length > 0
                  ? 'Seed YouTube + editorial'
                  : 'Editorial seed'}
            </span>
          </div>

          <div className="space-y-4 md:space-y-5">
            {publicationStream.map((publication, index) =>
              renderPublicationFeedItem(publication, index),
            )}
          </div>
        </div>

        {hasMorePublications && (
          <div className="mt-7 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={loadNextPublicationBatch}
              className="rounded-full border border-neutral-700 bg-neutral-900/60 px-4 py-2 text-[11px] uppercase tracking-wider text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white"
            >
              Cargar siguiente bloque
            </button>
            <div
              ref={publicationLoadMoreRef}
              className="flex items-center justify-center py-2 text-[11px] uppercase tracking-wider text-neutral-500"
            >
              {communityLoading || youtubeLoading
                ? 'Cargando publicaciones...'
                : 'Desliza para ver mas'}
            </div>
          </div>
        )}
      </section>

      {activeYouTubePublication?.youtubeVideoId &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[320] overflow-y-auto safe-area-inset bg-black/80 backdrop-blur-sm p-4 md:p-8"
            onClick={() => setActiveYouTubePublication(null)}
          >
            <div
              className="mx-auto my-2 w-full max-w-5xl rounded-card border border-neutral-800 bg-neutral-950/95 shadow-2xl md:my-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3 md:px-5">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">
                  YouTube en Vinctus
                </p>
                <button
                  type="button"
                  onClick={() => setActiveYouTubePublication(null)}
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wider text-neutral-200 hover:border-neutral-500 hover:text-white"
                >
                  Cerrar
                  <X size={12} />
                </button>
              </div>

              <div className="p-4 pb-6 md:p-5 md:pb-8">
                <div className="aspect-video overflow-hidden rounded-xl border border-neutral-800 bg-black">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${activeYouTubePublication.youtubeVideoId}?rel=0`}
                    title={activeYouTubePublication.title}
                    className="h-full w-full"
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>

                <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-white text-lg font-display leading-tight">
                      {activeYouTubePublication.title}
                    </h3>
                    <p className="mt-1 text-sm text-neutral-400">
                      {activeYouTubePublication.youtubeChannelTitle ||
                        activeYouTubePublication.group}
                    </p>
                  </div>
                  {activeYouTubePublication.youtubeUrl && (
                    <a
                      href={activeYouTubePublication.youtubeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900/70 px-4 py-2 text-xs uppercase tracking-wider text-neutral-200 hover:border-neutral-500 hover:text-white"
                    >
                      Abrir en YouTube
                      <ArrowRight size={12} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default DiscoverPage;
