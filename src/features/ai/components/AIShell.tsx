import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { LEGAL_COPY } from '@/shared/constants';
import { AIModeTabs } from './AIModeTabs';

/** The title, a short line, Chat · Arena, and an optional action at the right. */
export function AIHeader({
  title,
  subtitle,
  active,
  action,
}: {
  title: string;
  subtitle: string;
  active: 'chat' | 'arena';
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 pb-5 pt-6 md:pt-10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-gold/15 text-brand-gold">
            <Sparkles size={19} />
          </div>
          <div>
            <h1 className="font-display text-display-sm text-white">{title}</h1>
            <p className="text-sm text-neutral-500">{subtitle}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="self-start">
        <AIModeTabs active={active} />
      </div>
    </header>
  );
}

/**
 * Asked once before the first message: what is sent and to whom, with Aceptar y continuar,
 * Reintentar when the check failed, and the way to manage it in Settings.
 */
export function AIConsentCard({
  saving,
  error,
  onAccept,
  onRetry,
}: {
  saving: boolean;
  error: string | null;
  onAccept: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="mx-auto mt-4 max-w-lg rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gold/15 text-brand-gold">
        <ShieldCheck size={22} />
      </div>
      <h2 className="font-display text-2xl text-white">Antes de usar la IA</h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-400">{LEGAL_COPY.aiConsent}</p>
      <p className="mt-2 text-xs leading-relaxed text-neutral-500">{LEGAL_COPY.aiDisclosure}</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={saving}
          className="h-11 rounded-xl bg-brand-gold text-sm font-semibold text-black transition-opacity disabled:opacity-60"
        >
          {saving ? 'Guardando...' : 'Aceptar y continuar'}
        </button>
        {error && (
          <button
            type="button"
            onClick={onRetry}
            disabled={saving}
            className="h-11 rounded-xl border border-white/[0.1] text-sm text-neutral-200 disabled:opacity-60"
          >
            Reintentar
          </button>
        )}
      </div>
      <p className="mt-4 text-xs text-neutral-500">
        <Link to="/settings" className="underline underline-offset-2 hover:text-neutral-300">
          Gestionar en Ajustes
        </Link>
        {' · '}
        <Link to="/legal/privacy" className="underline underline-offset-2 hover:text-neutral-300">
          Política de privacidad
        </Link>
      </p>
    </section>
  );
}

/** A consent recorded on this device that could not be checked against the server. */
export function AIConsentWarning({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-100">
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full border border-amber-400/50 px-3 py-1 hover:border-amber-300"
      >
        Reintentar
      </button>
    </div>
  );
}

/** The providers notice and the privacy policy, as one quiet line. */
export function AIDisclosure() {
  return (
    <p className="text-center text-[11px] leading-relaxed text-neutral-600">
      {LEGAL_COPY.aiDisclosure}{' '}
      <Link to="/legal/privacy" className="underline underline-offset-2 hover:text-neutral-400">
        Ver política de privacidad
      </Link>
    </p>
  );
}
