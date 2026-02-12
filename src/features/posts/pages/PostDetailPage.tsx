import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
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
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import { triggerSelectionHaptic } from '@/shared/lib/native';
import PostCommentsModal from '@/features/posts/components/PostCommentsModal';
import { toPostSummary } from '@/features/posts/model/postSummary';
import {
  getPost,
  isPostLiked,
  isPostSaved,
  likePostWithSync,
  savePostWithSync,
  type PostRead,
  unlikePostWithSync,
  unsavePostWithSync,
} from '@/features/posts/api';
import { formatRelativeTime } from '@/shared/lib/formatUtils';
import { parseYouTubeUrl } from '@/shared/lib/youtube';

type PostMediaItem = {
  type: 'image' | 'video' | 'file';
  url: string;
  path: string;
  fileName?: string;
  contentType?: string;
  size?: number;
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
  const location = useLocation();
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

  const shouldOpenCommentsFromNavigation = useMemo(() => {
    const navigationState = (location.state as { openComments?: boolean } | null) ?? null;
    if (navigationState?.openComments) return true;
    const params = new URLSearchParams(location.search);
    return params.get('comments') === '1';
  }, [location.state, location.search]);

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
        setLikeCount(typeof data.likeCount === 'number' ? Math.max(0, data.likeCount) : 0);
        setCommentCount(typeof data.commentCount === 'number' ? Math.max(0, data.commentCount) : 0);
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

  useEffect(() => {
    if (!postId) return;
    if (!shouldOpenCommentsFromNavigation) return;
    setCommentsOpen(true);
  }, [postId, shouldOpenCommentsFromNavigation]);

  const media = useMemo(() => (post?.media ?? []) as PostMediaItem[], [post]);
  const primaryVideo = media.find((item) => item.type === 'video') ?? null;
  const primaryVideoYouTube = primaryVideo ? parseYouTubeUrl(primaryVideo.url) : null;
  const primaryImage = media.find((item) => item.type === 'image') ?? null;
  const fileAttachments = media.filter((item) => item.type === 'file');
  const displayText = post?.text ?? post?.content ?? '';
  const authorName = post?.authorSnapshot?.displayName ?? post?.authorName ?? 'Usuario';
  const authorPhoto = post?.authorSnapshot?.photoURL ?? post?.authorPhoto ?? null;
  const trimmedBody = displayText.trim();
  const fallbackTitle = trimmedBody ? (trimmedBody.split('\n')[0] ?? trimmedBody) : '';
  const titleText = post?.title?.trim() || fallbackTitle || 'Publicacion';
  const isLongContent = trimmedBody.length > 140;
  const showBody = post?.title ? trimmedBody.length > 0 : isLongContent;

  const commentsSummary = useMemo(() => {
    if (!post || !postId) return null;
    return toPostSummary(post, { likeCount, commentCount });
  }, [commentCount, likeCount, post, postId]);

  const handleLike = async () => {
    if (!postId) return;
    if (!user) {
      showToast('Inicia sesion para dar me gusta', 'info');
      return;
    }

    void triggerSelectionHaptic();

    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((prev) => Math.max(0, prev + (nextLiked ? 1 : -1)));

    try {
      if (nextLiked) {
        await likePostWithSync(postId, user.uid);
      } else {
        await unlikePostWithSync(postId, user.uid);
      }
    } catch {
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
    } catch {
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
          {authorPhoto ? (
            <img src={authorPhoto} alt={authorName} className="w-full h-full object-cover" />
          ) : (
            <User size={20} className="text-neutral-500" />
          )}
        </div>
        <div>
          <p className="text-white font-medium">{authorName}</p>
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
            primaryVideoYouTube ? (
              <iframe
                src={primaryVideoYouTube.embedUrl}
                title={titleText}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="w-full h-full"
              />
            ) : (
              <video src={primaryVideo.url} controls className="w-full h-full object-cover" />
            )
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
        onCommentAdded={() => {
          setCommentCount((prev) => prev + 1);
          setPost((prev) =>
            prev
              ? {
                  ...prev,
                  commentCount: Math.max(0, (prev.commentCount || 0) + 1),
                }
              : prev,
          );
        }}
      />
    </div>
  );
};

export default PostDetailPage;
