import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import type { ConversationRead, MessageRead } from '@/features/chat/api';
import ChatConversationHeader from '@/features/chat/components/ChatConversationHeader';
import MessageComposer from '@/features/chat/components/MessageComposer';
import MessageThread from '@/features/chat/components/MessageThread';
import type { ConversationOutbox } from '@/features/chat/lib/ConversationOutbox';
import {
  loadClearedConversations,
  restoreConversationLocally,
} from '@/features/chat/lib/clearedConversations';
import { useConversationMessages } from '@/features/chat/hooks/useConversationMessages';
import { useVisibleReadReceipt } from '@/features/chat/hooks/useVisibleReadReceipt';

type Props = {
  conversation: ConversationRead;
  title: string;
  /** The person's photo or the group's icon, for the header. */
  photoURL?: string | null;
  /** Lives with the page, so drafts and sends survive going back to the list. */
  outbox: ConversationOutbox;
  blockedUsers: ReadonlySet<string>;
  onBack: () => void;
};

/**
 * An open conversation: its header, the messages and the composer. On phones it takes the whole
 * screen, over the app header and the bottom bar. Mute, files, search, report and the group options
 * live in the details page the header opens.
 */
export default function ConversationScreen({
  conversation,
  title,
  photoURL,
  outbox,
  blockedUsers,
  onBack,
}: Props) {
  const { user } = useAuth();
  const uid = user?.uid;
  const navigate = useNavigate();
  const conversationId = conversation.id;
  const history = useConversationMessages(conversationId, uid);
  const messages = history.messages;
  const session = useSyncExternalStore(
    outbox.subscribe,
    useCallback(() => outbox.snapshot(uid ?? '', conversationId), [outbox, uid, conversationId]),
  );
  const [visibleReceipt, setVisibleReceipt] = useState<{ key: string; timestamp: number | null }>({
    key: '',
    timestamp: null,
  });
  const receiptKey = JSON.stringify([uid, conversationId]);
  const reading = useVisibleReadReceipt(
    conversationId,
    uid,
    visibleReceipt.key === receiptKey ? visibleReceipt.timestamp : null,
  );
  const reportVisible = useCallback(
    (message: MessageRead | null) => {
      const key = JSON.stringify([uid, conversationId]);
      const timestamp = message?.clientCreatedAt ?? null;
      setVisibleReceipt((previous) =>
        previous.key === key && previous.timestamp === timestamp ? previous : { key, timestamp },
      );
    },
    [uid, conversationId],
  );

  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  // "Limpiar chat local" (in the details) hides the messages up to a moment on this device.
  const [clearedConversations, setClearedConversations] = useState(loadClearedConversations);

  // A search result in the details asks to jump to a message once it is loaded.
  useEffect(() => {
    if (messages.length === 0) return;
    const jumpId = window.sessionStorage.getItem('vinctus:jumpMessageId');
    if (!jumpId) return;
    const target = document.getElementById(`msg-${jumpId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightMessageId(jumpId);
      setTimeout(() => setHighlightMessageId(null), 2000);
    }
    window.sessionStorage.removeItem('vinctus:jumpMessageId');
  }, [conversationId, messages]);

  const openDetails = () => {
    navigate(
      conversation.type === 'group'
        ? `/messages/${conversationId}/group-details`
        : `/messages/${conversationId}/details`,
    );
  };

  const handleSendMessage = (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    void outbox.send(user.uid, conversationId, undefined, user.displayName, user.photoURL);
  };

  const clearedAt = clearedConversations[conversationId];
  const visibleMessages = messages.filter(
    (message) =>
      !blockedUsers.has(message.senderId) &&
      (!clearedAt || message.createdAt.getTime() > clearedAt),
  );

  return (
    // On phones an open conversation takes the whole screen, over the app header and the
    // bottom bar (like Instagram).
    <div className="page-feed fixed inset-0 z-[55] mx-auto flex flex-col bg-bg px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] md:static md:z-auto md:h-[calc(100vh-120px)] md:max-w-3xl md:bg-transparent md:px-0 md:pb-0 md:pt-0">
      <ChatConversationHeader
        conversation={conversation}
        title={title}
        photoURL={photoURL}
        onBack={onBack}
        onOpenDetails={openDetails}
      />

      {history.error && (
        <div role="alert" className="text-sm text-red-400">
          {history.error}{' '}
          <button type="button" onClick={history.retry}>
            Reintentar carga
          </button>
        </div>
      )}
      {reading.error && (
        <div role="alert" className="text-sm text-red-400">
          {reading.error}{' '}
          <button type="button" onClick={reading.retry}>
            Reintentar lectura
          </button>
        </div>
      )}
      <MessageThread
        key={`thread:${receiptKey}`}
        followRequest={session.pending}
        hasMore={history.hasMore}
        loadingOlder={history.loading}
        onLoadOlder={() => {
          void history.loadOlder();
        }}
        onLatestVisible={reportVisible}
        messages={visibleMessages}
        currentUserId={uid}
        highlightMessageId={highlightMessageId}
        clearedAt={clearedAt}
        onRestoreChatLocal={() =>
          setClearedConversations(restoreConversationLocally(conversationId))
        }
        isGroup={conversation.type === 'group'}
      />

      <MessageComposer
        key={`composer:${receiptKey}`}
        value={session.draft}
        onValueChange={(text) => outbox.draft(user!.uid, conversationId, text)}
        files={session.files}
        onFiles={(files) => outbox.add(user!.uid, conversationId, files)}
        onRemove={(id) => outbox.remove(user!.uid, conversationId, id)}
        sending={!!session.pending}
        progress={session.progress}
        failed={session.failed}
        error={session.error}
        onRetry={(message) => {
          void outbox.send(user!.uid, conversationId, message, user!.displayName, user!.photoURL);
        }}
        onDiscard={(id) => outbox.discard(user!.uid, conversationId, id)}
        onSubmit={handleSendMessage}
      />
    </div>
  );
}
