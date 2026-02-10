import { useMemo } from 'react';
import { Bookmark, Heart, Loader2 } from 'lucide-react';
import type { Debate, Turn } from '@/features/arena/types';
import { getPersonaById } from '@/features/arena/types';

interface DebateViewerProps {
  debate: Debate | null;
  turns: Turn[];
  isLoading: boolean;
  onRetry?: () => void;
  onBack?: () => void;
  onCreateAnother?: () => void;
  onToggleLike?: () => void;
  onToggleSave?: () => void;
  isLiked?: boolean;
  isLiking?: boolean;
  isSaved?: boolean;
  isSaving?: boolean;
}

export function DebateViewer({
  debate,
  turns,
  isLoading,
  onRetry,
  onBack,
  onCreateAnother,
  onToggleLike,
  onToggleSave,
  isLiked = false,
  isLiking = false,
  isSaved = false,
  isSaving = false,
}: DebateViewerProps) {
  const personaA = useMemo(() => getPersonaById(debate?.personaA || ''), [debate?.personaA]);
  const personaB = useMemo(() => getPersonaById(debate?.personaB || ''), [debate?.personaB]);
  const nextTurnNumber = Math.min(6, turns.length + 1);
  const nextSpeaker =
    nextTurnNumber % 2 === 1 ? personaA?.name || 'Persona A' : personaB?.name || 'Persona B';

  if (isLoading || !debate) {
    return (
      <section className="card card-premium">
        <div className="flex items-center gap-3 text-sm text-neutral-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-gold" />
          Preparando debate...
        </div>
      </section>
    );
  }

  if (debate.status === 'error') {
    return (
      <section className="error-state">
        <p className="mb-3 text-sm text-red-300">{debate.error || 'Error al generar el debate.'}</p>
        {onRetry && (
          <button type="button" className="btn-accent" onClick={onRetry}>
            Intentar de nuevo
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="card card-premium">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-neutral-500">Arena IA</p>
            <h2 className="mt-2 text-heading-lg font-display text-white">{debate.topic}</h2>
            <p className="mt-3 text-sm text-neutral-400">
              {personaA?.name || 'Persona A'} vs {personaB?.name || 'Persona B'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {onBack && (
              <button
                type="button"
                className="rounded-lg border border-neutral-700 px-4 py-2 text-[11px] uppercase tracking-[0.15em] text-neutral-300 transition hover:border-neutral-500 hover:text-white"
                onClick={onBack}
              >
                Volver
              </button>
            )}
            {onToggleLike && debate.status === 'done' && (
              <button
                type="button"
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[11px] uppercase tracking-[0.15em] transition ${
                  isLiked
                    ? 'border-red-500/50 bg-red-500/10 text-red-300'
                    : 'border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white'
                } disabled:cursor-not-allowed disabled:opacity-60`}
                onClick={onToggleLike}
                disabled={isLiking}
                aria-pressed={isLiked}
              >
                {isLiking ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
                )}
                {debate.likesCount ?? 0}
              </button>
            )}
            {onToggleSave && debate.status === 'done' && (
              <button
                type="button"
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[11px] uppercase tracking-[0.15em] transition ${
                  isSaved
                    ? 'border-brand-gold/50 bg-brand-gold/10 text-brand-gold'
                    : 'border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white'
                } disabled:cursor-not-allowed disabled:opacity-60`}
                onClick={onToggleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Bookmark size={14} fill={isSaved ? 'currentColor' : 'none'} />
                )}
                {isSaved ? 'Guardado' : 'Guardar'}
              </button>
            )}
            {onCreateAnother && (
              <button type="button" className="btn-accent" onClick={onCreateAnother}>
                Nuevo debate
              </button>
            )}
          </div>
        </div>
      </header>

      {debate.status === 'running' && (
        <div className="card border-brand-gold/25 bg-brand-gold/5">
          <div className="flex items-center gap-2 text-sm text-neutral-200">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-gold" />
            Generando turno {nextTurnNumber} de 6 ({nextSpeaker})
          </div>
          <p className="mt-2 text-xs uppercase tracking-wider text-neutral-500">
            Los mensajes van apareciendo en tiempo real.
          </p>
        </div>
      )}

      {turns.length > 0 && (
        <div className="space-y-3">
          {turns.map((turn) => {
            const left = turn.speaker === 'A';
            const speakerName = left ? personaA?.name : personaB?.name;
            return (
              <article
                key={turn.id || `${turn.speaker}-${turn.idx}`}
                className={`card ${
                  left ? 'border-white/10 bg-white/[0.02]' : 'border-brand-gold/25 bg-brand-gold/5'
                }`}
              >
                <p className="mb-2 text-xs uppercase tracking-wider text-neutral-400">
                  Turno {turn.idx + 1} - {speakerName || `Persona ${turn.speaker}`}
                </p>
                <p className="text-sm leading-relaxed text-neutral-200">{turn.text}</p>
              </article>
            );
          })}
        </div>
      )}

      {debate.status === 'done' && debate.verdict && (
        <section className="card border-brand-gold/35 bg-brand-gold/10">
          <p className="text-xs uppercase tracking-wider text-neutral-500">Veredicto</p>
          <p className="mt-2 text-sm text-white">
            {debate.verdict.winner === 'draw'
              ? 'Resultado: empate'
              : `Ganador: ${
                  debate.verdict.winner === 'A'
                    ? personaA?.name || 'Persona A'
                    : personaB?.name || 'Persona B'
                }`}
          </p>
          <p className="mt-2 text-sm text-neutral-300">{debate.verdict.reason}</p>
          {debate.summary && <p className="mt-4 text-sm text-neutral-400">{debate.summary}</p>}
          {onCreateAnother && (
            <button type="button" className="btn-accent mt-4" onClick={onCreateAnother}>
              Crear otro debate
            </button>
          )}
        </section>
      )}
    </section>
  );
}
