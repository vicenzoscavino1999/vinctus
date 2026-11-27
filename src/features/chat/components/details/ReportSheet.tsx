import { useState } from 'react';
import type { UserReportReason } from '@/features/chat/api';
import { REPORT_REASONS } from '@/features/chat/model/chatDetails';
import { LEGAL_COPY, LEGAL_LINKS } from '@/shared/constants';
import { LIMITS } from '@/shared/lib/firestore/firestoreContract';
import { ChatSheet } from './ChatSheet';

/** Reason, optional details and the moderation notice; "Enviar reporte" calls `onSubmit`. */
export default function ReportSheet({
  title,
  onSubmit,
  onClose,
}: {
  title: string;
  /** Rejects if the report could not be sent. */
  onSubmit: (reason: UserReportReason, details: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<UserReportReason>('spam');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      await onSubmit(reason, details.trim() || null);
    } catch (problem) {
      console.error('Error sending the report:', problem);
      setError('No se pudo enviar el reporte.');
      setSending(false);
    }
  };

  return (
    <ChatSheet title={title} onClose={onClose}>
      <div role="radiogroup" aria-label="Motivo" className="flex flex-wrap gap-2">
        {REPORT_REASONS.map((option) => {
          const selected = option.value === reason;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setReason(option.value)}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                selected
                  ? 'border-white bg-white text-black'
                  : 'border-white/[0.1] text-neutral-300 hover:border-white/25'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <textarea
        value={details}
        onChange={(event) => setDetails(event.target.value)}
        rows={3}
        maxLength={LIMITS.reports.detailsMaxLength}
        aria-label="Detalles (opcional)"
        placeholder="Cuéntanos qué pasó (opcional)"
        className="mt-4 w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-sm text-white placeholder:text-neutral-500 focus:border-white/20 focus:outline-none"
      />
      <p className="mt-1 text-right text-[11px] text-neutral-600">
        {details.length}/{LIMITS.reports.detailsMaxLength}
      </p>

      <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-neutral-500">
        <p>{LEGAL_COPY.moderationNotice}</p>
        <p className="flex flex-wrap gap-x-3">
          <a
            href={LEGAL_LINKS.communityGuidelinesPublicUrl}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-300 underline underline-offset-2"
          >
            Normas de la comunidad
          </a>
          <a
            href={`mailto:${LEGAL_LINKS.securityEmail}`}
            className="text-neutral-300 underline underline-offset-2"
          >
            Reporte urgente: {LEGAL_LINKS.securityEmail}
          </a>
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}

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
          onClick={() => void submit()}
          disabled={sending}
          className="h-11 flex-1 rounded-xl bg-red-500 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {sending ? 'Enviando…' : 'Enviar reporte'}
        </button>
      </div>
    </ChatSheet>
  );
}
