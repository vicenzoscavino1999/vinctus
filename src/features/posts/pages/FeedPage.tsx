import { useEffect, useState } from 'react';
import { Bookmark, Heart, Link2, MessageCircle, Film, FileText } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context';
import { useToast } from '@/shared/ui/Toast';
import PostCommentsModal from '@/features/posts/components/PostCommentsModal';
import StoriesWidget from '@/features/posts/components/StoriesWidget';
import {
  getBlockedUsers,
  getFeedPostById,
  getFeedPostsPage,
  likePostWithSync,
  savePostWithSync,
  unlikePostWithSync,
  unsavePostWithSync,
  type FeedPost,
  type PaginatedResult,
} from '@/features/posts/api';

type PostSummary = {
  postId: string;
  authorName: string;
  authorPhoto: string | null;
  title: string | null;
  text: string;
  imageUrl: string | null;
  media: FeedPost['media'];
  createdAt: unknown;
  likeCount: number;
  commentCount: number;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
};

const formatRelativeTime = (value: unknown): string => {
  const date = toDate(value);
  if (!date) return 'Ahora';
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Ahora';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} d`;
};

const buildPostSummary = (post: FeedPost): PostSummary => {
  const imageUrl = post.media.find((item) => item.type === 'image')?.url ?? null;

  return {
    postId: post.postId,
    authorName: post.authorName,
    authorPhoto: post.authorPhoto,
    title: post.title,
    text: post.text,
    imageUrl,
    media: post.media,
    createdAt: post.createdAt,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
  };
};

const FeedPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { likedPosts, savedPosts } = useAppState();
  const { showToast } = useToast();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [lastVisible, setLastVisible] = useState<PaginatedResult<FeedPost>['lastDoc']>(null);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [likedByUser, setLikedByUser] = useState<Record<string, boolean>>({});
  const [savedByUser, setSavedByUser] = useState<Record<string, boolean>>({});
  const [activePost, setActivePost] = useState<PostSummary | null>(null);
  const postFromSearch = new URLSearchParams(location.search).get('post');
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());

  // Initial load (NO realtime to avoid pagination conflicts)
  useEffect(() => {
    const loadInitial = async () => {
      try {
        const page = await getFeedPostsPage(20);
        setPosts(page.items);
        setLastVisible(page.lastDoc);
        setHasMorePosts(page.hasMore);
      } catch (error) {
        console.error('Error loading posts:', error);
      } finally {
        setLoadingInitial(false);
      }
    };

    void loadInitial();
  }, []);

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
        console.error('Error loading blocked users:', err);
      }
    };
    void loadBlocked();
  }, [user?.uid]);

  useEffect(() => {
    if (!postFromSearch || activePost?.postId === postFromSearch) return;
    const existing = posts.find((post) => post.postId === postFromSearch);
    if (existing) {
      setActivePost({
        ...buildPostSummary(existing),
        likeCount: likeCounts[existing.postId] ?? existing.likeCount,
        commentCount: commentCounts[existing.postId] ?? existing.commentCount,
      });
      return;
    }

    const loadById = async () => {
      try {
        const post = await getFeedPostById(postFromSearch);
        if (!post) return;
        setActivePost({
          ...buildPostSummary(post),
          likeCount: likeCounts[post.postId] ?? post.likeCount,
          commentCount: commentCounts[post.postId] ?? post.commentCount,
        });
      } catch (error) {
        console.error('Error loading post by id:', error);
      }
    };

    void loadById();
  }, [postFromSearch, posts, activePost?.postId, commentCounts, likeCounts]);

  // Load more posts (pagination)
  const loadMore = async () => {
    if (!hasMorePosts || !lastVisible || loadingMore) return;
    setLoadingMore(true);

    try {
      const page = await getFeedPostsPage(20, lastVisible);

      // Merge without duplicates using Map
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.postId));
        const merged = [...prev];
        for (const p of page.items) {
          if (!seen.has(p.postId)) merged.push(p);
        }
        return merged;
      });

      setLastVisible(page.lastDoc);
      setHasMorePosts(page.hasMore);
    } catch (error) {
      console.error('Error loading more posts:', error);
    } finally {
      setLoadingMore(false);
    }
  };

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
  }, [user, posts, likedPosts, savedPosts]);

  useEffect(() => {
    if (posts.length === 0) return;

    setLikeCounts((prev) => {
      const next = { ...prev };
      let changed = false;

      posts.forEach((post) => {
        if (next[post.postId] === undefined) {
          next[post.postId] = post.likeCount;
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
          next[post.postId] = post.commentCount;
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

    const currentlyLiked = likedByUser[postId];
    try {
      if (currentlyLiked) {
        await unlikePostWithSync(postId, user.uid);
      } else {
        await likePostWithSync(postId, user.uid);
      }
      setLikedByUser((prev) => ({ ...prev, [postId]: !currentlyLiked }));
      setLikeCounts((prev) => ({
        ...prev,
        [postId]: Math.max(0, (prev[postId] ?? 0) + (currentlyLiked ? -1 : 1)),
      }));
    } catch (error) {
      console.error('Error toggling like:', error);
      showToast('No se pudo actualizar el like', 'error');
    }
  };

  const handleToggleSave = async (postId: string) => {
    if (!user) {
      showToast('Inicia sesion para guardar posts', 'info');
      return;
    }

    const currentlySaved = savedByUser[postId];
    try {
      if (currentlySaved) {
        await unsavePostWithSync(postId, user.uid);
      } else {
        await savePostWithSync(postId, user.uid);
      }
      setSavedByUser((prev) => ({ ...prev, [postId]: !currentlySaved }));
    } catch (error) {
      console.error('Error toggling save:', error);
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
      console.error('Error copying link:', error);
      showToast('No se pudo copiar el enlace', 'error');
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-3xl mx-auto mb-8">
        <StoriesWidget />
      </div>
      {loadingInitial ? (
        <div className="text-sm text-neutral-500 text-center py-8">Cargando posts...</div>
      ) : posts.length === 0 ? (
        <div className="text-sm text-neutral-500 text-center py-8">No hay posts todavía.</div>
      ) : (
        <div className="space-y-6 max-w-3xl mx-auto">
          {posts
            .filter((post) => !post.authorId || !blockedUsers.has(post.authorId))
            .map((p) => {
              const likeCount = likeCounts[p.postId] ?? p.likeCount;
              const commentCount = commentCounts[p.postId] ?? p.commentCount;
              const summary = { ...buildPostSummary(p), likeCount, commentCount };
              const displayText = summary.text;
              const titleText = summary.title?.trim() || '';
              const bodyText = displayText.trim();
              const headline = titleText || bodyText || 'Publicacion de la comunidad';
              const showBody = !!titleText && !!bodyText;
              const authorName = summary.authorName;
              const authorPhoto = summary.authorPhoto;
              const authorInitial = authorName.charAt(0).toUpperCase();
              const imageUrl = summary.imageUrl;
              const timeLabel = formatRelativeTime(p.createdAt);
              const isLiked = likedByUser[p.postId] ?? false;
              const isSaved = savedByUser[p.postId] ?? false;
              const hasVideo = (summary.media ?? []).some((item) => item.type === 'video');
              const fileCount = (summary.media ?? []).filter((item) => item.type === 'file').length;

              return (
                <div
                  key={p.postId}
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
                          handleCopyLink(p.postId);
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
                        handleToggleLike(p.postId);
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
                        handleToggleSave(p.postId);
                      }}
                      className={`flex flex-col items-center gap-1 transition-colors ${isSaved ? 'text-amber-300' : 'text-neutral-200/80 hover:text-white'}`}
                      aria-label="Guardar"
                    >
                      <Bookmark size={20} fill={isSaved ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Load more button */}
      {hasMorePosts && lastVisible && (
        <div className="mt-6 flex justify-center">
          <button
            className="px-6 py-2.5 border border-neutral-700 rounded-lg text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Cargando...' : 'Cargar más'}
          </button>
        </div>
      )}

      <PostCommentsModal
        isOpen={!!activePost}
        post={activePost}
        onClose={() => {
          setActivePost(null);
          if (postFromSearch) {
            navigate('/feed', { replace: true });
          }
        }}
        onCommentAdded={(postId) => {
          setCommentCounts((prev) => ({
            ...prev,
            [postId]: (prev[postId] ?? 0) + 1,
          }));
        }}
      />
    </div>
  );
};

export default FeedPage;
