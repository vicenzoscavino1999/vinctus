import { useMemo } from 'react';
import {
  ArrowLeft,
  Bookmark,
  ExternalLink,
  Flag,
  Heart,
  Loader2,
  Share2,
  Trophy,
} from 'lucide-react';
import type { Debate, Turn } from '@/features/arena/types';
import { getPersonaById } from '@/features/arena/types';

interface DebateViewerProps {
  debate: Debate | null;
  turns: Turn[];
  isLoading: boolean;
  notFound?: boolean;
  onRetry?: () => void;
  onBack?: () => void;
  onCreateAnother?: () => void;
  onToggleLike?: () => void;
  onToggleSave?: () => void;
  /** Report the debate's AI content. */
  onReport?: () => void;
  /** Copy the link of a public debate. */
  onShare?: () => void;
  isLiked?: boolean;
  isLiking?: boolean;
  isSaved?: boolean;
  isSaving?: boolean;
}

const TOTAL_TURNS = 6;

const isSafeHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const iconButton =
  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';

export function DebateViewer({
  debate,
  turns,
  isLoading,
  notFound = false,
  onRetry,
  onBack,
  onCreateAnother,
  onToggleLike,
  onToggleSave,
  onReport,
  onShare,
  isLiked = false,
  isLiking = false,
  isSaved = false,
  isSaving = false,
}: DebateViewerProps) {
  const personaA = useMemo(() => getPersonaById(debate?.personaA || ''), [debate?.personaA]);
  const personaB = useMemo(() => getPersonaById(debate?.personaB || ''), [debate?.personaB]);
  const safeSourceLinks = useMemo(
    () =>
      (debate?.sourceLinks ?? []).filter((link) => typeof link === 'string' && isSafeHttpUrl(link)),
    [debate?.sourceLinks],
  );
  const nameA = personaA?.name || 'Persona A';
  const nameB = personaB?.name || 'Persona B';
  const nextTurnNumber = Math.min(TOTAL_TURNS, turns.length + 1);
  const nextSpeaker = nextTurnNumber % 2 === 1 ? nameA : nameB;

  if (notFound && !debate) {
    return (
      <section className="mx-auto max-w-md rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 text-center">
        <p className="text-sm text-neutral-300">
          Este debate no existe o no tienes acceso para verlo.
        </p>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-4 h-10 rounded-xl bg-brand-gold px-5 text-sm font-semibold text-black"
          >
            Volver a Arena
          </button>
        )}
      </section>
    );
  }

  if (isLoading || !debate) {
    return (
      <section className="flex items-center gap-3 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-5 text-sm text-neutral-400">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-gold" />
        Preparando debate...
      </section>
    );
  }

  if (debate.status === 'error') {
    return (
      <section className="rounded-3xl border border-red-500/25 bg-red-500/5 p-5">
        <p className="mb-4 text-sm text-red-300">{debate.error || 'Error al generar el debate.'}</p>
        <div className="flex flex-wrap gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="h-10 rounded-xl bg-brand-gold px-5 text-sm font-semibold text-black"
            >
              Intentar de nuevo
            </button>
          )}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="h-10 rounded-xl border border-white/[0.1] px-5 text-sm text-neutral-200"
            >
              Volver
            </button>
          )}
        </div>
      </section>
    );
  }

  const isDone = debate.status === 'done';

  return (
    <section className="space-y-6">
      <header className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Volver"
              className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <ArrowLeft size={19} />
            </button>
          ) : (
            <span />
          )}
          {onCreateAnother && (
            <button
              type="button"
              onClick={onCreateAnother}
              className="h-9 rounded-full bg-brand-gold px-4 text-xs font-semibold text-black"
            >
              Nuevo debate
            </button>
          )}
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            Arena IA{debate.visibility === 'private' ? ' · Privado' : ''}
          </p>
          <h2 className="mt-2 font-display text-3xl leading-tight text-white">{debate.topic}</h2>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] py-1 pl-1 pr-3 text-neutral-200">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08]">
              {personaA?.avatar ?? 'A'}
            </span>
            {nameA}
          </span>
          <span className="text-xs font-semibold text-neutral-600">VS</span>
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-gold/10 py-1 pl-1 pr-3 text-brand-gold">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-gold/15">
              {personaB?.avatar ?? 'B'}
            </span>
            {nameB}
          </span>
        </div>

        {isDone && (onToggleLike || onToggleSave || onShare || onReport) && (
          <div className="flex flex-wrap gap-2">
            {onToggleLike && (
              <button
                type="button"
                className={`${iconButton} ${
                  isLiked
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : 'border-white/[0.1] text-neutral-300 hover:border-white/25 hover:text-white'
                }`}
                onClick={onToggleLike}
                disabled={isLiking}
                aria-pressed={isLiked}
                aria-label={isLiked ? 'Quitar me gusta' : 'Dar me gusta'}
              >
                {isLiking ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
                )}
                {debate.likesCount ?? 0}
              </button>
            )}
            {onToggleSave && (
              <button
                type="button"
                className={`${iconButton} ${
                  isSaved
                    ? 'border-brand-gold/40 bg-brand-gold/10 text-brand-gold'
                    : 'border-white/[0.1] text-neutral-300 hover:border-white/25 hover:text-white'
                }`}
                onClick={onToggleSave}
                disabled={isSaving}
                aria-pressed={isSaved}
              >
                {isSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Bookmark size={14} fill={isSaved ? 'currentColor' : 'none'} />
                )}
                {isSaved ? 'Guardado' : 'Guardar'}
              </button>
            )}
            {onShare && debate.visibility !== 'private' && (
              <button
                type="button"
                onClick={onShare}
                className={`${iconButton} border-white/[0.1] text-neutral-300 hover:border-white/25 hover:text-white`}
              >
                <Share2 size={14} />
                Compartir
              </button>
            )}
            {onReport && (
              <button
                type="button"
                onClick={onReport}
                aria-label="Reportar debate"
                className={`${iconButton} border-white/[0.1] text-neutral-500 hover:border-white/25 hover:text-white`}
              >
                <Flag size={14} />
              </button>
            )}
          </div>
        )}
      </header>

      {debate.status === 'running' && (
        <div className="rounded-2xl border border-brand-gold/25 bg-brand-gold/5 p-4" role="status">
          <div className="flex items-center gap-2 text-sm text-neutral-200">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-gold" />
            Generando turno {nextTurnNumber} de {TOTAL_TURNS} ({nextSpeaker})
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-brand-gold transition-all duration-700"
              style={{ width: `${(turns.length / TOTAL_TURNS) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Los mensajes van apareciendo en tiempo real.
          </p>
        </div>
      )}

      {turns.length > 0 && (
        <div className="space-y-4">
          {turns.map((turn) => {
            const isA = turn.speaker === 'A';
            const persona = isA ? personaA : personaB;
            const speakerName = isA ? nameA : nameB;
            return (
              <article
                key={turn.id || `${turn.speaker}-${turn.idx}`}
                className={`flex gap-2.5 ${isA ? '' : 'flex-row-reverse'}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${
                    isA ? 'bg-white/[0.08]' : 'bg-brand-gold/15'
                  }`}
                >
                  {persona?.avatar ?? turn.speaker}
                </span>
                <div className={`flex max-w-[85%] flex-col ${isA ? 'items-start' : 'items-end'}`}>
                  <p className="mb-1 px-1 text-[11px] text-neutral-500">
                    {speakerName} · Turno {turn.idx + 1}
                  </p>
                  <p
                    className={`whitespace-pre-wrap rounded-[20px] px-4 py-3 text-[15px] leading-relaxed ${
                      isA
                        ? 'rounded-tl-md bg-white/[0.05] text-neutral-100'
                        : 'rounded-tr-md bg-brand-gold/10 text-neutral-100'
                    }`}
                  >
                    {turn.text}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {isDone && debate.verdict && (
        <section className="rounded-3xl border border-brand-gold/30 bg-gradient-to-b from-brand-gold/10 to-transparent p-5">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-brand-gold">
            <Trophy size={14} />
            Veredicto
          </p>
          <p className="mt-2 font-display text-2xl text-white">
            {debate.verdict.winner === 'draw'
              ? 'Resultado: empate'
              : `Ganador: ${debate.verdict.winner === 'A' ? nameA : nameB}`}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-300">{debate.verdict.reason}</p>
          {debate.summary && (
            <p className="mt-4 border-t border-white/[0.06] pt-4 text-sm leading-relaxed text-neutral-400">
              {debate.summary}
            </p>
          )}
          {safeSourceLinks.length > 0 && (
            <div className="mt-4 border-t border-white/[0.06] pt-3">
              <p className="text-[11px] uppercase tracking-wider text-neutral-500">
                Enlaces mencionados
              </p>
              <ul className="mt-2 space-y-1">
                {safeSourceLinks.map((link) => (
                  <li key={link}>
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 break-all text-xs text-brand-gold hover:underline"
                    >
                      <ExternalLink size={12} />
                      <span>{link}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-[11px] text-neutral-600">
            Generado por IA. Puede contener errores.
          </p>
          {onCreateAnother && (
            <button
              type="button"
              onClick={onCreateAnother}
              className="mt-4 h-10 rounded-xl bg-brand-gold px-5 text-sm font-semibold text-black"
            >
              Crear otro debate
            </button>
          )}
        </section>
      )}
    </section>
  );
}
