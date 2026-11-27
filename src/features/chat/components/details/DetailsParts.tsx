import type { ReactNode } from 'react';
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react';

/** The back arrow (to the conversation) and the page title. */
export function DetailsHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Volver al chat"
        className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <ArrowLeft size={20} />
      </button>
      <h1 className="text-[15px] font-semibold text-white">{title}</h1>
    </div>
  );
}

/** The photo (round for a person, rounded square for a group), the name and a line below. */
export function DetailsHero({
  name,
  photoURL,
  shape,
  subtitle,
  status,
}: {
  name: string;
  photoURL?: string | null;
  shape: 'person' | 'group';
  subtitle?: string | null;
  /** "Silenciado hasta las 14:30", in amber. */
  status?: string | null;
}) {
  const rounded = shape === 'person' ? 'rounded-full' : 'rounded-[26px]';
  return (
    <div className="flex flex-col items-center pb-6 pt-4 text-center">
      <div
        className={`h-[88px] w-[88px] overflow-hidden ${rounded} border border-white/[0.08] bg-neutral-900`}
      >
        {photoURL ? (
          <img src={photoURL} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-3xl text-neutral-400">
            {name.trim().charAt(0).toUpperCase() || '?'}
          </div>
        )}
      </div>
      <h2 className="mt-4 font-display text-2xl text-white">{name}</h2>
      {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      {status && <p className="mt-2 text-xs font-medium text-amber-400/90">{status}</p>}
    </div>
  );
}

/** A round shortcut under the hero, like Instagram's: Perfil, Silenciar, Buscar. */
export function QuickAction({
  icon: Icon,
  label,
  ariaLabel,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  ariaLabel?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      className="group flex w-20 flex-col items-center gap-1.5 disabled:opacity-50"
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
          active
            ? 'bg-brand-gold/15 text-brand-gold'
            : 'bg-white/[0.06] text-neutral-200 group-hover:bg-white/[0.1]'
        }`}
      >
        <Icon size={20} />
      </span>
      <span className={`text-xs ${active ? 'text-brand-gold' : 'text-neutral-400'}`}>{label}</span>
    </button>
  );
}

export function QuickActions({ children }: { children: ReactNode }) {
  return <div className="mb-8 flex justify-center gap-4">{children}</div>;
}

/** Rows grouped in one rounded block, like iOS settings. */
export function ActionList({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      {children}
    </div>
  );
}

export function ActionRow({
  icon: Icon,
  label,
  detail,
  value,
  tone = 'default',
  disabled = false,
  chevron = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  /** A short line under the label. */
  detail?: string;
  /** Shown at the right, like a count. */
  value?: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  chevron?: boolean;
  onClick: () => void;
}) {
  const danger = tone === 'danger';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03] disabled:opacity-50"
    >
      <Icon size={19} className={`shrink-0 ${danger ? 'text-red-400' : 'text-neutral-400'}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] ${danger ? 'text-red-400' : 'text-white'}`}>
          {label}
        </span>
        {detail && <span className="block text-xs text-neutral-500">{detail}</span>}
      </span>
      {value && <span className="text-sm text-neutral-500">{value}</span>}
      {chevron && <ChevronRight size={16} className="shrink-0 text-neutral-600" />}
    </button>
  );
}

/** The centered states: loading, or an error with the way back. */
export function DetailsState({ message, onBack }: { message: string | null; onBack: () => void }) {
  return (
    <div className="page-feed mx-auto max-w-xl pt-6">
      <DetailsHeader title="Detalles" onBack={onBack} />
      {message ? (
        <div className="py-20 text-center">
          <p className="mb-6 text-neutral-400">{message}</p>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-white/[0.1] px-5 py-2.5 text-sm text-white transition-colors hover:bg-white/[0.04]"
          >
            Volver
          </button>
        </div>
      ) : (
        <div className="flex justify-center py-20" role="status" aria-label="Cargando detalles">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
        </div>
      )}
    </div>
  );
}
