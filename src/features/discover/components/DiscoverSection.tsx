import { useId, type ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  /** Right side of the heading, e.g. "Ver todo". */
  action?: ReactNode;
  children: ReactNode;
};

/** One block of Discover: a serif heading with an optional action, then its content. */
export default function DiscoverSection({ title, subtitle, action, children }: Props) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="animate-in fade-in duration-300">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="font-display text-[1.375rem] leading-tight text-white md:text-2xl"
          >
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
        </div>
        {action && (
          <div className="flex shrink-0 items-center gap-2 has-[input]:w-full md:has-[input]:w-auto">
            {action}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

/** A quiet text action for a section heading ("Ver todo", "Ir a Arena"). */
export function SectionLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-2 py-1 text-sm font-semibold text-brand-gold transition-colors hover:text-brand-gold-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-gold/60"
    >
      {children}
    </button>
  );
}

/** Inline message for a section that failed to load, with a retry. */
export function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-surface-overlay px-4 py-3.5">
      <p className="text-sm text-neutral-400">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-white/30 hover:text-white"
      >
        Reintentar
      </button>
    </div>
  );
}

/** Calm empty state for a section. */
export function SectionEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-white/[0.08] px-4 py-6 text-center text-sm text-neutral-500">
      {children}
    </p>
  );
}
