import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Play, Search, X } from 'lucide-react';
import { useSessionResource } from '@/shared/hooks/useSessionResource';
import { toDate } from '@/shared/lib/formatUtils';
import { fetchYouTubeSearchVideos, type YouTubeSearchVideo } from '@/shared/lib/youtubeSearchApi';
import { isSafeHttpUrl } from '@/features/discover/model/discoverCatalog';
import DiscoverSection, { SectionEmpty } from '@/features/discover/components/DiscoverSection';
import Rail, { RailItem } from '@/features/discover/components/Rail';

/** Shown when nothing is searched. It is the query the server caches the longest. */
const DEFAULT_QUERY = 'ciencia tecnologia musica';
const SEARCH_DEBOUNCE_MS = 400;
const VIDEOS_IN_DISCOVER = 8;

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');

/** "Videos": YouTube videos to watch without leaving Vinctus, with their own search. */
export default function VideosSection() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [playing, setPlaying] = useState<YouTubeSearchVideo | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = normalize(input);
      setQuery(next.length >= 2 ? next : DEFAULT_QUERY);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [input]);

  const videos = useSessionResource(
    `discover:videos:${query.toLowerCase()}`,
    () => fetchYouTubeSearchVideos({ query, limit: VIDEOS_IN_DISCOVER }),
    10 * 60_000,
  );
  const items = videos.data?.items ?? [];
  const searching = query !== DEFAULT_QUERY;

  // Nothing to offer and nothing searched: leave the section out instead of an empty box.
  if (!searching && !videos.loading && (videos.error || (videos.data && items.length === 0))) {
    return null;
  }

  return (
    <DiscoverSection
      title="Videos"
      subtitle="Para ver sin salir de Vinctus."
      action={
        <label className="relative block w-full md:w-56">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
          />
          <input
            type="search"
            aria-label="Buscar videos"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Buscar videos"
            className="h-10 w-full rounded-full border border-white/10 bg-white/[0.03] pl-8 pr-3 text-sm text-white placeholder:text-neutral-500 focus:border-white/25 focus:outline-none md:h-9"
          />
        </label>
      }
    >
      {items.length > 0 ? (
        <Rail label="Videos">
          {items.map((video) => (
            <RailItem key={video.videoId} className="w-[264px] md:w-[300px]">
              <VideoCard video={video} onPlay={() => setPlaying(video)} />
            </RailItem>
          ))}
        </Rail>
      ) : videos.loading || !videos.data ? (
        <div aria-hidden className="-mx-4 flex gap-3 overflow-hidden px-4 md:mx-0 md:gap-4 md:px-0">
          {[0, 1, 2].map((index) => (
            <div key={index} className="w-[264px] shrink-0 md:w-[300px]">
              <div className="skeleton aspect-video rounded-xl" />
              <div className="skeleton mt-3 h-3 w-4/5" />
            </div>
          ))}
        </div>
      ) : (
        <SectionEmpty>
          {videos.error
            ? 'No se pudieron buscar videos. Inténtalo de nuevo en un momento.'
            : `Sin videos para “${query}”.`}
        </SectionEmpty>
      )}

      {playing && <VideoPlayerDialog video={playing} onClose={() => setPlaying(null)} />}
    </DiscoverSection>
  );
}

function VideoCard({ video, onPlay }: { video: YouTubeSearchVideo; onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Ver video: ${video.title}`}
      className="group block w-full text-left focus-visible:outline-none"
    >
      <span className="relative block aspect-video overflow-hidden rounded-xl border border-white/[0.06] bg-neutral-900 group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-brand-gold/60">
        {video.thumbnailUrl && (
          <img
            src={video.thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-transform group-hover:scale-105">
            <Play size={16} fill="currentColor" className="ml-0.5" />
          </span>
        </span>
      </span>
      <span className="mt-2.5 line-clamp-2 block text-sm font-medium leading-snug text-white">
        {video.title}
      </span>
      {video.channelTitle && (
        <span className="mt-0.5 block truncate text-xs text-neutral-500">{video.channelTitle}</span>
      )}
    </button>
  );
}

function VideoPlayerDialog({ video, onClose }: { video: YouTubeSearchVideo; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const published = video.publishedAt
    ? toDate(video.publishedAt)?.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
      className="fixed inset-0 z-[320] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm safe-area-inset md:items-center md:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="aspect-video bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.videoId}?rel=0&autoplay=1`}
            title={video.title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <div className="flex items-start justify-between gap-4 p-4 md:p-5">
          <div className="min-w-0">
            <h3 className="font-display text-lg leading-snug text-white">{video.title}</h3>
            <p className="mt-1 text-sm text-neutral-500">
              {[video.channelTitle, published].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isSafeHttpUrl(video.watchUrl) && (
              <a
                href={video.watchUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1 rounded-full border border-white/15 px-3 text-xs font-medium text-neutral-200 transition-colors hover:border-white/30 hover:text-white"
              >
                YouTube
                <ArrowUpRight size={13} />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar video"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-neutral-300 transition-colors hover:border-white/30 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
