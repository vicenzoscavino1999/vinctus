import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Bookmark,
  ChevronLeft,
  Heart,
  Link2,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Share2,
  Flag,
} from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import { triggerSelectionHaptic } from '@/shared/lib/haptics';
import PostAuthorRow from '@/features/posts/components/PostAuthorRow';
import PostComments from '@/features/posts/components/PostComments';
import PostMediaGallery from '@/features/posts/components/PostMediaGallery';
import { useContentReport } from '@/features/posts/hooks/useContentReport';
import { getPost, type PostRead } from '@/features/posts/api';
import { formatRelativeTime } from '@/shared/lib/formatUtils';
import { usePostEngagement } from '@/features/posts/hooks/usePostEngagement';
import { reactionLabel } from '@/features/posts/model/PostEngagementSession';

const postUrl = (postId: string) => `${window.location.origin}/post/${postId}`;

/** "⋯" next to the back button: copy the link or report the post. */
function PostOptions({ onCopyLink, onReport }: { onCopyLink: () => void; onReport: () => void }) {
  const [open, setOpen] = useState(false);
  const item =
    'flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-white/[0.06]';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Más opciones"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-xl"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onCopyLink();
              }}
              className={`${item} text-neutral-200`}
            >
              <Link2 size={16} />
              Copiar enlace
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onReport();
              }}
              className={`${item} text-red-300`}
            >
              <Flag size={16} />
              Reportar publicacion
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const PostDetailSession = () => {
  const { postId } = useParams<{ postId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const report = useContentReport();

  const [post, setPost] = useState<PostRead | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const readScope = JSON.stringify([user?.uid ?? null, postId]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState(0);
  const [composerRequest, setComposerRequest] = useState(0);
  const commentsRef = useRef<HTMLDivElement>(null);
  const { like, save, act } = usePostEngagement(
    post ? postId : undefined,
    user?.uid,
    post?.likeCount ?? 0,
  );
  const likeCount = like.loaded ? like.count : Math.max(0, post?.likeCount ?? 0);

  // Links and the comment button of other screens open the post at its comments.
  const openAtComments = useMemo(() => {
    const navigationState = (location.state as { openComments?: boolean } | null) ?? null;
    if (navigationState?.openComments) return true;
    return new URLSearchParams(location.search).get('comments') === '1';
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
      setPost(null);
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
        setLoadedScope(readScope);
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
  }, [postId, readScope]);

  const ready = !!post && loadedScope === readScope;
  useEffect(() => {
    if (ready && openAtComments) {
      commentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [ready, openAtComments]);

  const handleReaction = (kind: 'like' | 'save') => {
    if (!user) {
      showToast('Inicia sesion para continuar', 'info');
      return;
    }
    if (kind === 'like') void triggerSelectionHaptic();
    void act(kind);
  };

  const copyLink = async () => {
    if (!postId) return;
    try {
      await navigator.clipboard.writeText(postUrl(postId));
      showToast('Enlace copiado', 'success');
    } catch {
      showToast('No se pudo copiar el enlace', 'error');
    }
  };

  const handleShare = async () => {
    if (!postId) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Vinctus', url: postUrl(postId) });
      } else {
        await copyLink();
      }
    } catch (err) {
      console.error('Error sharing post:', err);
    }
  };

  const openComposer = () => {
    setComposerRequest((value) => value + 1);
    commentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading || (post !== null && !ready)) {
    return (
      <div className="page-category pb-32 pt-20 text-center">
        <Loader2 size={32} className="mx-auto animate-spin text-amber-500" />
      </div>
    );
  }

  if (!post || error) {
    return (
      <div className="page-category pb-32 pt-20 text-center">
        <p className="mb-4 text-neutral-500">{error ?? 'Publicacion no encontrada'}</p>
        <button onClick={() => navigate('/discover')} className="text-brand-gold hover:underline">
          Volver a Descubrir
        </button>
      </div>
    );
  }

  const media = post.media ?? [];
  const hasMedia = media.some((item) => item.type === 'image' || item.type === 'video');
  const text = (post.text ?? post.content ?? '').trim();
  const title = post.title?.trim() || '';
  const authorName = post.authorSnapshot?.displayName ?? post.authorName ?? 'Usuario';
  const authorPhoto = post.authorSnapshot?.photoURL ?? post.authorPhoto ?? null;
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const words = (
    <div className="space-y-3">
      {title && (
        <h1 className="font-display text-3xl leading-tight text-white md:text-4xl">{title}</h1>
      )}
      {paragraphs.map((paragraph, index) => (
        <p
          key={index}
          className={`whitespace-pre-line leading-relaxed text-neutral-100 ${
            hasMedia ? 'text-[15px]' : 'text-[17px]'
          }`}
        >
          {paragraph}
        </p>
      ))}
    </div>
  );

  return (
    <div className="page-category mx-auto max-w-[600px] pb-32">
      <div className="mb-5 mt-4 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-neutral-400 transition-colors hover:text-white"
        >
          <ChevronLeft size={20} />
          <span className="text-sm">Volver</span>
        </button>
        <PostOptions
          onCopyLink={() => void copyLink()}
          onReport={() => report.reportPost(post.postId || post.id, post.authorId)}
        />
      </div>

      <article aria-label="Publicación" className="space-y-4">
        <PostAuthorRow
          authorId={post.authorId}
          authorName={authorName}
          authorPhoto={authorPhoto}
          groupId={post.groupId}
          timeLabel={formatRelativeTime(post.createdAt)}
        />

        {/* Like the feed: the media first and the words under the actions, or the words first. */}
        {hasMedia ? (
          <PostMediaGallery
            media={media}
            alt={title || text.slice(0, 80) || 'Imagen de la publicación'}
          />
        ) : (
          <>
            {words}
            {media.length > 0 && <PostMediaGallery media={media} alt={title || 'Publicación'} />}
          </>
        )}

        <div>
          <div className="-mx-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleReaction('like')}
              disabled={like.loading}
              aria-busy={like.loading}
              aria-label={reactionLabel('like', like)}
              aria-pressed={like.value ?? undefined}
              className={`flex h-10 items-center rounded-full px-1 transition-colors disabled:opacity-60 ${
                like.value ? 'text-red-500' : 'text-neutral-100 hover:text-white'
              }`}
            >
              {like.loading ? (
                <Loader2 size={24} className="animate-spin" />
              ) : (
                <Heart
                  key={like.value ? 'liked' : 'not-liked'}
                  size={24}
                  fill={like.value ? 'currentColor' : 'none'}
                  className={like.value ? 'animate-like-pop' : ''}
                />
              )}
            </button>
            <button
              type="button"
              onClick={openComposer}
              aria-label="Comentarios"
              className="flex h-10 items-center rounded-full px-1 text-neutral-100 transition-colors hover:text-white"
            >
              <MessageCircle size={24} />
            </button>
            <button
              type="button"
              aria-label="Compartir publicacion"
              onClick={() => void handleShare()}
              className="flex h-10 items-center rounded-full px-1 text-neutral-100 transition-colors hover:text-white"
            >
              <Share2 size={22} />
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => handleReaction('save')}
              disabled={save.loading}
              aria-busy={save.loading}
              aria-pressed={save.value ?? undefined}
              aria-label={reactionLabel('save', save)}
              className={`flex h-10 items-center rounded-full px-1 transition-colors disabled:opacity-60 ${
                save.value ? 'text-brand-gold' : 'text-neutral-100 hover:text-white'
              }`}
            >
              {save.loading ? (
                <Loader2 size={24} className="animate-spin" />
              ) : (
                <Bookmark size={24} fill={save.value ? 'currentColor' : 'none'} />
              )}
            </button>
          </div>
          <p className="mt-1 text-sm font-semibold tabular-nums text-white">
            {likeCount === 1 ? '1 me gusta' : `${likeCount.toLocaleString('es-ES')} me gusta`}
          </p>
          {(like.error || save.error) && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {like.error || save.error}
            </p>
          )}
        </div>

        {hasMedia && (title || paragraphs.length > 0) && words}
      </article>

      <div ref={commentsRef} id="comentarios" className="mt-10 scroll-mt-24">
        <PostComments
          postId={post.postId || post.id}
          commentCount={commentCount}
          composerRequest={composerRequest}
          onCommentAdded={() => {
            setCommentCount((prev) => prev + 1);
            setPost((prev) =>
              prev ? { ...prev, commentCount: Math.max(0, (prev.commentCount || 0) + 1) } : prev,
            );
          }}
          onReportComment={(comment) => report.reportComment(post.postId || post.id, comment)}
        />
      </div>
      {report.modal}
    </div>
  );
};

export default function PostDetailPage() {
  const { postId } = useParams<{ postId: string }>();
  const { user } = useAuth();
  return <PostDetailSession key={`${user?.uid ?? 'anonymous'}|${postId ?? 'missing'}`} />;
}
