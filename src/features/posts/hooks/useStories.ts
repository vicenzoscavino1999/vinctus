import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getFriendIds,
  getFollowingIds,
  getStoriesForOwners,
  type StoryRead,
} from '@/features/posts/api';
import { STORY_DURATION_MS } from '@/shared/lib/storyConstants';
import { fetchYouTubeShorts, type YouTubeShortVideo } from '@/shared/lib/youtubeShortsApi';

const MAX_STORY_GROUPS = 20;
const SHORTS_FETCH_LIMIT = 50;
const SHORTS_TARGET_COUNT = 20;
const SHORTS_SPREAD_WINDOW_MS = 20 * 60 * 60 * 1000;
const SHORTS_DEFAULT_QUERY = 'shorts ciencia tecnologia musica historia naturaleza filosofia';
const FALLBACK_SHORT_VIDEO_IDS = [
  'jNQXAC9IVRw',
  'dQw4w9WgXcQ',
  '9bZkp7q19f0',
  '3JZ_D3ELwOQ',
  'fRh_vgS2dFE',
  'kXYiU_JCYtU',
  'uelHwf8o7_U',
  'RgKAFK5djSk',
  'JGwWNGJdvx8',
  'CevxZvSJLk8',
  'YQHsXMglC9A',
  'OPf0YbXqDm0',
  '2Vv-BfVoq4g',
  'hT_nvWreIhg',
  'pRpeEdMmmQ0',
  'e-ORhEE9VVg',
  'ktvTqknDobU',
  '60ItHLz5WEA',
  '09R8_2nJtjg',
  'hLQl3WQQoQ0',
];

export type StoryFeedItem = {
  id: string;
  source: 'story' | 'seededShort';
  ownerId: string;
  ownerName: string;
  ownerPhoto: string | null;
  mediaType: StoryRead['mediaType'];
  mediaUrl: string;
  mediaPath: string | null;
  thumbUrl: string | null;
  createdAt: Date;
  expiresAt: Date;
};

export type StoryGroup = {
  ownerId: string;
  ownerName: string;
  ownerPhoto: string | null;
  items: StoryFeedItem[];
  latestAt: number;
};

type UseStoriesParams = {
  userId: string | null | undefined;
  userDisplayName?: string | null;
  userPhotoURL?: string | null;
};

const SEEDED_OWNER_PREFIX = 'yt-short-owner-';
export const isSeededOwner = (ownerId: string) => ownerId.startsWith(SEEDED_OWNER_PREFIX);

const hashString = (value: string): number => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return Math.abs(hash);
};

const mapStoryToFeedItem = (story: StoryRead): StoryFeedItem => ({
  id: story.id,
  source: 'story',
  ownerId: story.ownerId,
  ownerName: story.ownerSnapshot.displayName || 'Usuario',
  ownerPhoto: story.ownerSnapshot.photoURL || null,
  mediaType: story.mediaType,
  mediaUrl: story.mediaUrl,
  mediaPath: story.mediaPath,
  thumbUrl: story.thumbUrl,
  createdAt: story.createdAt,
  expiresAt: story.expiresAt,
});

