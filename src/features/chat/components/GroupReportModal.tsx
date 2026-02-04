import { X } from 'lucide-react';
import type { UserReportReason } from '@/features/chat/api';

const REPORT_REASON_OPTIONS: Array<{ value: UserReportReason; label: string }> = [
  { value: 'spam', label: 'Spam o publicidad' },
  { value: 'harassment', label: 'Acoso' },
  { value: 'abuse', label: 'Abuso' },
  { value: 'fake', label: 'Suplantacion' },
  { value: 'other', label: 'Otro' },
];

type Props = {
  open: boolean;
  reason: UserReportReason;
  details: string;
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onReasonChange: (value: UserReportReason) => void;
  onDetailsChange: (value: string) => void;
  onSubmit: () => void;
};

const GroupReportModal = ({
  open,
  reason,
  details,
  error,
  isSubmitting,
  onClose,
  onReasonChange,
  onDetailsChange,
  onSubmit,
}: Props) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h3 className="text-lg font-medium text-white">Reportar grupo</h3>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
              Motivo
            </label>
            <select
              value={reason}
              onChange={(event) => onReasonChange(event.target.value as UserReportReason)}
              className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500/50 transition-colors"
            >
              {REPORT_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
              Detalles (opcional)
            </label>
            <textarea
              value={details}
              onChange={(event) => onDetailsChange(event.target.value)}
              rows={4}
              maxLength={2000}
              className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-red-500/50 transition-colors resize-none"
              placeholder="Describe el motivo del reporte"
            />
            <div className="flex justify-end text-xs text-neutral-600 mt-1">
              {details.length}/2000
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-neutral-300 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar reporte'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GroupReportModal;
