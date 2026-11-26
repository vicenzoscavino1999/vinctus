import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import { formatRelativeTime } from '@/shared/lib/formatUtils';
import { useToast } from '@/shared/ui/Toast';
import PostCommentsModal from '@/features/posts/components/PostCommentsModal';
import FeedPostCard from '@/features/posts/components/FeedPostCard';
import StoriesWidget from '@/features/posts/components/StoriesWidget';
import { FEED_CACHE_INVALIDATED_EVENT } from '@/features/posts/model/feedCache';
import { type PostSummary, toPostSummary } from '@/features/posts/model/postSummary';
import {
  getBlockedUsers,
  getGlobalFeed,
  getPost,
  type PostCursor,
  type PostRead,
} from '@/features/posts/api';

const FEED_PAGE_SIZE = 12;

const logPostError = (message: string, error: unknown) => {
  if (import.meta.env.DEV) {
    console.error(message, error);
  }
};

const isReadyPost = (post: PostRead): boolean => !post.status || post.status === 'ready';

const FeedSession = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [posts, setPosts] = useState<PostRead[]>([]);
  const [loadedReader, setLoadedReader] = useState<string | null | undefined>(undefined);
  const [cursor, setCursor] = useState<PostCursor>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [activePost, setActivePost] = useState<PostSummary | null>(null);
  const postFromSearch = new URLSearchParams(location.search).get('post');
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [cacheRevision, setCacheRevision] = useState(0);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  const supportsIntersectionObserver =
    typeof window !== 'undefined' && 'IntersectionObserver' in window;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleCacheInvalidated = () => {
      setCacheRevision((prev) => prev + 1);
    };

    window.addEventListener(FEED_CACHE_INVALIDATED_EVENT, handleCacheInvalidated);
    return () => {
      window.removeEventListener(FEED_CACHE_INVALIDATED_EVENT, handleCacheInvalidated);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadedReader(undefined);
    setPosts([]);
    setCursor(null);
    setHasMore(false);
    setLoadingInitial(true);
    setActivePost(null);
    const loadInitial = async () => {
      try {
        const result = await getGlobalFeed(FEED_PAGE_SIZE);
        if (cancelled) return;
        setPosts(result.items.filter(isReadyPost));
        setLoadedReader(user?.uid ?? null);
        setCursor(result.lastDoc);
        setHasMore(result.hasMore);
      } catch (error) {
        if (!cancelled) {
          setLoadedReader(user?.uid ?? null);
          logPostError('Error loading posts:', error);
          showToast('No se pudo cargar el feed.', 'warning');
        }
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    };
    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [cacheRevision, showToast, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setBlockedUsers(new Set());
      return;
    }
    const loadBlocked = async () => {
      try {
        const ids = await getBlockedUsers(user.uid);
        setBlockedUsers(new Set(ids));
      } catch (err) {
        logPostError('Error loading blocked users:', err);
      }
    };
    void loadBlocked();
  }, [user?.uid]);

  useEffect(() => {
    if (!postFromSearch || activePost?.postId === postFromSearch) return;
    const existing = posts.find((post) => post.postId === postFromSearch);
    if (existing) {
      const summary = toPostSummary(existing, {
        commentCount: commentCounts[existing.postId] ?? existing.commentCount,
        likeCount: likeCounts[existing.postId] ?? existing.likeCount,
      });
      setActivePost(summary);
      return;
    }

    const loadById = async () => {
      try {
        const post = await getPost(postFromSearch);
        if (!post) return;
        if (!isReadyPost(post)) return;
        setActivePost(toPostSummary(post));
      } catch (error) {
        logPostError('Error loading post by id:', error);
      }
    };

    void loadById();
  }, [activePost?.postId, commentCounts, likeCounts, postFromSearch, posts]);

  const loadMore = useCallback(async () => {
    if (!cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);

    try {
      const result = await getGlobalFeed(FEED_PAGE_SIZE, cursor ?? undefined);
      const moreVisible = result.items.filter(isReadyPost);

      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.postId));
        const merged = [...prev];
        for (const post of moreVisible) {
          if (!seen.has(post.postId)) {
            merged.push(post);
            seen.add(post.postId);
          }
        }
        return merged;
      });

      setCursor(result.hasMore ? result.lastDoc : null);
      setHasMore(result.hasMore);
    } catch (error) {
      logPostError('Error loading more posts:', error);
      showToast('No se pudo cargar mas publicaciones.', 'warning');
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, loadingMore, showToast]);

  useEffect(() => {
    if (!supportsIntersectionObserver) return;
    if (loadingInitial) return;
    if (!hasMore || !cursor) return;
    const target = loadMoreTriggerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (isVisible) {
          void loadMore();
        }
      },
      { root: null, rootMargin: '240px 0px', threshold: 0 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [cursor, hasMore, loadMore, loadingInitial, supportsIntersectionObserver]);

  useEffect(() => {
    if (posts.length === 0) return;

    setLikeCounts((prev) => {
      const next = { ...prev };
      let changed = false;
      posts.forEach((post) => {
        if (next[post.postId] === undefined) {
          next[post.postId] = Math.max(0, post.likeCount || 0);
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setCommentCounts((prev) => {
      const next = { ...prev };
      let changed = false;
      posts.forEach((post) => {
        if (next[post.postId] === undefined) {
          next[post.postId] = Math.max(0, post.commentCount || 0);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [posts]);

  const handleLikeCount = useCallback((postId: string, count: number) => {
    setLikeCounts((previous) =>
      previous[postId] === count ? previous : { ...previous, [postId]: count },
    );
  }, []);

  const handleCopyLink = async (postId: string) => {
    const url = `${window.location.origin}/feed?post=${postId}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showToast('Enlace copiado', 'success');
    } catch (error) {
      logPostError('Error copying link:', error);
      showToast('No se pudo copiar el enlace', 'error');
    }
  };

  if (loadedReader !== (user?.uid ?? null)) {
    return (
      <div role="status" className="p-8 text-neutral-400">
        Cargando publicaciones...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto mb-6 max-w-[540px] md:mb-8">
        <StoriesWidget />
      </div>
      {loadingInitial ? (
        <div className="mx-auto max-w-[540px] space-y-3 md:space-y-6">
          {Array.from({ length: 3 }).map((_, index) => (
            // Same shape as FeedPostCard, so the page doesn't jump when posts arrive.
            <div
              key={`feed-skeleton-${index}`}
              className="animate-pulse overflow-hidden border-b border-neutral-900 bg-neutral-950 max-md:-mx-4 md:rounded-2xl md:border"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="h-9 w-9 rounded-full bg-neutral-800" />
                <div className="space-y-2">
                  <div className="h-3 w-28 rounded bg-neutral-800" />
                  <div className="h-2 w-16 rounded bg-neutral-800" />
                </div>
              </div>
              <div className="aspect-square bg-neutral-900" />
              <div className="space-y-2 px-4 py-4">
                <div className="h-3 w-20 rounded bg-neutral-800" />
                <div className="h-3 w-10/12 rounded bg-neutral-800" />
              </div>
            </div>
          ))}
          <div className="text-xs text-neutral-500 text-center py-2">Cargando publicaciones...</div>
        </div>
      ) : posts.length === 0 ? (
        <div className="text-sm text-neutral-500 text-center py-8">Aún no hay publicaciones.</div>
      ) : (
        <div className="mx-auto max-w-[540px] space-y-3 md:space-y-6">
          {posts
            .filter((post) => !post.authorId || !blockedUsers.has(post.authorId))
            .map((post) => {
              const likeCount = likeCounts[post.postId] ?? Math.max(0, post.likeCount || 0);
              const commentCount =
                commentCounts[post.postId] ?? Math.max(0, post.commentCount || 0);
              const summary = toPostSummary(post, {
                likeCount,
                commentCount,
              });

              return (
                <FeedPostCard
                  key={post.postId}
                  summary={summary}
                  initialLikeCount={Math.max(0, post.likeCount || 0)}
                  timeLabel={formatRelativeTime(post.createdAt)}
                  onOpen={() => setActivePost(summary)}
                  onCopyLink={() => void handleCopyLink(post.postId)}
                  onLikeCount={handleLikeCount}
                />
              );
            })}
        </div>
      )}

      {hasMore && cursor && (
        <div className="mt-6 max-w-3xl mx-auto">
          <div ref={loadMoreTriggerRef} className="h-1 w-full" />
          {supportsIntersectionObserver ? (
            <div className="py-4 text-center text-xs text-neutral-500">
              {loadingMore ? 'Cargando más publicaciones…' : 'Desliza para seguir viendo'}
            </div>
          ) : (
            <div className="flex justify-center">
              <button
                className="px-6 py-2.5 border border-neutral-700 rounded-lg text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? 'Cargando...' : 'Cargar mas'}
              </button>
            </div>
          )}
        </div>
      )}

      <PostCommentsModal
        isOpen={loadedReader === (user?.uid ?? null) && !!activePost}
        post={activePost}
        onClose={() => setActivePost(null)}
        onCommentAdded={(postId) => {
          setCommentCounts((prev) => ({
            ...prev,
            [postId]: (prev[postId] ?? 0) + 1,
          }));
          setActivePost((prev) =>
            prev && prev.postId === postId
              ? {
                  ...prev,
                  commentCount: prev.commentCount + 1,
                }
              : prev,
          );
        }}
      />
    </div>
  );
};

const FeedPage = () => {
  const { user } = useAuth();
  return <FeedSession key={user?.uid ?? 'anonymous'} />;
};
export default FeedPage;
