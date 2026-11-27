import { useState } from 'react';
import { FileText } from 'lucide-react';
import { PostDownload, PostImage, PostVideo } from '@/features/posts/components/ProtectedPostMedia';
import type { PostMedia } from '@/shared/lib/firestore/posts';
import { formatBytes } from '@/shared/lib/formatUtils';
import { parseYouTubeUrl } from '@/shared/lib/youtube';

type Props = {
  media: PostMedia[];
  /** Describes the photos, usually the post's title or first words. */
  alt: string;
};

const fileExtension = (name: string | undefined): string | null => {
  const ext = name?.split('?')[0].split('.').pop();
  return ext && ext !== name ? ext.toUpperCase() : null;
};

/**
 * Everything a post carries, in full: one photo at its own proportions or several in a carousel,
 * playable videos (YouTube too), and the files to download.
 */
export default function PostMediaGallery({ media, alt }: Props) {
  const [slide, setSlide] = useState(0);
  const images = media.filter((item) => item.type === 'image');
  const videos = media.filter((item) => item.type === 'video');
  const files = media.filter((item) => item.type === 'file');

  return (
    <div className="space-y-3">
      {images.length === 1 && (
        <div className="overflow-hidden bg-neutral-950 max-md:-mx-4 md:rounded-2xl">
          <PostImage
            src={images[0].url}
            alt={alt}
            className="mx-auto max-h-[75vh] w-full object-contain"
          />
        </div>
      )}

      {images.length > 1 && (
        <div className="relative overflow-hidden bg-neutral-950 max-md:-mx-4 md:rounded-2xl">
          <div
            className="flex aspect-square snap-x snap-mandatory overflow-x-auto scrollbar-hide"
            onScroll={(event) => {
              const node = event.currentTarget;
              setSlide(Math.round(node.scrollLeft / Math.max(1, node.clientWidth)));
            }}
          >
            {images.map((item, index) => (
              <PostImage
                key={`${item.path || item.url}_${index}`}
                src={item.url}
                alt={`${alt} (${index + 1} de ${images.length})`}
                draggable={false}
                className="h-full w-full shrink-0 snap-center object-contain"
              />
            ))}
          </div>
          <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs tabular-nums text-white">
            {slide + 1}/{images.length}
          </span>
          <div className="pointer-events-none absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {images.map((item, index) => (
              <span
                key={`dot_${item.path || item.url}_${index}`}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  index === slide ? 'bg-white' : 'bg-white/40'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {videos.map((item, index) => {
        const youtube = parseYouTubeUrl(item.url);
        return (
          <div
            key={`${item.path || item.url}_${index}`}
            className="overflow-hidden bg-black max-md:-mx-4 md:rounded-2xl"
          >
            {youtube ? (
              <iframe
                src={youtube.embedUrl}
                title={item.fileName || `Video ${index + 1}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="aspect-video w-full"
              />
            ) : (
              <PostVideo
                src={item.url}
                controls
                preload="metadata"
                className="max-h-[75vh] w-full bg-black"
              />
            )}
          </div>
        );
      })}

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((item, index) => {
            const name = item.fileName || 'Archivo adjunto';
            const details = [
              fileExtension(item.fileName),
              item.size ? formatBytes(item.size) : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <PostDownload
                key={`${item.path || item.url}_${index}`}
                href={item.url}
                download={item.fileName || 'archivo'}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-neutral-200 transition-colors hover:border-white/20"
              >
                <FileText size={18} className="shrink-0 text-brand-gold/80" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{name}</span>
                  {details && <span className="block text-xs text-neutral-500">{details}</span>}
                </span>
              </PostDownload>
            );
          })}
        </div>
      )}
    </div>
  );
}
