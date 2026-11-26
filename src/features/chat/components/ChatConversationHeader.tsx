import { ArrowLeft, Info, Users } from 'lucide-react';
import type { ConversationRead } from '@/features/chat/api';

type Props = {
  conversation: ConversationRead;
  title: string;
  onBack: () => void;
  onOpenDetails: () => void;
  onOpenGroupOptions: () => void;
};

const ChatConversationHeader = ({
  conversation,
  title,
  onBack,
  onOpenDetails,
  onOpenGroupOptions,
}: Props) => {
  const isGroup = conversation.type !== 'direct';
  const openInfo = isGroup ? onOpenGroupOptions : onOpenDetails;
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-neutral-900 py-2.5">
      <button
        type="button"
        aria-label="Volver a conversaciones"
        onClick={onBack}
        className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white"
      >
        <ArrowLeft size={20} />
      </button>
      <button
        type="button"
        onClick={openInfo}
        aria-label={isGroup ? 'Opciones del grupo' : 'Ver detalles del chat'}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition-opacity hover:opacity-80"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-gold/30 bg-gradient-to-br from-amber-500/20 to-amber-600/10">
          {isGroup ? (
            <Users size={18} className="text-brand-gold" />
          ) : (
            <span className="font-serif text-lg text-brand-gold">
              {title.trim().charAt(0).toUpperCase() || '?'}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-white">{title}</h2>
          <span className="block truncate text-xs text-neutral-500">
            {isGroup ? 'Grupo · toca para ver opciones' : 'Toca para ver detalles'}
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={openInfo}
        aria-hidden="true"
        tabIndex={-1}
        className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-white"
      >
        <Info size={20} />
      </button>
    </div>
  );
};

export default ChatConversationHeader;
