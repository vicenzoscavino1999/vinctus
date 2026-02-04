import { Users } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { FirestoreGroup } from '@/features/chat/api';

type Props = {
  group: FirestoreGroup;
  members: number;
  postsWeek: number;
  onNavigateGroup: () => void;
  onOpenChat: () => void;
};

const MemberGroupCard = ({ group, members, postsWeek, onNavigateGroup, onOpenChat }: Props) => {
  const handleChatClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenChat();
  };

  const handleViewGroupClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onNavigateGroup();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onNavigateGroup();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onNavigateGroup}
      onKeyDown={handleKeyDown}
      className="bg-surface-1 border border-neutral-800/50 rounded-lg p-5 cursor-pointer hover:border-neutral-700/70 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center overflow-hidden">
            {group.iconUrl ? (
              <img src={group.iconUrl} alt={group.name} className="w-full h-full object-cover" />
            ) : (
              <Users size={20} className="text-neutral-500" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-white font-medium text-lg truncate">{group.name}</h3>
            <p className="text-neutral-500 text-sm mt-1 line-clamp-2">
              {group.description || 'Sin descripcion.'}
            </p>
          </div>
        </div>
        <button
          onClick={handleChatClick}
          className="px-3 py-1.5 rounded text-xs bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
        >
          Chat
        </button>
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-neutral-800/50 mt-4">
        <div className="text-neutral-500 text-xs">
          {members.toLocaleString('es-ES')} miembros - {postsWeek} posts/semana
        </div>
        <button
          onClick={handleViewGroupClick}
          className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          Ver grupo
        </button>
      </div>
    </div>
  );
};

export default MemberGroupCard;