const buildRotatingShortItems = (videos: YouTubeShortVideo[]): StoryFeedItem[] => {
  if (videos.length === 0) return [];

  const dayKey = new Date().toISOString().slice(0, 10);
  const ranked = videos
    .map((video) => ({
      score: hashString(`${dayKey}:pick:${video.videoId}`),
      video,
    }))
    .sort((a, b) => a.score - b.score);

  const selected = ranked.slice(0, SHORTS_TARGET_COUNT).map(({ video }) => video);
  const nowMs = Date.now();

  return selected.map((video, index) => {
    const createdOffsetMs =
      hashString(`${dayKey}:time:${video.videoId}:${index}`) % SHORTS_SPREAD_WINDOW_MS;
    const createdAt = new Date(nowMs - createdOffsetMs);
    const expiresAt = new Date(createdAt.getTime() + STORY_DURATION_MS);
    const thumbnailUrl =
      video.thumbnailUrl ?? `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;
    const ownerName = video.channelTitle?.trim() || 'YouTube Shorts';

    return {
      id: `yt-short-${video.videoId}`,
      source: 'seededShort',
      ownerId: `${SEEDED_OWNER_PREFIX}${video.videoId}`,
      ownerName,
      ownerPhoto: thumbnailUrl,
      mediaType: 'video',
      mediaUrl: video.watchUrl,
      mediaPath: `youtube:${video.videoId}`,
      thumbUrl: thumbnailUrl,
      createdAt,
      expiresAt,
    } satisfies StoryFeedItem;
  });
};

const buildFallbackShortVideos = (): YouTubeShortVideo[] =>
  FALLBACK_SHORT_VIDEO_IDS.map((videoId, index) => ({
    channelId: `fallback-channel-${index + 1}`,
    channelTitle: 'YouTube Shorts',
    description: 'Short recomendado mientras carga el feed en vivo.',
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
    liveBroadcastContent: 'none',
    publishedAt: null,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    title: `Short #${index + 1}`,
    videoId,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
  }));

const mergeActiveItems = (items: StoryFeedItem[]): StoryFeedItem[] => {
  const nowMs = Date.now();
  const merged = new Map<string, StoryFeedItem>();
  items.forEach((item) => {
    const expiresAtMs = item.expiresAt?.getTime?.() ?? 0;
    if (expiresAtMs <= nowMs) return;
    merged.set(item.id, item);
  });

  return Array.from(merged.values()).sort((a, b) => {
    const aTime = a.createdAt?.getTime?.() ?? 0;
    const bTime = b.createdAt?.getTime?.() ?? 0;
    return bTime - aTime;
  });
};

