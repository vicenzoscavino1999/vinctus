import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, X } from 'lucide-react';
import { getOrCreateGroupConversation, type FirestoreGroup } from '@/features/chat/api';
import { InboxRow, MemberGroupRow } from '@/features/chat/components/InboxRows';
import type { Inbox } from '@/features/chat/hooks/useInbox';
import {
  filterInbox,
  INBOX_FILTERS,
  matchesQuery,
  type InboxFilter,
} from '@/features/chat/model/inbox';
import CreateGroupModal from '@/features/groups/components/CreateGroupModal';
import { useToast } from '@/shared/ui/Toast';

type Props = {
  uid: string | null;
  inbox: Inbox;
  onSelect: (conversationId: string) => void;
};

const EMPTY_TEXT: Record<InboxFilter, string> = {
  all: 'Aún no tienes conversaciones. Entra al perfil de alguien y toca Mensaje; los chats de tus grupos también aparecen aquí.',
  direct: 'Aún no tienes mensajes privados.',
  group: 'Aún no hay chats de grupo.',
};

/**
 * Mensajes: every conversation, newest first, with a search and Todos · Privados · Grupos. Under
 * Grupos, the groups you belong to, to open their page or their chat.
 */
export default function InboxView({ uid, inbox, onSelect }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [query, setQuery] = useState('');
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  const rows = useMemo(
    () =>
      filterInbox(inbox.conversations, {
        filter,
        query,
        nameOf: inbox.nameOf,
        isHidden: inbox.isHidden,
      }),
    [inbox.conversations, inbox.nameOf, inbox.isHidden, filter, query],
  );
  const groups = useMemo(
    () => inbox.memberGroups.filter((group) => matchesQuery(group.name, query)),
    [inbox.memberGroups, query],
  );

  const openGroupChat = async (group: FirestoreGroup) => {
    if (!uid) {
      showToast('Inicia sesion para abrir el chat', 'info');
      return;
    }
    try {
      onSelect(await getOrCreateGroupConversation(group.id, uid));
    } catch (openError) {
      console.error('Error opening group chat:', openError);
      showToast('No se pudo abrir el chat del grupo', 'error');
    }
  };

  return (
    <div className="page-feed mx-auto max-w-3xl pb-28 pt-6 md:pt-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-light text-white">Mensajes</h1>
        <button
          type="button"
          onClick={() => setIsCreateGroupOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-button bg-brand-gold px-3.5 py-1.5 text-xs font-medium uppercase tracking-wider text-black transition-opacity hover:opacity-90"
        >
          <Plus size={14} />
          Crear grupo
        </button>
      </header>

      <label className="mb-4 flex h-12 items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 transition-colors focus-within:border-white/25">
        <Search size={18} className="shrink-0 text-neutral-500" />
        <input
          type="text"
          aria-label="Buscar conversaciones"
          placeholder="Buscar conversaciones o grupos"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-neutral-500 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Limpiar búsqueda"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </label>

      <div role="group" aria-label="Filtrar conversaciones" className="mb-4 flex gap-2">
        {INBOX_FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={filter === option.id}
            onClick={() => setFilter(option.id)}
            className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
              filter === option.id
                ? 'bg-white text-black'
                : 'bg-white/[0.05] text-neutral-400 hover:bg-white/[0.09] hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {inbox.status === 'loading' ? (
        <div role="status" aria-label="Cargando conversaciones" className="-mx-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="flex items-center gap-3 px-2 py-3" aria-hidden="true">
              <div className="skeleton h-12 w-12 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-40 rounded" />
                <div className="skeleton h-3 w-56 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : inbox.status === 'error' && rows.length === 0 ? (
        <p className="rounded-2xl border border-white/[0.06] px-4 py-6 text-center text-sm text-red-300">
          {inbox.error}
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/[0.08] px-4 py-6 text-center text-sm text-neutral-500">
          {query.trim() ? 'No hay resultados.' : EMPTY_TEXT[filter]}
        </p>
      ) : (
        <ul className="-mx-2">
          {rows.map((conversation) => (
            <li key={conversation.id}>
              <InboxRow
                conversation={conversation}
                name={inbox.nameOf(conversation)}
                nameReady={inbox.isNameReady(conversation)}
                photoURL={inbox.photoOf(conversation)}
                uid={uid}
                onSelect={() => onSelect(conversation.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {filter === 'group' && (
        <section aria-labelledby="inbox-member-groups" className="mt-10">
          <h2
            id="inbox-member-groups"
            className="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500"
          >
            Tus grupos
          </h2>
          {inbox.memberGroupsStatus === 'loading' && inbox.memberGroups.length === 0 ? (
            <p className="py-4 text-sm text-neutral-500">Cargando grupos…</p>
          ) : inbox.memberGroupsError ? (
            <p className="py-4 text-sm text-red-300">{inbox.memberGroupsError}</p>
          ) : groups.length === 0 ? (
            <p className="py-4 text-sm text-neutral-500">
              {query.trim() ? 'Ningún grupo coincide.' : 'Aún no tienes grupos.'}
            </p>
          ) : (
            <ul className="-mx-2">
              {groups.map((group) => (
                <li key={group.id}>
                  <MemberGroupRow
                    group={group}
                    onNavigateGroup={() => navigate(`/group/${group.id}`)}
                    onOpenChat={() => void openGroupChat(group)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <CreateGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        onCreated={(groupId) => {
          setIsCreateGroupOpen(false);
          void inbox.addCreatedGroup(groupId);
        }}
      />
    </div>
  );
}
