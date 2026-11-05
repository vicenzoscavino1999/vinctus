import { Search } from 'lucide-react';
import PublicationCard from '@/features/discover/components/PublicationCard';
import type { PublicationFeed } from '@/features/discover/hooks/usePublicationFeed';
import type { PublicationStreamItem } from '@/features/discover/model/publicationFeed';

type PublicationFeedSectionProps = {
  feed: PublicationFeed;
  isPostLiked: (postId: string) => boolean;
  isPostSaved: (postId: string) => boolean;
  onToggleLike: (postId: string) => void;
  onToggleSave: (postId: string) => void;
  onOpenPublication: (publication: PublicationStreamItem) => void;
  onOpenComments: (postId: string) => void;
};

/** "Publicaciones": the YouTube search box, the mixed feed and its load-more controls. */
const PublicationFeedSection = ({
  feed,
  isPostLiked,
  isPostSaved,
  onToggleLike,
  onToggleSave,
  onOpenPublication,
  onOpenComments,
}: PublicationFeedSectionProps) => {
  const {
    publicationStream,
    hasMorePublications,
    loadNextPublicationBatch,
    publicationLoadMoreRef,
    youtubeQueryInput,
    setYoutubeQueryInput,
    youtubeLoading,
    youtubeReady,
    youtubeCount,
    communityLoading,
    communityReady,
    communityCount,
  } = feed;

  return (
    <section>
      <h2 className="text-heading-lg font-display font-normal text-white mb-3">Publicaciones</h2>
      <p className="text-neutral-400 text-sm mb-6 max-w-2xl">
        Feed continuo de comunidad + YouTube para mantener Discover activo sin verse vacio.
      </p>

      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="relative w-full md:max-w-md">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
          />
          <input
            type="text"
            value={youtubeQueryInput}
            onChange={(event) => setYoutubeQueryInput(event.target.value)}
            placeholder="Buscar videos en YouTube dentro de Vinctus..."
            className="w-full rounded-full border border-neutral-700 bg-neutral-900/70 py-2 pl-9 pr-4 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
          />
        </label>
        <span className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
          {youtubeLoading
            ? 'Buscando videos en vivo...'
            : `YouTube en vivo · ${youtubeCount.toLocaleString('es-ES')} items`}
        </span>
      </div>

      {communityReady && communityCount === 0 && (
        <div className="mb-5 rounded-xl border border-neutral-800/70 bg-neutral-950/40 p-4 text-sm text-neutral-400">
          Aun no hay publicaciones recientes de usuarios. Mostramos una mezcla de YouTube y
          contenido editorial para mantener Discover activo.
        </div>
      )}

      <div className="rounded-card border border-neutral-800/60 bg-neutral-950/20 p-3 md:p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-[0.26em] text-neutral-500">
            Feed social en Discover
          </span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-600">
            {communityCount > 0
              ? 'Mixto: comunidad + YouTube + editorial'
              : youtubeReady && youtubeCount > 0
                ? 'Seed YouTube + editorial'
                : 'Editorial seed'}
          </span>
        </div>

        <div className="space-y-4 md:space-y-5">
          {publicationStream.map((publication, index) => (
            <PublicationCard
              key={publication.streamKey}
              publication={publication}
              index={index}
              liked={isPostLiked(publication.id)}
              saved={isPostSaved(publication.id)}
              onOpen={onOpenPublication}
              onOpenComments={onOpenComments}
              onToggleLike={onToggleLike}
              onToggleSave={onToggleSave}
            />
          ))}
        </div>
        {publicationStream.length === 0 && (
          <p className="py-10 text-center text-[11px] uppercase tracking-wider text-neutral-500">
            Cargando publicaciones...
          </p>
        )}
      </div>

      {hasMorePublications && publicationStream.length > 0 && (
        <div className="mt-7 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={loadNextPublicationBatch}
            className="rounded-full border border-neutral-700 bg-neutral-900/60 px-4 py-2 text-[11px] uppercase tracking-wider text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white"
          >
            Cargar siguiente bloque
          </button>
          <div
            ref={publicationLoadMoreRef}
            className="flex items-center justify-center py-2 text-[11px] uppercase tracking-wider text-neutral-500"
          >
            {communityLoading || youtubeLoading
              ? 'Cargando publicaciones...'
              : 'Desliza para ver mas'}
          </div>
        </div>
      )}
    </section>
  );
};

export default PublicationFeedSection;
