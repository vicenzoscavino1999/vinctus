import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import ConversationScreen from '@/features/chat/components/ConversationScreen';
import InboxView from '@/features/chat/components/InboxView';
import { useInbox } from '@/features/chat/hooks/useInbox';
import { ConversationOutbox } from '@/features/chat/lib/ConversationOutbox';

/**
 * Mensajes. `?conversation=<id>` opens that conversation; without it, the inbox. The data lives in
 * useInbox; the outbox lives here, so drafts and sends survive going back to the list.
 */
export default function MessagesPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('conversation');
  const inbox = useInbox(uid, selectedId);
  const [outbox] = useState(() => new ConversationOutbox());

  const select = useCallback(
    (conversationId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('conversation', conversationId);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const backToList = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('conversation');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const active = selectedId ? inbox.conversationFor(selectedId) : null;
  const activeIsHidden = active ? inbox.isHidden(active) : false;

  // A direct chat with someone you blocked closes.
  useEffect(() => {
    if (activeIsHidden) backToList();
  }, [activeIsHidden, backToList]);

  if (active && inbox.status === 'loading') {
    return (
      <div className="page-feed mx-auto max-w-3xl pt-6">
        <div className="py-20 text-center text-neutral-500">Cargando conversaciones...</div>
      </div>
    );
  }

  if (active) {
    return (
      <ConversationScreen
        key={active.id}
        conversation={active}
        title={inbox.nameOf(active)}
        outbox={outbox}
        blockedUsers={inbox.blockedUsers}
        onBack={backToList}
      />
    );
  }

  return <InboxView uid={uid} inbox={inbox} onSelect={select} />;
}
