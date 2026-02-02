import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Bookmark,
  ChevronLeft,
  FileText,
  Film,
  Heart,
  Loader2,
  MessageCircle,
  Share2,
  User,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/shared/ui/Toast';
import PostCommentsModal from '@/features/posts/components/PostCommentsModal';
import {
  getPost,
  getPostCommentCount,
  getPostLikeCount,
  isPostLiked,
  isPostSaved,
  likePostWithSync,
  savePostWithSync,
  type PostRead,
  unlikePostWithSync,
  unsavePostWithSync,
} from '@/shared/lib/firestore';

type PostMediaItem = {
  type: 'image' | 'video' | 'file';
  url: string;
  path: string;
  fileName?: string;
  contentType?: string;
  size?: number;
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

const getFileExtension = (name: string | undefined): string | null => {
  if (!name) return null;
  const clean = name.split('?')[0];
  const ext = clean.split('.').pop();
  if (!ext) return null;
  return ext.toUpperCase();
};

const PostDetailPage = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [post, setPost] = useState<PostRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (!postId) {
      setLoading(false);
      setError('Publicacion no encontrada');
      return () => {
        active = false;
      };
    }

    const loadPost = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getPost(postId);
        if (!active) return;
        if (!data) {
          setError('Publicacion no encontrada');
          setPost(null);
          return;
        }
        setPost(data);
      } catch (loadError) {
        if (!active) return;
        console.error('Error loading post:', loadError);
        setError('No se pudo cargar la publicacion.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadPost();

    return () => {
      active = false;
    };
  }, [postId]);

  useEffect(() => {
    let active = true;
    if (!postId || !post)
      return () => {
        active = false;
      };

    const loadMetrics = async () => {
      try {
        const [likes, comments] = await Promise.all([
          getPostLikeCount(postId),
          getPostCommentCount(postId),
        ]);
        if (!active) return;
        setLikeCount(likes);
        setCommentCount(comments);
      } catch (metricsError) {
        console.error('Error loading post metrics:', metricsError);
      }
    };

    void loadMetrics();

    return () => {
      active = false;
    };
  }, [postId, post]);

  useEffect(() => {
    let active = true;
    if (!postId || !user) {
      setLiked(false);
      setSaved(false);
      return () => {
        active = false;
      };
    }

    const loadUserState = async () => {
      try {
        const [likedState, savedState] = await Promise.all([
          isPostLiked(postId, user.uid),
          isPostSaved(postId, user.uid),
        ]);
        if (!active) return;
        setLiked(likedState);
        setSaved(savedState);
      } catch (stateError) {
        console.error('Error loading post state:', stateError);
      }
    };

    void loadUserState();

    return () => {
      active = false;
    };
  }, [postId, user]);

  const media = useMemo(() => (post?.media ?? []) as PostMediaItem[], [post]);
  const primaryVideo = media.find((item) => item.type === 'video') ?? null;
  const primaryImage = media.find((item) => item.type === 'image') ?? null;
  const fileAttachments = media.filter((item) => item.type === 'file');
  const displayText = post?.content ?? '';
  const trimmedBody = displayText.trim();
  const fallbackTitle = trimmedBody ? (trimmedBody.split('\n')[0] ?? trimmedBody) : '';
  const titleText = post?.title?.trim() || fallbackTitle || 'Publicacion';
  const isLongContent = trimmedBody.length > 140;
  const showBody = !!post?.title ? trimmedBody.length > 0 : isLongContent;

  const commentsSummary = useMemo(() => {
    if (!post || !postId) return null;
    return {
      postId,
      authorName: post.authorName ?? 'Usuario',
      authorPhoto: post.authorPhoto ?? null,
      title: post.title ?? null,
      text: post.content ?? '',
      imageUrl: primaryImage?.url ?? null,
      media,
      createdAt: post.createdAt,
    };
  }, [post, postId, primaryImage, media]);

  const handleLike = async () => {
    if (!postId) return;
    if (!user) {
      showToast('Inicia sesion para dar me gusta', 'info');
      return;
    }

    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((prev) => Math.max(0, prev + (nextLiked ? 1 : -1)));

    try {
      if (nextLiked) {
        await likePostWithSync(postId, user.uid);
      } else {
        await unlikePostWithSync(postId, user.uid);
      }
    } catch (err) {
      setLiked(!nextLiked);
      setLikeCount((prev) => Math.max(0, prev + (nextLiked ? -1 : 1)));
      showToast('No se pudo actualizar el like', 'error');
    }
  };

  const handleSave = async () => {
    if (!postId) return;
    if (!user) {
      showToast('Inicia sesion para guardar', 'info');
      return;
    }

    const nextSaved = !saved;
    setSaved(nextSaved);
    try {
      if (nextSaved) {
        await savePostWithSync(postId, user.uid);
      } else {
        await unsavePostWithSync(postId, user.uid);
      }
    } catch (err) {
      setSaved(!nextSaved);
      showToast('No se pudo actualizar el guardado', 'error');
    }
  };

  const handleShare = async () => {
    if (!postId) return;
    const url = `${window.location.origin}/post/${postId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Vinctus', url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        showToast('Enlace copiado', 'success');
      } else {
        showToast('No se pudo copiar el enlace', 'error');
      }
    } catch (err) {
      console.error('Error sharing post:', err);
    }
  };

  if (loading) {
    return (
      <div className="page-category pb-32 text-center pt-20">
        <Loader2 size={32} className="animate-spin text-amber-500 mx-auto" />
      </div>
    );
  }

  if (!post || error) {
    return (
      <div className="page-category pb-32 text-center pt-20">
        <p className="text-neutral-500 mb-4">{error ?? 'Publicacion no encontrada'}</p>
        <button onClick={() => navigate('/discover')} className="text-brand-gold hover:underline">
          Volver a Descubrir
        </button>
      </div>
    );
  }

  return (
    <div className="page-category pb-32">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-neutral-500 hover:text-white transition-colors mb-6 mt-4"
      >
        <ChevronLeft size={20} />
        <span className="text-sm">Volver</span>
      </button>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden">
          {post.authorPhoto ? (
            <img
              src={post.authorPhoto}
              alt={post.authorName ?? 'Usuario'}
              className="w-full h-full object-cover"
            />
          ) : (
            <User size={20} className="text-neutral-500" />
          )}
        </div>
        <div>
          <p className="text-white font-medium">{post.authorName ?? 'Usuario'}</p>
          <p className="text-neutral-500 text-sm">
            Comunidad · {formatRelativeTime(post.createdAt)}
          </p>
        </div>
      </div>

      <h1 className="text-display-sm md:text-display-md font-display text-white mb-6 leading-tight">
        {titleText}
      </h1>

      {(primaryVideo || primaryImage) && (
        <div className="relative rounded-xl overflow-hidden mb-8 aspect-video bg-surface-overlay">
          {primaryVideo ? (
            <video src={primaryVideo.url} controls className="w-full h-full object-cover" />
          ) : (
            <img src={primaryImage?.url} alt={titleText} className="w-full h-full object-cover" />
          )}
          {media.length > 1 && (
            <div className="absolute top-3 right-3 rounded-full bg-black/60 text-white text-xs px-2 py-1">
              +{media.length - 1}
            </div>
          )}
        </div>
      )}

      {fileAttachments.length > 0 && (
        <div className="mb-8 space-y-2">
          {fileAttachments.map((file) => {
            const label = file.fileName ?? file.url;
            const ext = getFileExtension(label) ?? 'ARCHIVO';
            return (
              <a
                key={file.url}
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-neutral-200 hover:border-neutral-600 transition-colors"
              >
                <FileText size={18} />
                <div className="flex-1">
                  <p className="text-sm font-medium truncate">{label}</p>
                  <p className="text-xs text-neutral-500">{ext}</p>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {showBody && (
        <article className="prose prose-invert max-w-none mb-8">
          {displayText.split('\n\n').map((paragraph, idx) => (
            <p key={idx} className="text-neutral-300 text-body-md leading-relaxed mb-4">
              {paragraph}
            </p>
          ))}
        </article>
      )}

      <div className="flex items-center justify-between py-4 border-t border-b border-neutral-800/50">
        <div className="flex items-center gap-6">
          <button
            onClick={handleLike}
            className={`flex items-center gap-2 transition-colors press-scale ${liked ? 'text-red-400' : 'text-neutral-500 hover:text-white'}`}
          >
            <Heart size={20} fill={liked ? 'currentColor' : 'none'} />
            <span className="text-sm">{likeCount}</span>
          </button>

          <button
            onClick={() => setCommentsOpen(true)}
            className="flex items-center gap-2 text-neutral-500 hover:text-white transition-colors"
          >
            <MessageCircle size={20} />
            <span className="text-sm">{commentCount}</span>
          </button>

          {primaryVideo && (
            <div className="flex items-center gap-1 text-neutral-500 text-sm">
              <Film size={16} />
              Video
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleSave}
            aria-label={saved ? 'Quitar de guardados' : 'Guardar publicacion'}
            className={`transition-colors press-scale ${saved ? 'text-brand-gold' : 'text-neutral-500 hover:text-white'}`}
          >
            <Bookmark size={20} fill={saved ? 'currentColor' : 'none'} />
          </button>

          <button
            type="button"
            aria-label="Compartir publicacion"
            onClick={handleShare}
            className="text-neutral-500 hover:text-white transition-colors"
          >
            <Share2 size={20} />
          </button>
        </div>
      </div>

      <PostCommentsModal
        isOpen={commentsOpen}
        post={commentsSummary}
        onClose={() => setCommentsOpen(false)}
        onCommentAdded={async () => {
          if (!postId) return;
          try {
            const total = await getPostCommentCount(postId);
            setCommentCount(total);
          } catch (err) {
            console.error('Error updating comment count:', err);
          }
        }}
      />
    </div>
  );
};

export default PostDetailPage;
