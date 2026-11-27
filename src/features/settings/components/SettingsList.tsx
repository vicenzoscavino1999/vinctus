import type { ReactNode } from 'react';
import { ArrowLeft, ChevronRight, Loader2, type LucideIcon } from 'lucide-react';

/** The back arrow and the page title, like the rest of the redesigned pages. */
export function SettingsHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  return (
    <header className="flex items-center gap-3 pb-6 pt-4">
      <button
        type="button"
        onClick={onBack}
        aria-label="Volver"
        className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <ArrowLeft size={20} />
      </button>
      <div>
        <h1 className="font-display text-display-sm text-white">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
      </div>
    </header>
  );
}

/** A titled block of rows, like iOS settings. */
export function SettingsGroup({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      {title && (
        <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-neutral-500">
          {title}
        </h2>
      )}
      <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
        {children}
      </div>
      {footer && <p className="mt-2 px-1 text-xs leading-relaxed text-neutral-500">{footer}</p>}
    </section>
  );
}

const iconClass = (danger: boolean) => `shrink-0 ${danger ? 'text-red-400' : 'text-neutral-400'}`;

/** A row that opens something: icon, label, an optional line below, and a chevron. */
export function SettingsRow({
  icon: Icon,
  label,
  detail,
  onClick,
  tone = 'default',
  chevron = true,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
  chevron?: boolean;
  disabled?: boolean;
}) {
  const danger = tone === 'danger';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03] disabled:opacity-50"
    >
      <Icon size={19} className={iconClass(danger)} />
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] ${danger ? 'text-red-400' : 'text-white'}`}>
          {label}
        </span>
        {detail && <span className="block text-xs text-neutral-500">{detail}</span>}
      </span>
      {chevron && <ChevronRight size={16} className="shrink-0 text-neutral-600" />}
    </button>
  );
}

/** A row with a switch (`role="switch"`), gold when on. */
export function SettingsSwitch({
  icon: Icon,
  label,
  detail,
  checked,
  onChange,
  disabled = false,
  busy = false,
}: {
  icon?: LucideIcon;
  label: string;
  detail?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled || busy}
      className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {Icon && <Icon size={19} className={iconClass(false)} />}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-white">{label}</span>
        {detail && <span className="block text-xs text-neutral-500">{detail}</span>}
      </span>
      {busy ? (
        <Loader2 size={16} className="shrink-0 animate-spin text-neutral-500" />
      ) : (
        <span
          aria-hidden="true"
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            checked ? 'bg-brand-gold' : 'bg-white/[0.12]'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`}
          />
        </span>
      )}
    </button>
  );
}
