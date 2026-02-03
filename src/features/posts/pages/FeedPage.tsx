import { useEffect, useState } from 'react';
import { Bookmark, Heart, Link2, MessageCircle, Film, FileText } from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/shared/ui/Toast';
import PostCommentsModal from '@/features/posts/components/PostCommentsModal';
import StoriesWidget from '@/features/posts/components/StoriesWidget';
import {
  getPostCommentCount,
  getPostLikeCount,
  isPostLiked,
  isPostSaved,
  getBlockedUsers,
  likePostWithSync,
  savePostWithSync,
  unlikePostWithSync,
  unsavePostWithSync,
} from '@/features/posts/api';

// Post type with BOTH schemas (new + legacy) for compatibility
type Post = {
  postId: string;
  authorId?: string;

  // New schema
  authorSnapshot?: { displayName: string; photoURL: string | null };
  title?: string | null;
  text?: string;
  status?: 'ready' | 'uploading' | 'failed';

  // Legacy schema
  content?: string;
  authorName?: string;
  authorUsername?: string;
  authorPhoto?: string | null;

  // Common
  likeCount?: number;
  commentCount?: number;
  likesCount?: number;
  commentsCount?: number;
  media?: {
    type: 'image' | 'video' | 'file';
    url: string;
    path: string;
    fileName?: string;
    contentType?: string;
    size?: number;
  }[];
  createdAt?: any;
};

type PostSummary = {
  postId: string;
  authorName: string;
  authorPhoto: string | null;
  title?: string | null;
  text: string;
  imageUrl: string | null;
  media: Post['media'];
  createdAt?: any;
};

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return null;
};

const formatRelativeTime = (value: any): string => {
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

const buildPostSummary = (post: Post): PostSummary => {
  const displayText = post.text ?? post.content ?? '';
  const authorName = post.authorSnapshot?.displayName ?? post.authorName ?? 'Usuario';
  const authorPhoto = post.authorSnapshot?.photoURL ?? post.authorPhoto ?? null;
  const imageUrl = post.media?.find((item) => item.type === 'image')?.url ?? null;

  return {
    postId: post.postId,
    authorName,
    authorPhoto,
    title: post.title ?? null,
    text: displayText,
    imageUrl,
    media: post.media ?? [],
    createdAt: post.createdAt,
  };
};

const readPostCounter = (post: Post, primary: 'likeCount' | 'commentCount'): number | null => {
  const secondary = primary === 'likeCount' ? 'likesCount' : 'commentsCount';
  const first = post[primary];
  if (typeof first === 'number' && Number.isFinite(first) && first >= 0) {
    return first;
  }
  const fallback = post[secondary];
  if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback >= 0) {
    return fallback;
  }
  return null;
};

