import { X } from 'lucide-react';
import type { MessageRead } from '@/features/chat/api';

type Props = {
  open: boolean;
  query: string;
  messages: MessageRead[];
  currentUserId: string | null | undefined;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onJumpToMessage: (messageId: string) => void;
};

const ConversationSearchModal = ({
  open,
  query,
  messages,
  currentUserId,
  onClose,
  onQueryChange,
  onJumpToMessage,
}: Props) => {
  if (!open) return null;

  const trimmed = query.trim();
  const lowered = trimmed.toLowerCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-area-inset">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h3 className="text-lg font-medium text-white">Buscar en la conversacion</h3>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Escribe para buscar..."
            className="w-full bg-neutral-800/60 border border-neutral-700 rounded-lg px-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/60 transition-colors"
          />
          <div className="max-h-[45vh] overflow-y-auto space-y-2">
            {trimmed === '' ? (
              <div className="text-sm text-neutral-500 text-center py-8">
                Escribe un termino para buscar.
              </div>
            ) : (
              messages
                .filter((msg) => msg.text.toLowerCase().includes(lowered))
                .map((msg) => (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => onJumpToMessage(msg.id)}
                    className="w-full text-left p-3 rounded-xl bg-neutral-900/40 border border-neutral-800/60 hover:bg-neutral-800/60 transition-colors"
                  >
                    <p className="text-sm text-white truncate">{msg.text}</p>
                    <p className="text-xs text-neutral-500 mt-1">
                      {msg.senderId === currentUserId ? 'Tu' : 'Miembro'} Â·{' '}
                      {new Date(msg.createdAt).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </button>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversationSearchModal;
