import { Users } from 'lucide-react';
import type { ConversationRead, FirestoreGroup } from '@/features/chat/api';
import { inboxPreview, inboxTime, initialsOf } from '@/features/chat/model/inbox';

/** A round photo, a group's icon, or initials when there is neither. */
export function InboxAvatar({
  name,
  photoURL,
  isGroup,
}: {
  name: string;
  photoURL: string | null | undefined;
  isGroup: boolean;
}) {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.04]">
      {photoURL ? (
        <img src={photoURL} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : isGroup ? (
        <Users size={20} className="text-neutral-500" aria-hidden="true" />
      ) : (
        <span className="text-sm font-medium text-brand-gold/80">{initialsOf(name)}</span>
      )}
    </div>
  );
}

type RowProps = {
  conversation: ConversationRead;
  name: string;
  nameReady: boolean;
  photoURL: string | null;
  uid: string | null;
  onSelect: () => void;
};

/** One conversation: who, when, and the last message in one line. */
export function InboxRow({ conversation, name, nameReady, photoURL, uid, onSelect }: RowProps) {
  const isGroup = conversation.type === 'group';
  const time = inboxTime(conversation.lastMessage?.createdAt ?? null);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.04] focus-visible:outline-none"
    >
      <InboxAvatar name={name} photoURL={photoURL} isGroup={isGroup} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          {nameReady ? (
            <span className="truncate text-[15px] font-medium text-white">{name}</span>
          ) : (
            <span className="skeleton h-4 w-32 rounded" aria-label="Cargando nombre" />
          )}
          {time && <span className="shrink-0 text-xs text-neutral-500">{time}</span>}
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-neutral-500">
          {isGroup && (
            <>
              <Users size={12} className="shrink-0" aria-hidden="true" />
              <span className="sr-only">Grupo.</span>
            </>
          )}
          <span className="truncate">{inboxPreview(conversation, uid)}</span>
        </p>
      </div>
    </button>
  );
}

type GroupRowProps = {
  group: FirestoreGroup;
  onNavigateGroup: () => void;
  onOpenChat: () => void;
};

/** A group you belong to: the row opens the group, the button its chat. */
export function MemberGroupRow({ group, onNavigateGroup, onOpenChat }: GroupRowProps) {
  const members = group.memberCount ?? 0;
  return (
    <div className="flex items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-white/[0.04]">
      <button
        type="button"
        onClick={onNavigateGroup}
        aria-label={`Ver grupo ${group.name}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
      >
        <InboxAvatar name={group.name} photoURL={group.iconUrl} isGroup />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-white">{group.name}</p>
          <p className="truncate text-sm text-neutral-500">
            {members === 1 ? '1 miembro' : `${members.toLocaleString('es-ES')} miembros`}
            {group.description ? ` · ${group.description}` : ''}
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={onOpenChat}
        className="shrink-0 rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-white/30 hover:text-white"
      >
        Abrir chat
      </button>
    </div>
  );
}