const FeedPage = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [likedByUser, setLikedByUser] = useState<Record<string, boolean>>({});
  const [savedByUser, setSavedByUser] = useState<Record<string, boolean>>({});
  const [activePost, setActivePost] = useState<PostSummary | null>(null);
  const postFromSearch = new URLSearchParams(location.search).get('post');
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());

  // Initial load with getDocs (NO realtime to avoid pagination conflicts)
  useEffect(() => {
    const loadInitial = async () => {
      try {
        const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(20));

        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({ ...(d.data() as any), postId: d.id })) as Post[];
        const visible = list.filter((p) => !p.status || p.status === 'ready');
        setPosts(visible);
        setLastVisible(snap.docs[snap.docs.length - 1] ?? null);
      } catch (error) {
        console.error('Error loading posts:', error);
      } finally {
        setLoadingInitial(false);
      }
    };

    loadInitial();
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
      setActivePost(buildPostSummary(existing));
      return;
    }

    const loadById = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'posts', postFromSearch));
        if (!docSnap.exists()) return;
        const data = docSnap.data() as any;
        const post = { ...data, postId: docSnap.id } as Post;
        if (post.status && post.status !== 'ready') return;
        setActivePost(buildPostSummary(post));
      } catch (error) {
        console.error('Error loading post by id:', error);
      }
    };

    loadById();
  }, [postFromSearch, posts, activePost?.postId]);

  // Load more posts (pagination)
  const loadMore = async () => {
    if (!lastVisible || loadingMore) return;
    setLoadingMore(true);

    try {
      const q2 = query(
        collection(db, 'posts'),
        orderBy('createdAt', 'desc'),
        startAfter(lastVisible),
        limit(20),
      );

      const snap = await getDocs(q2);
      const more = snap.docs.map((d) => ({ ...(d.data() as any), postId: d.id })) as Post[];
      const moreVisible = more.filter((p) => !p.status || p.status === 'ready');

      // Merge without duplicates using Map
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.postId));
        const merged = [...prev];
        for (const p of moreVisible) {
          if (!seen.has(p.postId)) merged.push(p);
        }
        return merged;
      });

      setLastVisible(snap.docs[snap.docs.length - 1] ?? lastVisible);
    } catch (error) {
      console.error('Error loading more posts:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (posts.length === 0) return;
    let isActive = true;

    const embeddedLikeUpdates: Record<string, number> = {};
    const embeddedCommentUpdates: Record<string, number> = {};
    posts.forEach((post) => {
      if (likeCounts[post.postId] === undefined) {
        const embeddedLikeCount = readPostCounter(post, 'likeCount');
        if (embeddedLikeCount !== null) {
          embeddedLikeUpdates[post.postId] = embeddedLikeCount;
        }
      }
      if (commentCounts[post.postId] === undefined) {
        const embeddedCommentCount = readPostCounter(post, 'commentCount');
        if (embeddedCommentCount !== null) {
          embeddedCommentUpdates[post.postId] = embeddedCommentCount;
        }
      }
    });

    if (Object.keys(embeddedLikeUpdates).length > 0) {
      setLikeCounts((prev) => ({ ...prev, ...embeddedLikeUpdates }));
    }
    if (Object.keys(embeddedCommentUpdates).length > 0) {
      setCommentCounts((prev) => ({ ...prev, ...embeddedCommentUpdates }));
    }

    const pendingCounts = posts.filter(
      (post) =>
        (likeCounts[post.postId] === undefined && readPostCounter(post, 'likeCount') === null) ||
        (commentCounts[post.postId] === undefined &&
          readPostCounter(post, 'commentCount') === null),
    );
    const pendingLikes = user ? posts.filter((post) => likedByUser[post.postId] === undefined) : [];
    const pendingSaves = user ? posts.filter((post) => savedByUser[post.postId] === undefined) : [];

    if (pendingCounts.length === 0 && pendingLikes.length === 0 && pendingSaves.length === 0) {
      return;
    }

    const loadMetrics = async () => {
      try {
        const likeUpdates: Record<string, number> = {};
        const commentUpdates: Record<string, number> = {};
        await Promise.all(
          pendingCounts.map(async (post) => {
            const [likesCount, commentsCount] = await Promise.all([
              getPostLikeCount(post.postId),
              getPostCommentCount(post.postId),
            ]);
            likeUpdates[post.postId] = likesCount;
            commentUpdates[post.postId] = commentsCount;
          }),
        );

        const likedUpdates: Record<string, boolean> = {};
        const savedUpdates: Record<string, boolean> = {};

        if (user) {
          await Promise.all(
            pendingLikes.map(async (post) => {
              likedUpdates[post.postId] = await isPostLiked(post.postId, user.uid);
            }),
          );

          await Promise.all(
            pendingSaves.map(async (post) => {
              savedUpdates[post.postId] = await isPostSaved(post.postId, user.uid);
            }),
          );
        }

        if (!isActive) return;
        if (Object.keys(likeUpdates).length > 0) {
          setLikeCounts((prev) => ({ ...prev, ...likeUpdates }));
        }
        if (Object.keys(commentUpdates).length > 0) {
          setCommentCounts((prev) => ({ ...prev, ...commentUpdates }));
        }
        if (Object.keys(likedUpdates).length > 0) {
          setLikedByUser((prev) => ({ ...prev, ...likedUpdates }));
        }
        if (Object.keys(savedUpdates).length > 0) {
          setSavedByUser((prev) => ({ ...prev, ...savedUpdates }));
        }
      } catch (error) {
        console.error('Error loading post metrics:', error);
      }
    };

    loadMetrics();

    return () => {
      isActive = false;
    };
  }, [posts, user, likeCounts, commentCounts, likedByUser, savedByUser]);

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
              const summary = buildPostSummary(p);
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
              const likeCount = likeCounts[p.postId] ?? 0;
              const commentCount = commentCounts[p.postId] ?? 0;
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
      {lastVisible && (
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
        onClose={() => setActivePost(null)}
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
