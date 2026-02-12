import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, Heart, Link2, MessageCircle, Film, FileText } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import { useAppState } from '@/context/app-state';
import { formatRelativeTime } from '@/shared/lib/formatUtils';
import { triggerSelectionHaptic } from '@/shared/lib/native';
import { useToast } from '@/shared/ui/Toast';
import PostCommentsModal from '@/features/posts/components/PostCommentsModal';
import StoriesWidget from '@/features/posts/components/StoriesWidget';
import { FEED_CACHE_INVALIDATED_EVENT } from '@/features/posts/model/feedCache';
import { type PostSummary, toPostSummary } from '@/features/posts/model/postSummary';
import {
  getBlockedUsers,
  getGlobalFeed,
  getPost,
  likePostWithSync,
  savePostWithSync,
  unlikePostWithSync,
  unsavePostWithSync,
  type PostCursor,
  type PostRead,
} from '@/features/posts/api';

const FEED_PAGE_SIZE = 12;
const FEED_INITIAL_CACHE_TTL_MS = 30_000;
const FEED_BLOCK_SIZE = 6;

type FeedInitialCacheEntry = {
  posts: PostRead[];
  cursor: PostCursor;
  hasMore: boolean;
  fetchedAt: number;
};

let feedInitialCache: FeedInitialCacheEntry | null = null;
let feedInitialPromise: Promise<FeedInitialCacheEntry> | null = null;

const logPostError = (message: string, error: unknown) => {
  if (import.meta.env.DEV) {
    console.error(message, error);
  }
};

const isReadyPost = (post: PostRead): boolean => !post.status || post.status === 'ready';

