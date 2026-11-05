import { ArrowRight, BookOpen, Bookmark, Heart, MessageCircle } from 'lucide-react';
import { CATEGORIES } from '@/shared/constants';
import { toDate } from '@/shared/lib/formatUtils';
import type { PublicationStreamItem } from '@/features/discover/model/publicationFeed';

type PublicationCardProps = {
  publication: PublicationStreamItem;
  /** Position in the feed; staggers the entrance animation. */
  index: number;
  liked: boolean;
  saved: boolean;
  onOpen: (publication: PublicationStreamItem) => void;
  onOpenComments: (postId: string) => void;
  onToggleLike: (postId: string) => void;
  onToggleSave: (postId: string) => void;
};

const SOURCE_LABELS: Record<PublicationStreamItem['source'], string> = {
  community: 'Comunidad',
  youtube: 'YouTube',
  editorial: 'Editorial',
};

/** One item of the Discover feed. Like and save only work on community posts. */
const PublicationCard = ({
  publication,
  index,
  liked: likedByUser,
  saved: savedByUser,
  onOpen,
  onOpenComments,
  onToggleLike,
  onToggleSave,
}: PublicationCardProps) => {
  const category = CATEGORIES.find((item) => item.id === publication.categoryId);
  const supportsCommunityActions =
    publication.source === 'community' && Boolean(publication.postId);
  const liked = supportsCommunityActions ? likedByUser : false;
  const saved = supportsCommunityActions ? savedByUser : false;
  const displayLikes = publication.likes + (liked ? 1 : 0);
  const bodyText = (publication.body || category?.description || '').replace(/\s+/g, ' ').trim();
  const youtubeDateLabel = publication.youtubePublishedAt
    ? toDate(publication.youtubePublishedAt)?.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}
      className="overflow-hidden rounded-card border border-neutral-800/70 bg-surface-overlay/85 card-premium animate-in fade-in slide-in-from-bottom-2 duration-500"
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 md:px-5">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-gold/35 bg-brand-gold/12">
            {category ? (
              <category.icon size={16} className={category.color} strokeWidth={1.6} />
            ) : (
              <BookOpen size={16} className="text-brand-gold" strokeWidth={1.6} />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{publication.group}</p>
            <p className="truncate text-[11px] uppercase tracking-wider text-neutral-400">
              {publication.category}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpen(publication)}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900/75 px-3 py-1.5 text-[10px] uppercase tracking-wider text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white"
        >
          {publication.source === 'youtube'
            ? 'Ver video'
            : publication.postId
              ? 'Ver publicacion'
              : 'Ver categoria'}
          <ArrowRight size={12} />
        </button>
      </header>

      <button
        type="button"
        onClick={() => onOpen(publication)}
        className="group relative block w-full text-left"
      >
        <img
          src={publication.image}
          alt={publication.title}
          className="h-[280px] w-full object-cover md:h-[360px] transition-transform duration-700 group-hover:scale-[1.02]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
          <h3 className="text-heading-md font-display text-white leading-tight line-clamp-2">
            {publication.title}
          </h3>
          {bodyText && <p className="mt-1 text-sm text-neutral-300 line-clamp-2">{bodyText}</p>}
          {publication.source === 'youtube' && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-neutral-300">
              <span>{publication.youtubeChannelTitle || publication.group}</span>
              {youtubeDateLabel && <span>{youtubeDateLabel}</span>}
            </div>
          )}
        </div>
      </button>

      <div className="px-4 pb-4 pt-3 md:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!supportsCommunityActions) return;
              onToggleLike(publication.id);
            }}
            disabled={!supportsCommunityActions}
            aria-label={`Me gusta: ${displayLikes}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
              !supportsCommunityActions
                ? 'cursor-not-allowed border-neutral-800 bg-neutral-900/40 text-neutral-500'
                : liked
                  ? 'border-red-400/60 bg-red-500/15 text-red-300'
                  : 'border-neutral-700 bg-neutral-900/70 text-neutral-200 hover:border-neutral-500'
            }`}
          >
            <Heart size={13} fill={liked ? 'currentColor' : 'none'} />
            {displayLikes}
          </button>

          {publication.postId && (
            <button
              type="button"
              onClick={() => onOpenComments(publication.postId as string)}
              aria-label={`Comentarios: ${publication.comments}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900/70 px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:border-neutral-500"
            >
              <MessageCircle size={13} />
              {publication.comments}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (!supportsCommunityActions) return;
              onToggleSave(publication.id);
            }}
            disabled={!supportsCommunityActions}
            aria-label="Guardar publicacion"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
              !supportsCommunityActions
                ? 'cursor-not-allowed border-neutral-800 bg-neutral-900/40 text-neutral-500'
                : saved
                  ? 'border-brand-gold/50 bg-brand-gold/15 text-brand-gold'
                  : 'border-neutral-700 bg-neutral-900/70 text-neutral-200 hover:border-neutral-500'
            }`}
          >
            <Bookmark size={13} fill={saved ? 'currentColor' : 'none'} />
            {saved ? 'Guardado' : 'Guardar'}
          </button>

          <span className="ml-auto text-[10px] uppercase tracking-[0.2em] text-neutral-500">
            {SOURCE_LABELS[publication.source]}
          </span>
        </div>
      </div>
    </article>
  );
};

export default PublicationCard;
