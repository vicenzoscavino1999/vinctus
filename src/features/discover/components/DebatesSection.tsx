import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPublicArenaDebates } from '@/features/arena/api/queries';
import { getPersonaById } from '@/features/arena/types';
import { useSessionResource } from '@/shared/hooks/useSessionResource';
import { toDate } from '@/shared/lib/formatUtils';
import {
  countLabel,
  curateDebates,
  debateLikesCount,
  debateSourceCount,
  hostnameOf,
  isSafeHttpUrl,
} from '@/features/discover/model/discoverCatalog';
import DiscoverSection, {
  SectionError,
  SectionLink,
} from '@/features/discover/components/DiscoverSection';

/** "Debates IA": the best sourced finished debates of Arena. Hidden while there are none. */
export default function DebatesSection() {
  const navigate = useNavigate();
  const debates = useSessionResource('discover:debates', () => getPublicArenaDebates(80));
  const curated = useMemo(() => curateDebates(debates.data ?? []), [debates.data]);

  if (debates.error && !debates.data) {
    return (
      <DiscoverSection title="Debates IA">
        <SectionError message="No se pudieron cargar los debates." onRetry={debates.reload} />
      </DiscoverSection>
    );
  }
  if (!debates.data || curated.length === 0) return null;

  return (
    <DiscoverSection
      title="Debates IA"
      subtitle="Dos perspectivas, con fuentes."
      action={<SectionLink onClick={() => navigate('/arena')}>Ir a Arena</SectionLink>}
    >
      <div className="grid gap-3 md:grid-cols-2 md:gap-4">
        {curated.map((debate) => {
          const personaA = getPersonaById(debate.personaA)?.name || 'Persona A';
          const personaB = getPersonaById(debate.personaB)?.name || 'Persona B';
          const created = toDate(debate.createdAt);
          const date = created
            ? created.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
            : null;
          const hosts = Array.from(
            new Set(
              (Array.isArray(debate.sourceLinks) ? debate.sourceLinks : [])
                .filter((url) => isSafeHttpUrl(url))
                .map(hostnameOf),
            ),
          ).slice(0, 2);
          return (
            <article
              key={debate.id}
              className="relative flex flex-col rounded-2xl border border-white/[0.06] bg-surface-overlay p-5 transition-colors duration-300 hover:border-white/[0.14]"
            >
              <p className="text-xs text-neutral-500">
                <span className="text-brand-gold/90">{personaA}</span>
                <span className="mx-1.5 text-neutral-600">vs</span>
                <span className="text-brand-gold/90">{personaB}</span>
                {date && <span className="text-neutral-600"> · {date}</span>}
              </p>
              <h3 className="mt-2 font-display text-lg leading-snug text-white md:text-xl">
                <button
                  type="button"
                  onClick={() => navigate(`/arena/${debate.id}`)}
                  className="text-left after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-brand-gold/60"
                >
                  <span className="line-clamp-2">{debate.topic}</span>
                </button>
              </h3>
              {debate.summary && (
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-neutral-400">
                  {debate.summary}
                </p>
              )}
              <p className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-4 text-xs text-neutral-500">
                {countLabel(debateSourceCount(debate), 'fuente', 'fuentes')}
                <span aria-hidden>·</span>
                {countLabel(debateLikesCount(debate), 'me gusta', 'me gusta')}
                {hosts.map((host) => (
                  <span
                    key={host}
                    className="ml-1 rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-neutral-400"
                  >
                    {host}
                  </span>
                ))}
              </p>
            </article>
          );
        })}
      </div>
    </DiscoverSection>
  );
}
