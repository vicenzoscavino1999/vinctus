import { getPersonaById, type Debate } from '@/features/arena/types';
import { toDate } from '@/shared/lib/formatUtils';
import {
  getDebateLikesCount,
  getDebateSourceCount,
} from '@/features/discover/model/debateCuration';
import { extractHostname } from '@/features/discover/model/trendRanking';

type CuratedDebatesSectionProps = {
  debates: Debate[];
  loading: boolean;
  error: string | null;
  onOpenDebate: (debateId: string) => void;
};

const CuratedDebateCard = ({
  debate,
  onOpen,
}: {
  debate: Debate;
  onOpen: (debateId: string) => void;
}) => {
  const personaAName = getPersonaById(debate.personaA)?.name || 'Persona A';
  const personaBName = getPersonaById(debate.personaB)?.name || 'Persona B';
  const sourceCount = getDebateSourceCount(debate);
  const likesCount = getDebateLikesCount(debate);
  const sourceLinks = Array.isArray(debate.sourceLinks) ? debate.sourceLinks.slice(0, 2) : [];
  const sourceMentions = Array.isArray(debate.sourceMentions)
    ? debate.sourceMentions.slice(0, 2)
    : [];
  const createdDate = toDate(debate.createdAt);
  const dateLabel = createdDate
    ? createdDate.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
      })
    : 'Reciente';

  return (
    <article
      role="button"
      tabIndex={0}
      className="bg-surface-overlay border border-neutral-800/60 rounded-card p-5 cursor-pointer card-premium"
      onClick={() => onOpen(debate.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(debate.id);
        }
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-white font-medium text-lg line-clamp-2">{debate.topic}</h3>
          <p className="text-xs text-neutral-500 mt-1">
            {personaAName} vs {personaBName} - {dateLabel}
          </p>
        </div>
        <div className="px-2.5 py-1 rounded bg-brand-gold/15 text-brand-gold text-xs uppercase tracking-wider whitespace-nowrap">
          {sourceCount} fuentes - {likesCount} likes
        </div>
      </div>

      {debate.summary && (
        <p className="text-sm text-neutral-400 mt-3 line-clamp-3">{debate.summary}</p>
      )}

      {sourceLinks.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {sourceLinks.map((url) => {
            const host = extractHostname(url) || url;
            return (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="text-[10px] uppercase tracking-wider text-neutral-300 bg-neutral-800/80 hover:bg-neutral-700 px-2 py-1 rounded transition-colors"
              >
                {host}
              </a>
            );
          })}
        </div>
      )}

      {sourceMentions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {sourceMentions.map((mention) => (
            <span
              key={`${debate.id}-${mention}`}
              className="text-[10px] uppercase tracking-wider text-neutral-300 bg-neutral-800/80 px-2 py-1 rounded max-w-[220px] truncate"
              title={mention}
            >
              {mention}
            </span>
          ))}
        </div>
      )}
    </article>
  );
};

/** "Debates IA destacados". */
const CuratedDebatesSection = ({
  debates,
  loading,
  error,
  onOpenDebate,
}: CuratedDebatesSectionProps) => (
  <section className="mb-12">
    <h2 className="text-heading-lg font-display font-normal text-white mb-6">
      <span className="text-brand-gold">Debates IA</span> destacados
    </h2>

    {loading ? (
      <div className="text-center text-neutral-500 py-6">Cargando debates de Arena IA...</div>
    ) : error ? (
      <div className="text-center text-red-400 py-6">{error}</div>
    ) : debates.length === 0 ? (
      <div className="text-center text-neutral-500 py-6">
        Aun no hay debates con fuentes detectadas. Cuando aparezcan referencias, se mostraran aqui.
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {debates.map((debate) => (
          <CuratedDebateCard key={debate.id} debate={debate} onOpen={onOpenDebate} />
        ))}
      </div>
    )}
  </section>
);

export default CuratedDebatesSection;
