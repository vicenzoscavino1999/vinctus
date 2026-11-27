import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import { formatRelativeTime } from '@/shared/lib/formatUtils';
import { useToast } from '@/shared/ui/Toast';
import PostCommentsModal from '@/features/posts/components/PostCommentsModal';
import FeedPostCard from '@/features/posts/components/FeedPostCard';
import StoriesWidget from '@/features/posts/components/StoriesWidget';
import { useFeed } from '@/features/posts/hooks/useFeed';
import { toPostSummary } from '@/features/posts/model/postSummary';
import { getPost, type PostRead } from '@/features/posts/api';

const logPostError = (message: string, error: unknown) => {
  if (import.meta.env.DEV) {
    console.error(message, error);
  }
};

/** Same shape as FeedPostCard, so the page doesn't jump when posts arrive. */
function FeedSkeleton() {
  return (
    <div role="status" aria-label="Cargando publicaciones" className="space-y-3 md:space-y-6">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          aria-hidden="true"
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
    </div>
  );
}

/**
 * Infinite scroll: asks for the next page when the bottom gets close, with a button where the
 * browser cannot tell.
 */
function useLoadMoreTrigger(enabled: boolean, loadMore: () => void) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const supported = typeof window !== 'undefined' && 'IntersectionObserver' in window;
  useEffect(() => {
    if (!supported || !enabled || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { root: null, rootMargin: '240px 0px', threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, loadMore, node, supported]);
  return { setTarget: setNode, supported };
}

const FeedSession = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const feed = useFeed(user?.uid ?? null);
  const [opened, setOpened] = useState<PostRead | null>(null);
  const postFromSearch = new URLSearchParams(location.search).get('post');
  const { loadMore } = feed;
  const { setTarget, supported } = useLoadMoreTrigger(
    feed.status === 'ready' && feed.hasMore,
    () => {
      void loadMore();
    },
  );

  useEffect(() => {
    if (feed.moreError) showToast('No se pudo cargar mas publicaciones.', 'warning');
  }, [feed.moreError, showToast]);

  // `/feed?post=<id>` opens that post's comments, from the feed or by its id.
  useEffect(() => {
    if (!postFromSearch || opened?.postId === postFromSearch || feed.status !== 'ready') return;
    const existing = feed.posts.find((post) => post.postId === postFromSearch);
    if (existing) {
      setOpened(existing);
      return;
    }
    let active = true;
    void getPost(postFromSearch)
      .then((post) => {
        if (active && post && (!post.status || post.status === 'ready')) setOpened(post);
      })
      .catch((error) => logPostError('Error loading post by id:', error));
    return () => {
      active = false;
    };
  }, [postFromSearch, opened?.postId, feed.status, feed.posts]);

  const openedSummary = useMemo(
    () =>
      opened
        ? toPostSummary(opened, {
            likeCount: feed.likeCountOf(opened),
            commentCount: feed.commentCountOf(opened),
          })
        : null,
    [opened, feed],
  );

  const handleCopyLink = async (postId: string) => {
    const url = `${window.location.origin}/post/${postId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Enlace copiado', 'success');
    } catch (error) {
      logPostError('Error copying link:', error);
      showToast('No se pudo copiar el enlace', 'error');
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto mb-6 max-w-[540px] md:mb-8">
        <StoriesWidget />
      </div>

      <div className="mx-auto max-w-[540px]">
        {feed.status === 'loading' ? (
          <FeedSkeleton />
        ) : feed.status === 'error' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] px-4 py-3.5">
            <p className="text-sm text-neutral-400">No se pudo cargar el feed.</p>
            <button
              type="button"
              onClick={feed.retry}
              className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-white/30 hover:text-white"
            >
              Reintentar
            </button>
          </div>
        ) : feed.posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/[0.08] px-4 py-8 text-center text-sm text-neutral-500">
            Aún no hay publicaciones.
          </p>
        ) : (
          <div className="space-y-3 md:space-y-6">
            {feed.posts.map((post) => {
              const summary = toPostSummary(post, {
                likeCount: feed.likeCountOf(post),
                commentCount: feed.commentCountOf(post),
              });
              return (
                <FeedPostCard
                  key={post.postId}
                  summary={summary}
                  initialLikeCount={Math.max(0, post.likeCount || 0)}
                  timeLabel={formatRelativeTime(post.createdAt)}
                  onOpen={() => setOpened(post)}
                  onCopyLink={() => void handleCopyLink(post.postId)}
                  onLikeCount={feed.setLikeCount}
                />
              );
            })}
          </div>
        )}

        {feed.status === 'ready' && feed.hasMore && (
          <div className="mt-6">
            <div ref={setTarget} className="h-1 w-full" />
            {supported ? (
              <p className="py-4 text-center text-xs text-neutral-500">
                {feed.loadingMore ? 'Cargando más publicaciones…' : 'Desliza para seguir viendo'}
              </p>
            ) : (
              <div className="flex justify-center">
                <button
                  className="rounded-full border border-white/15 px-6 py-2.5 text-sm text-neutral-300 transition-colors hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void loadMore()}
                  disabled={feed.loadingMore}
                >
                  {feed.loadingMore ? 'Cargando...' : 'Cargar mas'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <PostCommentsModal
        isOpen={!!openedSummary}
        post={openedSummary}
        onClose={() => setOpened(null)}
        onCommentAdded={() => {
          if (opened) feed.addComment(opened);
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
