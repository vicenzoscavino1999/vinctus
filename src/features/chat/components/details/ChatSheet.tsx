import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { MUTE_OPTIONS } from '@/features/chat/model/chatDetails';

type SheetProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/** A bottom sheet on phones and a centered panel on wider screens, like the comments sheet. */
export function ChatSheet({ title, onClose, children }: SheetProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-bg pb-[env(safe-area-inset-bottom)] md:max-w-md md:rounded-3xl md:pb-0"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/15 md:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-3">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

type ConfirmProps = {
  title: string;
  message: string;
  confirmLabel: string;
  busyLabel?: string;
  tone?: 'danger' | 'gold';
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** A question with Cancelar and one action, instead of the browser's confirm(). */
export function ConfirmSheet({
  title,
  message,
  confirmLabel,
  busyLabel = 'Procesando…',
  tone = 'danger',
  busy = false,
  onConfirm,
  onClose,
}: ConfirmProps) {
  return (
    <ChatSheet title={title} onClose={onClose}>
      <p className="text-sm leading-relaxed text-neutral-400">{message}</p>
      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="h-11 flex-1 rounded-xl border border-white/[0.1] text-sm font-medium text-neutral-200 transition-colors hover:bg-white/[0.04]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`h-11 flex-1 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50 ${
            tone === 'danger' ? 'bg-red-500 text-white' : 'bg-brand-gold text-black'
          }`}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </ChatSheet>
  );
}

/** "Silenciar": 1, 4 or 8 hours, or until it is turned back on. */
export function MuteSheet({
  busy,
  onMute,
  onClose,
}: {
  busy: boolean;
  onMute: (hours: number | null) => void;
  onClose: () => void;
}) {
  return (
    <ChatSheet title="Silenciar conversación" onClose={onClose}>
      <p className="mb-3 text-sm text-neutral-500">No recibirás notificaciones de este chat.</p>
      <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
        {MUTE_OPTIONS.map((option) => (
          <button
            key={option.label}
            type="button"
            disabled={busy}
            onClick={() => onMute(option.hours)}
            className="block w-full px-4 py-3.5 text-left text-[15px] text-white transition-colors hover:bg-white/[0.04] disabled:opacity-50"
          >
            {option.label}
          </button>
        ))}
      </div>
    </ChatSheet>
  );
}
