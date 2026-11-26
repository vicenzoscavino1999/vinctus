import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Bookmark, FileText, Heart, Link2, Loader2, MessageCircle, Play } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import { triggerSelectionHaptic } from '@/shared/lib/haptics';
import { usePostEngagement } from '@/features/posts/hooks/usePostEngagement';
import { reactionLabel } from '@/features/posts/model/PostEngagementSession';
import { PostImage } from '@/features/posts/components/ProtectedPostMedia';
import type { PostSummary } from '@/features/posts/model/postSummary';

type Props = {
  summary: PostSummary;
  /** Like count from the server, used to start the like session. */
  initialLikeCount: number;
  timeLabel: string;
  onOpen: () => void;
  onCopyLink: () => void;
  onLikeCount: (postId: string, count: number) => void;
};

/** Two taps on the media within this time count as a double tap (like). */
const DOUBLE_TAP_MS = 280;

/**
 * A post in the feed, laid out like Instagram with Vinctus' own look: header, edge-to-edge media
 * (carousel when there are several photos), one row of actions, likes, caption and comments.
 * A double tap on the media likes the post (it never removes a like), with a heart burst.
 */
export default function FeedPostCard({
  summary,
  initialLikeCount,
  timeLabel,
  onOpen,
  onCopyLink,
  onLikeCount,
}: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { like, save, act } = usePostEngagement(summary.postId, user?.uid, initialLikeCount);
  const [burst, setBurst] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [slide, setSlide] = useState(0);
  const [captionClipped, setCaptionClipped] = useState(false);
  const caption = useRef<HTMLParagraphElement>(null);
  const lastTap = useRef(0);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "más" only when the two-line caption actually cuts the text (it depends on the width).
  useEffect(() => {
    const node = caption.current;
    if (!node || expanded || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setCaptionClipped(node.scrollHeight > node.clientHeight + 1);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [expanded, summary.text]);

  useEffect(() => {
    if (like.loaded) onLikeCount(summary.postId, like.count);
  }, [like.count, like.loaded, onLikeCount, summary.postId]);
  useEffect(
    () => () => {
      if (openTimer.current) clearTimeout(openTimer.current);
    },
    [],
  );

  const media = summary.media ?? [];
  const images = media.filter((item) => item.type === 'image').map((item) => item.url);
  if (images.length === 0 && summary.imageUrl) images.push(summary.imageUrl);
  const hasVideo = media.some((item) => item.type === 'video');
  const fileCount = media.filter((item) => item.type === 'file').length;
  const hasMedia = images.length > 0 || hasVideo;

  const title = summary.title?.trim() || '';
  const text = summary.text.trim();
  const likeCount = like.loaded ? like.count : initialLikeCount;
  const commentCount = summary.commentCount;
  const initial = summary.authorName.charAt(0).toUpperCase() || '?';

  const action = (kind: 'like' | 'save') => {
    if (!user) {
      showToast('Inicia sesión para continuar', 'info');
      return;
    }
    if (kind === 'like') void triggerSelectionHaptic();
    void act(kind);
  };

  // A single tap on the media opens the post; a quick second tap likes it instead.
  const handleMediaTap = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (openTimer.current) clearTimeout(openTimer.current);
      openTimer.current = null;
      setBurst((value) => value + 1);
      if (user && like.loaded && !like.value) action('like');
      else if (!user) showToast('Inicia sesión para continuar', 'info');
      return;
    }
    lastTap.current = now;
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      onOpen();
    }, DOUBLE_TAP_MS);
  };
  const handleMediaKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  const error = like.error || save.error;

  return (
    <article className="overflow-hidden border-b border-neutral-900 bg-neutral-950 max-md:-mx-4 md:rounded-2xl md:border">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3">
        {summary.authorPhoto ? (
          <img
            src={summary.authorPhoto}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-sm font-semibold text-black"
          >
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{summary.authorName}</p>
          <p className="text-xs text-neutral-500">{timeLabel}</p>
        </div>
        <button
          type="button"
          onClick={onCopyLink}
          aria-label="Copiar enlace"
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-white"
        >
          <Link2 size={18} />
        </button>
      </header>

      {/* Media, or the text itself for text posts */}
      {hasMedia ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Abrir publicación"
          onClick={handleMediaTap}
          onKeyDown={handleMediaKey}
          className="relative cursor-pointer select-none bg-neutral-900 [touch-action:manipulation]"
        >
          {images.length > 0 ? (
            <div
              className="flex aspect-square snap-x snap-mandatory overflow-x-auto scrollbar-hide"
              onScroll={(event) => {
                const node = event.currentTarget;
                setSlide(Math.round(node.scrollLeft / Math.max(1, node.clientWidth)));
              }}
            >
              {images.map((url, index) => (
                <PostImage
                  key={`${url}_${index}`}
                  src={url}
                  alt={index === 0 ? title || text.slice(0, 80) || 'Imagen de la publicación' : ''}
                  draggable={false}
                  className="h-full w-full shrink-0 snap-center object-cover"
                />
              ))}
            </div>
          ) : (
            <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-neutral-900 to-black">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white">
                <Play size={26} fill="currentColor" />
              </span>
            </div>
          )}
          {hasVideo && images.length > 0 && (
            <span className="pointer-events-none absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white">
              <Play size={14} fill="currentColor" />
            </span>
          )}
          {images.length > 1 && (
            <div className="pointer-events-none absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
              {images.map((url, index) => (
                <span
                  key={`dot_${url}_${index}`}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    index === slide ? 'bg-white' : 'bg-white/40'
                  }`}
                />
              ))}
            </div>
          )}
          {burst > 0 && (
            <div
              key={burst}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <Heart
                size={96}
                fill="currentColor"
                className="animate-heart-burst text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)]"
              />
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={onOpen} className="block w-full px-4 pb-1 text-left">
          {title && <h3 className="mb-2 font-serif text-2xl leading-snug text-white">{title}</h3>}
          <p className="line-clamp-6 whitespace-pre-line text-[17px] leading-relaxed text-neutral-100">
            {text || 'Publicación de la comunidad'}
          </p>
        </button>
      )}

      {/* Actions: like, comments, save (same order as the native app) */}
      <div className="flex items-center gap-4 px-3 pt-2">
        <button
          type="button"
          onClick={() => action('like')}
          disabled={like.loading}
          aria-label={reactionLabel('like', like)}
          aria-pressed={like.value ?? undefined}
          aria-busy={like.loading}
          className={`flex h-10 items-center gap-1.5 rounded-full px-1 transition-colors disabled:opacity-60 ${
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
          onClick={onOpen}
          aria-label="Comentarios"
          className="flex h-10 items-center rounded-full px-1 text-neutral-100 transition-colors hover:text-white"
        >
          <MessageCircle size={24} />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => action('save')}
          disabled={save.loading}
          aria-label={reactionLabel('save', save)}
          aria-pressed={save.value ?? undefined}
          aria-busy={save.loading}
          className={`flex h-10 items-center rounded-full px-1 transition-colors disabled:opacity-60 ${
            save.value ? 'text-brand-gold' : 'text-neutral-100 hover:text-white'
          }`}
        >
          {save.loading ? (
            <Loader2 size={24} className="animate-spin" />
          ) : (
            <Bookmark
              size={24}
              fill={save.value ? 'currentColor' : 'none'}
              className={save.value ? 'animate-like-pop' : ''}
            />
          )}
        </button>
      </div>

      {/* Likes, caption, comments */}
      <div className="space-y-1.5 px-4 pb-4 pt-1">
        <p className="text-sm font-semibold tabular-nums text-white">
          {likeCount === 1 ? '1 me gusta' : `${likeCount.toLocaleString('es-ES')} me gusta`}
        </p>
        {hasMedia && (title || text) && (
          <div className="text-sm leading-snug text-neutral-200">
            {title && <p className="mb-0.5 font-serif text-base text-white">{title}</p>}
            {text && (
              <p ref={caption} className={`whitespace-pre-line ${expanded ? '' : 'line-clamp-2'}`}>
                <span className="mr-1.5 font-semibold text-white">{summary.authorName}</span>
                {text}
              </p>
            )}
            {!expanded && captionClipped && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-neutral-500 hover:text-neutral-300"
              >
                más
              </button>
            )}
          </div>
        )}
        {fileCount > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-neutral-400">
            <FileText size={13} />
            {fileCount === 1 ? '1 archivo adjunto' : `${fileCount} archivos adjuntos`}
          </p>
        )}
        <button
          type="button"
          onClick={onOpen}
          className="block text-sm text-neutral-500 transition-colors hover:text-neutral-300"
        >
          {commentCount === 0
            ? 'Añadir un comentario…'
            : commentCount === 1
              ? 'Ver el comentario'
              : `Ver los ${commentCount.toLocaleString('es-ES')} comentarios`}
        </button>
        {error && (
          <p role="alert" className="rounded bg-black/80 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