export const useStories = ({ userId, userDisplayName, userPhotoURL }: UseStoriesParams) => {
  const [items, setItems] = useState<StoryFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequestIdRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(userId ?? null);

  useEffect(() => {
    activeUserIdRef.current = userId ?? null;
    if (!userId) {
      latestRequestIdRef.current += 1;
    }
  }, [userId]);

  useEffect(
    () => () => {
      latestRequestIdRef.current += 1;
    },
    [],
  );

  const refreshStories = useCallback(async () => {
    const currentUid = userId ?? null;
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;

    const isStale = () =>
      latestRequestIdRef.current !== requestId || activeUserIdRef.current !== currentUid;
    const safeCommit = (callback: () => void) => {
      if (isStale()) return;
      callback();
    };

    if (!currentUid) {
      safeCommit(() => {
        setItems([]);
        setError(null);
        setLoading(false);
      });
      return;
    }

    safeCommit(() => {
      setLoading(true);
      setError(null);
    });

    let hadFailure = false;
    let nextItems: StoryFeedItem[] = [];

    try {
      const ownStories = await getStoriesForOwners([currentUid]);
      if (isStale()) return;
      nextItems = ownStories.map(mapStoryToFeedItem);
    } catch (ownError) {
      hadFailure = true;
      console.warn('[StoriesWidget] Error loading own stories:', ownError);
    }

    let relationshipOwnerIds: string[] = [];
    try {
      const [friendResult, followingResult] = await Promise.allSettled([
        getFriendIds(currentUid),
        getFollowingIds(currentUid),
      ]);
      if (isStale()) return;

      const friendIds = friendResult.status === 'fulfilled' ? friendResult.value : [];
      const followingIds = followingResult.status === 'fulfilled' ? followingResult.value : [];

      if (friendResult.status === 'rejected') {
        hadFailure = true;
        console.warn('Error loading friend ids:', friendResult.reason);
      }
      if (followingResult.status === 'rejected') {
        hadFailure = true;
        console.warn('Error loading following ids:', followingResult.reason);
      }

      relationshipOwnerIds = Array.from(
        new Set([...friendIds, ...followingIds].filter((id) => id && id !== currentUid)),
      );
    } catch (relationError) {
      hadFailure = true;
      console.warn('Error loading relationship ids, showing own stories only:', relationError);
    }

    if (relationshipOwnerIds.length > 0) {
      try {
        const friendStories = await getStoriesForOwners(relationshipOwnerIds);
        if (isStale()) return;
        const merged = new Map<string, StoryFeedItem>();
        [...nextItems, ...friendStories.map(mapStoryToFeedItem)].forEach((item) =>
          merged.set(item.id, item),
        );
        nextItems = Array.from(merged.values());
      } catch (friendStoryError) {
        hadFailure = true;
        console.warn('Error loading relationship stories:', friendStoryError);
      }
    }

    let seededShortItems: StoryFeedItem[] = [];
    try {
      const shorts = await fetchYouTubeShorts({
        limit: SHORTS_FETCH_LIMIT,
        query: SHORTS_DEFAULT_QUERY,
      });
      if (isStale()) return;
      const sourceVideos = shorts.items.length > 0 ? shorts.items : buildFallbackShortVideos();
      seededShortItems = buildRotatingShortItems(sourceVideos);
    } catch (shortsError) {
      console.warn('[StoriesWidget] Error loading seeded YouTube Shorts:', shortsError);
      seededShortItems = buildRotatingShortItems(buildFallbackShortVideos());
    }

    const mergedItems = mergeActiveItems([...nextItems, ...seededShortItems]);
    safeCommit(() => {
      if (mergedItems.length === 0 && hadFailure) {
        setError('No se pudieron cargar historias.');
      }
      setItems(mergedItems);
      setLoading(false);
    });
  }, [userId]);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshStories();
    });
  }, [refreshStories]);

  const groups = useMemo(() => {
    if (!userId) return [];
    const map = new Map<string, StoryGroup>();
    items.forEach((item) => {
      const existing = map.get(item.ownerId);
      const createdAt = item.createdAt?.getTime?.() ?? 0;

      if (!existing) {
        map.set(item.ownerId, {
          ownerId: item.ownerId,
          ownerName: item.ownerName,
          ownerPhoto: item.ownerPhoto,
          items: [item],
          latestAt: createdAt,
        });
      } else {
        existing.items.push(item);
        existing.latestAt = Math.max(existing.latestAt, createdAt);
        if (!existing.ownerName && item.ownerName) {
          existing.ownerName = item.ownerName;
        }
        if (!existing.ownerPhoto && item.ownerPhoto) {
          existing.ownerPhoto = item.ownerPhoto;
        }
      }
    });

    const grouped = Array.from(map.values()).map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => {
        const aTime = a.createdAt?.getTime?.() ?? 0;
        const bTime = b.createdAt?.getTime?.() ?? 0;
        return aTime - bTime;
      }),
    }));

    grouped.sort((a, b) => b.latestAt - a.latestAt);

    const ownGroup = grouped.find((group) => group.ownerId === userId) ?? null;
    const realFriendGroups = grouped.filter(
      (group) => group.ownerId !== userId && !isSeededOwner(group.ownerId),
    );
    const seededGroups = grouped.filter((group) => isSeededOwner(group.ownerId));
    const otherGroups = [...realFriendGroups, ...seededGroups];
    const maxOtherGroups = ownGroup ? Math.max(0, MAX_STORY_GROUPS - 1) : MAX_STORY_GROUPS;
    const limitedGroups = ownGroup
      ? [
          {
            ...ownGroup,
            ownerName: userDisplayName || ownGroup.ownerName,
            ownerPhoto: userPhotoURL || ownGroup.ownerPhoto,
          },
          ...otherGroups.slice(0, maxOtherGroups),
        ]
      : otherGroups.slice(0, maxOtherGroups);

    if (limitedGroups.length > MAX_STORY_GROUPS) {
      return limitedGroups.slice(0, MAX_STORY_GROUPS);
    }

    return limitedGroups;
  }, [items, userDisplayName, userId, userPhotoURL]);

  const ownGroup = useMemo(
    () => groups.find((group) => group.ownerId === userId) ?? null,
    [groups, userId],
  );

  const friendGroups = useMemo(
    () => groups.filter((group) => group.ownerId !== userId),
    [groups, userId],
  );

  return {
    error,
    friendGroups,
    groups,
    loading,
    ownGroup,
    refreshStories,
  };
};
