import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getBlockedUsers,
  getGlobalFeed,
  type PostCursor,
  type PostRead,
} from '@/features/posts/api';
import { FEED_CACHE_INVALIDATED_EVENT } from '@/features/posts/model/feedCache';
import { useSessionResource } from '@/shared/hooks/useSessionResource';

export const FEED_PAGE_SIZE = 12;
const FIRST_PAGE_MAX_AGE_MS = 60_000;

const isReadyPost = (post: PostRead): boolean => !post.status || post.status === 'ready';

type ExtraPages = { from: unknown; posts: PostRead[]; cursor: PostCursor; hasMore: boolean };

/**
 * The global feed for one reader. The first page stays in memory for the session, so coming back
 * to the feed is instant, and it is asked again in the background each time the feed opens or a
 * post is published. Later pages are added as the reader scrolls. Nothing shows until the
 * reader's blocked list is known, so a blocked person's post never flashes.
 */
export function useFeed(uid: string | null) {
  const first = useSessionResource(
    `feed:${uid ?? 'anonymous'}`,
    () => getGlobalFeed(FEED_PAGE_SIZE),
    FIRST_PAGE_MAX_AGE_MS,
  );
  // A failure only means nobody is hidden.
  const blocked = useSessionResource(uid ? `blocked:${uid}` : null, () =>
    uid ? getBlockedUsers(uid).catch(() => [] as string[]) : Promise.resolve([] as string[]),
  );
  const [extra, setExtra] = useState<ExtraPages | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<unknown>(null);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const loadingMoreRef = useRef(false);

  const reloadFirst = first.reload;
  // Shown from memory at once, and checked again for new posts.
  useEffect(() => {
    reloadFirst();
  }, [reloadFirst]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener(FEED_CACHE_INVALIDATED_EVENT, reloadFirst);
    return () => window.removeEventListener(FEED_CACHE_INVALIDATED_EVENT, reloadFirst);
  }, [reloadFirst]);

  const firstPage = first.data;
  // Pages loaded after an older first page no longer follow it.
  const pages = extra && extra.from === firstPage ? extra : null;
  const cursor = pages ? pages.cursor : (firstPage?.lastDoc ?? null);
  const hasMore = pages ? pages.hasMore : (firstPage?.hasMore ?? false);

  const blockedSet = useMemo(() => new Set(blocked.data ?? []), [blocked.data]);
  const blockedReady = !uid || blocked.data !== undefined;

  const posts = useMemo(() => {
    if (!firstPage || !blockedReady) return [];
    const seen = new Set<string>();
    return [...firstPage.items, ...(pages?.posts ?? [])].filter((post) => {
      if (!isReadyPost(post) || seen.has(post.postId)) return false;
      seen.add(post.postId);
      return !post.authorId || !blockedSet.has(post.authorId);
    });
  }, [firstPage, pages, blockedReady, blockedSet]);

  const status: 'loading' | 'error' | 'ready' =
    firstPage && blockedReady ? 'ready' : first.error && !firstPage ? 'error' : 'loading';

  const loadMore = useCallback(async () => {
    if (!firstPage || !cursor || !hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const result = await getGlobalFeed(FEED_PAGE_SIZE, cursor ?? undefined);
      setExtra((previous) => {
        const base = previous && previous.from === firstPage ? previous.posts : [];
        return {
          from: firstPage,
          posts: [...base, ...result.items],
          cursor: result.hasMore ? result.lastDoc : null,
          hasMore: result.hasMore,
        };
      });
    } catch (error) {
      setMoreError(error);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [firstPage, cursor, hasMore]);

  const likeCountOf = useCallback(
    (post: PostRead) => likeCounts[post.postId] ?? Math.max(0, post.likeCount || 0),
    [likeCounts],
  );
  const commentCountOf = useCallback(
    (post: PostRead) => commentCounts[post.postId] ?? Math.max(0, post.commentCount || 0),
    [commentCounts],
  );
  const setLikeCount = useCallback((postId: string, count: number) => {
    setLikeCounts((previous) =>
      previous[postId] === count ? previous : { ...previous, [postId]: count },
    );
  }, []);
  const addComment = useCallback((post: PostRead) => {
    setCommentCounts((previous) => ({
      ...previous,
      [post.postId]: (previous[post.postId] ?? Math.max(0, post.commentCount || 0)) + 1,
    }));
  }, []);

  return {
    status,
    error: first.error,
    retry: reloadFirst,
    posts,
    hasMore: hasMore && !!cursor,
    loadingMore,
    moreError,
    loadMore,
    likeCountOf,
    commentCountOf,
    setLikeCount,
    addComment,
  };
}
