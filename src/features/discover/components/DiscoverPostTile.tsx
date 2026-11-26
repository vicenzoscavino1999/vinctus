import { Images, Play, Quote } from 'lucide-react';
import DiscoverPostActions from '@/features/discover/components/DiscoverPostActions';
import { PostImage } from '@/features/posts/components/ProtectedPostMedia';
import type { PostSummary } from '@/features/posts/model/postSummary';

type Props = {
  summary: PostSummary;
  timeLabel: string;
  initialLikeCount: number;
  onOpen: () => void;
  onComments: () => void;
  onLikeCount: (postId: string, count: number) => void;
};

const postTitle = (summary: PostSummary): string =>
  summary.title?.trim() || summary.text.split('\n')[0]?.trim() || 'Publicación';

/**
 * A post in Discover's row: the photo (or the text when there is none) in a 4:5 frame, the author
 * and the same like / comment / save actions as the feed.
 */
export default function DiscoverPostTile({
  summary,
  timeLabel,
  initialLikeCount,
  onOpen,
  onComments,
  onLikeCount,
}: Props) {
  const title = postTitle(summary);
  const text = summary.text.trim();
  const photos = summary.media.filter((item) => item.type === 'image');
  const hasVideo = summary.media.some((item) => item.type === 'video');
  const cover = photos[0]?.url ?? summary.imageUrl;
  const caption = summary.title?.trim() || text;
  const initial = summary.authorName.charAt(0).toUpperCase() || '?';

  return (
    <article
      aria-label={`Publicación: ${title}`}
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-overlay transition-colors duration-300 hover:border-white/[0.14]"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Abrir publicación: ${title}`}
        className="group relative block aspect-[4/5] w-full overflow-hidden text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-gold/70"
      >
        {cover ? (
          <PostImage
            src={cover}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <span className="flex h-full flex-col justify-center bg-[radial-gradient(120%_70%_at_0%_0%,rgba(212,175,55,0.16),transparent_62%),linear-gradient(180deg,#1d1d1d,#141414)] px-5 py-6">
            <Quote size={22} className="text-brand-gold/70" strokeWidth={1.6} />
            <span
              className={`mt-3 line-clamp-5 font-display leading-snug text-white ${
                title.length <= 60 ? 'text-2xl' : 'text-xl'
              }`}
            >
              {title}
            </span>
            {text && text !== title && (
              <span className="mt-2 line-clamp-4 text-sm leading-relaxed text-neutral-400">
                {text}
              </span>
            )}
          </span>
        )}
        {(hasVideo || photos.length > 1) && (
          <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
            {hasVideo ? <Play size={13} fill="currentColor" /> : <Images size={14} />}
            <span className="sr-only">{hasVideo ? 'Video' : `${photos.length} fotos`}</span>
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col px-3.5 pb-2.5 pt-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-neutral-800 text-xs font-semibold text-neutral-200">
            {summary.authorPhoto ? (
              <img
                src={summary.authorPhoto}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              initial
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-white">
              {summary.authorName}
            </span>
            {timeLabel && <span className="block text-xs text-neutral-500">{timeLabel}</span>}
          </span>
        </div>
        {cover && caption && (
          <p className="mt-2 line-clamp-2 text-sm leading-snug text-neutral-300">{caption}</p>
        )}
        <div className="mt-auto pt-2">
          <DiscoverPostActions
            postId={summary.postId}
            initialCount={initialLikeCount}
            commentCount={summary.commentCount}
            onComments={onComments}
            onLikeCount={onLikeCount}
          />
        </div>
      </div>
    </article>
  );
}
