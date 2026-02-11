import { X } from 'lucide-react';

type Props = {
  open: boolean;
  isToggling: boolean;
  onClose: () => void;
  onMute: (hours: number | null) => void;
};

const GroupMuteModal = ({ open, isToggling, onClose, onMute }: Props) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-area-inset">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h3 className="text-lg font-medium text-white">Silenciar grupo</h3>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-2">
          <button
            onClick={() => onMute(1)}
            disabled={isToggling}
            className="w-full p-3 text-left text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
          >
            1 hora
          </button>
          <button
            onClick={() => onMute(4)}
            disabled={isToggling}
            className="w-full p-3 text-left text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
          >
            4 horas
          </button>
          <button
            onClick={() => onMute(8)}
            disabled={isToggling}
            className="w-full p-3 text-left text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
          >
            8 horas
          </button>
          <button
            onClick={() => onMute(null)}
            disabled={isToggling}
            className="w-full p-3 text-left text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
          >
            Para siempre
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupMuteModal;
