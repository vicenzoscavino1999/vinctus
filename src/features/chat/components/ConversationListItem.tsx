import { ChevronRight, Users } from 'lucide-react';
import type { ConversationRead } from '@/features/chat/api';
import { formatRelativeTime } from '@/shared/lib/formatUtils';

// formatRelativeTime imported from @/shared/lib/formatUtils

type Props = {
  conversation: ConversationRead;
  name: string;
  groupIconUrl: string | null | undefined;
  onSelect: () => void;
};

const ConversationListItem = ({ conversation, name, groupIconUrl, onSelect }: Props) => {
  const lastMessageTime = conversation.lastMessage?.createdAt
    ? formatRelativeTime(new Date(conversation.lastMessage.createdAt))
    : '';

  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all group"
    >
      {/* Icon */}
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-neutral-800 to-neutral-900 border border-neutral-700/50 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {groupIconUrl ? (
          <img src={groupIconUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <Users size={22} className="text-neutral-500" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-white font-medium truncate">{name}</span>
          {conversation.type === 'group' && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-neutral-800/80 text-neutral-400 text-xs rounded-full">
              <Users size={10} />
              Grupo
            </span>
          )}
        </div>
        {conversation.lastMessage && (
          <p className="text-neutral-500 text-sm truncate">{conversation.lastMessage.text}</p>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {lastMessageTime && <span className="text-neutral-500 text-sm">{lastMessageTime}</span>}
        <ChevronRight
          size={18}
          className="text-neutral-600 group-hover:text-neutral-400 transition-colors"
        />
      </div>
    </button>
  );
};

export default ConversationListItem;
