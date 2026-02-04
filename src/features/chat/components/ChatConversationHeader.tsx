import { ArrowLeft, Users } from 'lucide-react';
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
  return (
    <div className="flex items-center gap-4 py-4 border-b border-neutral-800/50">
      <button
        onClick={onBack}
        className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={20} />
      </button>
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 flex items-center justify-center">
        <Users size={18} className="text-amber-500" />
      </div>
      {conversation.type === 'direct' ? (
        <button
          type="button"
          onClick={onOpenDetails}
          aria-label="Ver detalles del chat"
          className="flex-1 text-left hover:opacity-80 transition-opacity cursor-pointer"
        >
          <h2 className="text-white font-medium">{title}</h2>
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpenGroupOptions}
          aria-label="Opciones del grupo"
          className="flex-1 text-left hover:opacity-80 transition-opacity cursor-pointer"
        >
          <h2 className="text-white font-medium">{title}</h2>
          <span className="text-xs text-neutral-500">Grupo</span>
        </button>
      )}
    </div>
  );
};

export default ChatConversationHeader;