const FeedPage = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { likedPosts, savedPosts } = useAppState();
  const { showToast } = useToast();
  const [posts, setPosts] = useState<PostRead[]>([]);
  const [cursor, setCursor] = useState<PostCursor>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [likedByUser, setLikedByUser] = useState<Record<string, boolean>>({});
  const [savedByUser, setSavedByUser] = useState<Record<string, boolean>>({});
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
      feedInitialCache = null;
      feedInitialPromise = null;
      setCacheRevision((prev) => prev + 1);
    };

    window.addEventListener(FEED_CACHE_INVALIDATED_EVENT, handleCacheInvalidated);
    return () => {
      window.removeEventListener(FEED_CACHE_INVALIDATED_EVENT, handleCacheInvalidated);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadInitial = async () => {
      try {
        const now = Date.now();
        if (feedInitialCache && now - feedInitialCache.fetchedAt <= FEED_INITIAL_CACHE_TTL_MS) {
          if (!cancelled) {
            setPosts(feedInitialCache.posts);
            setCursor(feedInitialCache.cursor);
            setHasMore(feedInitialCache.hasMore);
          }
          return;
        }

        if (!feedInitialPromise) {
          feedInitialPromise = (async () => {
            const result = await getGlobalFeed(FEED_PAGE_SIZE);
            const visible = result.items.filter(isReadyPost);
            const entry: FeedInitialCacheEntry = {
              posts: visible,
              cursor: result.hasMore ? result.lastDoc : null,
              hasMore: result.hasMore,
              fetchedAt: Date.now(),
            };
            feedInitialCache = entry;
            return entry;
          })()
            .catch((error) => {
              feedInitialCache = null;
              throw error;
            })
            .finally(() => {
              feedInitialPromise = null;
            });
        }

        const entry = await feedInitialPromise;
        if (!cancelled) {
          setPosts(entry.posts);
          setCursor(entry.cursor);
          setHasMore(entry.hasMore);
        }
      } catch (error) {
        logPostError('Error loading posts:', error);
        if (!cancelled) {
          showToast('No se pudo cargar el feed.', 'warning');
        }
      } finally {
        if (!cancelled) {
          setLoadingInitial(false);
        }
      }
    };

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [cacheRevision, showToast]);

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
    if (!user) {
      setLikedByUser({});
      setSavedByUser({});
      return;
    }

    const likedSet = new Set(likedPosts);
    const savedSet = new Set(savedPosts);

    setLikedByUser((prev) => {
      const next: Record<string, boolean> = {};
      let changed = Object.keys(prev).length !== posts.length;
      posts.forEach((post) => {
        const value = likedSet.has(post.postId);
        next[post.postId] = value;
        if (prev[post.postId] !== value) {
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setSavedByUser((prev) => {
      const next: Record<string, boolean> = {};
      let changed = Object.keys(prev).length !== posts.length;
      posts.forEach((post) => {
        const value = savedSet.has(post.postId);
        next[post.postId] = value;
        if (prev[post.postId] !== value) {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [likedPosts, posts, savedPosts, user]);

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

  const handleToggleLike = async (postId: string) => {
    if (!user) {
      showToast('Inicia sesion para dar like', 'info');
      return;
    }

    void triggerSelectionHaptic();

    const currentlyLiked = likedByUser[postId] ?? false;
    const delta = currentlyLiked ? -1 : 1;

    setLikedByUser((prev) => ({ ...prev, [postId]: !currentlyLiked }));
    setLikeCounts((prev) => ({
      ...prev,
      [postId]: Math.max(0, (prev[postId] ?? 0) + delta),
    }));

    try {
      if (currentlyLiked) {
        await unlikePostWithSync(postId, user.uid);
      } else {
        await likePostWithSync(postId, user.uid);
      }
    } catch (error) {
      setLikedByUser((prev) => ({ ...prev, [postId]: currentlyLiked }));
      setLikeCounts((prev) => ({
        ...prev,
        [postId]: Math.max(0, (prev[postId] ?? 0) - delta),
      }));
      logPostError('Error toggling like:', error);
      showToast('No se pudo actualizar el like', 'error');
    }
  };

  const handleToggleSave = async (postId: string) => {
    if (!user) {
      showToast('Inicia sesion para guardar posts', 'info');
      return;
    }

    const currentlySaved = savedByUser[postId] ?? false;
    setSavedByUser((prev) => ({ ...prev, [postId]: !currentlySaved }));

    try {
      if (currentlySaved) {
        await unsavePostWithSync(postId, user.uid);
      } else {
        await savePostWithSync(postId, user.uid);
      }
    } catch (error) {
      setSavedByUser((prev) => ({ ...prev, [postId]: currentlySaved }));
      logPostError('Error toggling save:', error);
      showToast('No se pudo actualizar el guardado', 'error');
    }
  };

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

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-3xl mx-auto mb-8">
        <StoriesWidget />
      </div>
      {loadingInitial ? (
        <div className="max-w-3xl mx-auto space-y-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`feed-skeleton-${index}`}
              className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 min-h-[220px] animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-neutral-800" />
                  <div>
                    <div className="h-3 w-28 bg-neutral-800 rounded mb-2" />
                    <div className="h-2 w-16 bg-neutral-800 rounded" />
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-neutral-800" />
              </div>
              <div className="mt-8 space-y-3">
                <div className="h-6 w-11/12 bg-neutral-800 rounded" />
                <div className="h-6 w-8/12 bg-neutral-800 rounded" />
                <div className="h-3 w-10/12 bg-neutral-800 rounded mt-4" />
              </div>
            </div>
          ))}
          <div className="text-xs text-neutral-500 text-center py-2">Cargando publicaciones...</div>
        </div>
      ) : posts.length === 0 ? (
        <div className="text-sm text-neutral-500 text-center py-8">No hay posts todavia.</div>
      ) : (
        <div className="space-y-6 max-w-3xl mx-auto">
          {posts
            .filter((post) => !post.authorId || !blockedUsers.has(post.authorId))
            .map((post, index) => {
              const likeCount = likeCounts[post.postId] ?? Math.max(0, post.likeCount || 0);
              const commentCount =
                commentCounts[post.postId] ?? Math.max(0, post.commentCount || 0);
              const summary = toPostSummary(post, {
                likeCount,
                commentCount,
              });
              const displayText = summary.text;
              const titleText = summary.title?.trim() || '';
              const bodyText = displayText.trim();
              const headline = titleText || bodyText || 'Publicacion de la comunidad';
              const showBody = !!titleText && !!bodyText;
              const authorName = summary.authorName;
              const authorPhoto = summary.authorPhoto;
              const authorInitial = authorName.charAt(0).toUpperCase();
              const imageUrl = summary.imageUrl;
              const timeLabel = formatRelativeTime(post.createdAt);
              const isLiked = likedByUser[post.postId] ?? false;
              const isSaved = savedByUser[post.postId] ?? false;
              const hasVideo = (summary.media ?? []).some((item) => item.type === 'video');
              const fileCount = (summary.media ?? []).filter((item) => item.type === 'file').length;
              const blockNumber = Math.floor(index / FEED_BLOCK_SIZE) + 1;
              const isBlockStart = index % FEED_BLOCK_SIZE === 0;

              return (
                <div key={post.postId} className="space-y-4">
                  {isBlockStart && (
                    <div className="flex items-center gap-4 pt-2">
                      <p className="text-[11px] tracking-[0.28em] uppercase text-neutral-500">
                        Comunidad activa · Bloque {blockNumber}
                      </p>
                      <div className="h-px flex-1 bg-neutral-800" />
                    </div>
                  )}
                  <div
                    onClick={() => setActivePost(summary)}
                    className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50 cursor-pointer"
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={headline}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-800 to-black" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />

                    <div className="relative z-10 p-6 pr-16 min-h-[220px] flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {authorPhoto ? (
                            <img
                              src={authorPhoto}
                              alt={authorName}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-medium">
                              {authorInitial}
                            </div>
                          )}
                          <div>
                            <p className="text-white text-sm font-medium">{authorName}</p>
                            <p className="text-xs text-neutral-300">Comunidad - {timeLabel}</p>
                          </div>
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleCopyLink(post.postId);
                          }}
                          className="p-2 rounded-full bg-black/40 text-neutral-200 hover:text-white hover:bg-black/60 transition-colors"
                          aria-label="Copiar enlace"
                        >
                          <Link2 size={18} />
                        </button>
                      </div>

                      <div className="mt-6">
                        <h3 className="text-xl md:text-2xl font-serif text-white leading-snug line-clamp-2">
                          {headline}
                        </h3>
                        {showBody && (
                          <p className="mt-2 text-sm text-neutral-300 leading-relaxed line-clamp-2">
                            {bodyText}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-6 text-xs text-neutral-300">
                        <div className="flex items-center gap-3">
                          <span>Desliza para ver mas -&gt;</span>
                          {hasVideo && (
                            <span className="flex items-center gap-1">
                              <Film size={12} />
                              Video
                            </span>
                          )}
                          {fileCount > 0 && (
                            <span className="flex items-center gap-1">
                              <FileText size={12} />
                              {fileCount} archivo{fileCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setActivePost(summary);
                          }}
                          className="flex items-center gap-2 text-neutral-200 hover:text-white transition-colors"
                        >
                          <MessageCircle size={14} />
                          Comentar
                        </button>
                      </div>
                    </div>

                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-10">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleToggleLike(post.postId);
                        }}
                        className="flex flex-col items-center gap-1 text-neutral-200/80 hover:text-white transition-colors"
                        aria-label="Dar like"
                      >
                        <Heart size={20} fill={isLiked ? 'currentColor' : 'none'} />
                        <span className="text-xs">{likeCount}</span>
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setActivePost(summary);
                        }}
                        className="flex flex-col items-center gap-1 text-neutral-200/80 hover:text-white transition-colors"
                        aria-label="Comentarios"
                      >
                        <MessageCircle size={20} />
                        <span className="text-xs">{commentCount}</span>
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleToggleSave(post.postId);
                        }}
                        className={`flex flex-col items-center gap-1 transition-colors ${isSaved ? 'text-amber-300' : 'text-neutral-200/80 hover:text-white'}`}
                        aria-label="Guardar"
                      >
                        <Bookmark size={20} fill={isSaved ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {hasMore && cursor && (
        <div className="mt-6 max-w-3xl mx-auto">
          <div ref={loadMoreTriggerRef} className="h-1 w-full" />
          {supportsIntersectionObserver ? (
            <div className="py-4 text-center text-xs text-neutral-500">
              {loadingMore ? 'Cargando mas publicaciones...' : 'Desliza para seguir viendo'}
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
        isOpen={!!activePost}
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

export default FeedPage;
