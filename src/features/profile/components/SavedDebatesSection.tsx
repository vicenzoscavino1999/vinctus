import { Bookmark, Loader2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getPersonaById } from '@/features/arena/types';
import { toDate } from '@/shared/lib/formatUtils';
import { useSavedDebates } from '@/features/profile/hooks/useSavedDebates';

const formatSavedDate = (value: unknown): string =>
  toDate(value)?.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) ??
  'Reciente';

/** "Debates guardados": the Arena debates you saved, to reopen or remove. */
export default function SavedDebatesSection({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const { debates, loading, error, removingId, reload, remove } = useSavedDebates(userId);

  return (
    <section
      aria-label="Debates guardados"
      className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        <Bookmark size={16} className="text-brand-gold" />
        <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-500">Debates guardados</h2>
      </div>

      {loading ? (
        <div aria-hidden className="space-y-3">
          {[0, 1].map((index) => (
            <div key={index} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-red-400">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-lg border border-red-500/40 px-3 py-1 text-xs uppercase tracking-wider text-red-200 transition hover:border-red-400 hover:text-white"
          >
            Reintentar
          </button>
        </div>
      ) : debates.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Aún no tienes debates guardados. Desde Arena IA puedes guardarlos con un clic.
        </p>
      ) : (
        <div className="space-y-3">
          {debates.map((debate) => {
            const personaA = getPersonaById(debate.personaA)?.name || 'Persona A';
            const personaB = getPersonaById(debate.personaB)?.name || 'Persona B';
            const removing = removingId === debate.debateId;
            return (
              <article
                key={debate.debateId}
                className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-4"
              >
                <h3 className="font-medium text-white">{debate.topic}</h3>
                <p className="mt-1 text-xs text-neutral-500">
                  {personaA} vs {personaB} · {formatSavedDate(debate.createdAt)}
                </p>
                {debate.summary && (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-neutral-400">
                    {debate.summary}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/arena/${debate.debateId}`)}
                    className="rounded-lg border border-neutral-700 px-3 py-2 text-xs uppercase tracking-wider text-neutral-200 transition hover:border-neutral-500 hover:text-white"
                  >
                    Ver debate
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(debate.debateId)}
                    disabled={removing}
                    className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-2 text-xs uppercase tracking-wider text-neutral-400 transition hover:border-red-500/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {removing ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                    Quitar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
