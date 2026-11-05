import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, X } from 'lucide-react';
import type { PublicationStreamItem } from '@/features/discover/model/publicationFeed';

type YouTubePlayerModalProps = {
  publication: PublicationStreamItem;
  onClose: () => void;
};

/** Plays a feed video inside Vinctus. Locks page scroll while open; Escape or a backdrop click closes it. */
const YouTubePlayerModal = ({ publication, onClose }: YouTubePlayerModalProps) => {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  if (!publication.youtubeVideoId || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[320] overflow-y-auto safe-area-inset bg-black/80 backdrop-blur-sm p-4 md:p-8"
      onClick={onClose}
    >
      <div
        className="mx-auto my-2 w-full max-w-5xl rounded-card border border-neutral-800 bg-neutral-950/95 shadow-2xl md:my-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3 md:px-5">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">YouTube en Vinctus</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wider text-neutral-200 hover:border-neutral-500 hover:text-white"
          >
            Cerrar
            <X size={12} />
          </button>
        </div>

        <div className="p-4 pb-6 md:p-5 md:pb-8">
          <div className="aspect-video overflow-hidden rounded-xl border border-neutral-800 bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${publication.youtubeVideoId}?rel=0`}
              title={publication.title}
              className="h-full w-full"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h3 className="text-white text-lg font-display leading-tight">{publication.title}</h3>
              <p className="mt-1 text-sm text-neutral-400">
                {publication.youtubeChannelTitle || publication.group}
              </p>
            </div>
            {publication.youtubeUrl && (
              <a
                href={publication.youtubeUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900/70 px-4 py-2 text-xs uppercase tracking-wider text-neutral-200 hover:border-neutral-500 hover:text-white"
              >
                Abrir en YouTube
                <ArrowRight size={12} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default YouTubePlayerModal;
