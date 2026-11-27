import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import {
  setConversationMute,
  clearConversationMute,
  leaveGroupWithSync,
  createGroupReport,
  type ConversationRead,
  type ConversationMemberRead,
  type FirestoreGroup,
  type MessageRead,
  type UserReportReason,
} from '@/features/chat/api';
import ChatConversationHeader from '@/features/chat/components/ChatConversationHeader';
import ConversationSearchModal from '@/features/chat/components/ConversationSearchModal';
import GroupFilesModal, { type GroupFileItem } from '@/features/chat/components/GroupFilesModal';
import GroupMuteModal from '@/features/chat/components/GroupMuteModal';
import GroupOptionsOverlay from '@/features/chat/components/GroupOptionsOverlay';
import GroupReportModal from '@/features/chat/components/GroupReportModal';
import MessageComposer from '@/features/chat/components/MessageComposer';
import MessageThread from '@/features/chat/components/MessageThread';
import type { ConversationOutbox } from '@/features/chat/lib/ConversationOutbox';
import { useConversationMessages } from '@/features/chat/hooks/useConversationMessages';
import { useVisibleReadReceipt } from '@/features/chat/hooks/useVisibleReadReceipt';

const CLEARED_STORAGE_KEY = 'vinctus:clearedConversations';

const loadClearedConversations = (): Record<string, number> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CLEARED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('Error reading cleared conversations:', error);
    return {};
  }
};

type Props = {
  conversation: ConversationRead;
  title: string;
  /** Lives with the page, so drafts and sends survive going back to the list. */
  outbox: ConversationOutbox;
  blockedUsers: ReadonlySet<string>;
  onBack: () => void;
};

/**
 * An open conversation: its header, the messages, the composer and the group options. On phones it
 * takes the whole screen, over the app header and the bottom bar.
 */
export default function ConversationScreen({
  conversation,
  title,
  outbox,
  blockedUsers,
  onBack,
}: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const conversationId = conversation.id;
  const history = useConversationMessages(conversationId, user?.uid);
  const messages = history.messages;
  const session = useSyncExternalStore(
    outbox.subscribe,
    useCallback(
      () => outbox.snapshot(user?.uid ?? '', conversationId),
      [outbox, user?.uid, conversationId],
    ),
  );
  const [visibleReceipt, setVisibleReceipt] = useState<{ key: string; timestamp: number | null }>({
    key: '',
    timestamp: null,
  });
  const receiptKey = JSON.stringify([user?.uid, conversationId]);
  const reading = useVisibleReadReceipt(
    conversationId,
    user?.uid,
    visibleReceipt.key === receiptKey ? visibleReceipt.timestamp : null,
  );
  const reportVisible = useCallback(
    (message: MessageRead | null) => {
      const key = JSON.stringify([user?.uid, conversationId]);
      const timestamp = message?.clientCreatedAt ?? null;
      setVisibleReceipt((previous) =>
        previous.key === key && previous.timestamp === timestamp ? previous : { key, timestamp },
      );
    },
    [user?.uid, conversationId],
  );

  const [showGroupOptions, setShowGroupOptions] = useState(false);
  const [groupOptionsLoading] = useState(false);
  const [groupOptionsGroup] = useState<FirestoreGroup | null>(null);
  const [groupMemberData, setGroupMemberData] = useState<ConversationMemberRead | null>(null);
  const [showGroupMuteModal, setShowGroupMuteModal] = useState(false);
  const [isTogglingGroupMute, setIsTogglingGroupMute] = useState(false);
  const [showGroupFiles, setShowGroupFiles] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchConversationQuery, setSearchConversationQuery] = useState('');
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [clearedConversations, setClearedConversations] = useState<Record<string, number>>(() =>
    loadClearedConversations(),
  );
  const [showGroupReportModal, setShowGroupReportModal] = useState(false);
  const [groupReportReason, setGroupReportReason] = useState<UserReportReason>('spam');
  const [groupReportDetails, setGroupReportDetails] = useState('');
  const [groupReportError, setGroupReportError] = useState<string | null>(null);
  const [isSubmittingGroupReport, setIsSubmittingGroupReport] = useState(false);

  const updateClearedConversations = useCallback(
    (updater: (prev: Record<string, number>) => Record<string, number>) => {
      setClearedConversations((prev) => {
        const next = updater(prev);
        try {
          window.localStorage.setItem(CLEARED_STORAGE_KEY, JSON.stringify(next));
        } catch (error) {
          console.error('Error saving cleared conversations:', error);
        }
        return next;
      });
    },
    [],
  );

  // A search result elsewhere can ask to jump to a message once it is loaded.
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

  const handleOpenDetails = () => {
    if (conversation.type !== 'direct') return;
    navigate(`/messages/${conversationId}/details`);
  };

  const handleOpenGroupOptions = () => {
    if (conversation.type !== 'group') return;
    navigate(`/messages/${conversationId}/group-details`);
  };

  const handleLeaveGroup = async () => {
    if (!user?.uid || !conversation.groupId) return;
    const groupId = conversation.groupId;

    if (groupOptionsGroup?.ownerId && groupOptionsGroup.ownerId === user.uid) {
      showToast('El propietario no puede salir del grupo.', 'info');
      return;
    }

    const confirmed = window.confirm('¿Seguro que deseas salir del grupo?');
    if (!confirmed) return;

    try {
      await leaveGroupWithSync(groupId, user.uid);
      showToast('Saliste del grupo', 'success');
      setShowGroupOptions(false);
      onBack();
    } catch (error) {
      console.error('Error leaving group:', error);
      showToast('No se pudo salir del grupo.', 'error');
    }
  };

  const handleMuteGroup = async (hours: number | null) => {
    if (!user?.uid) return;
    setIsTogglingGroupMute(true);
    try {
      const mutedUntil = hours ? new Date(Date.now() + hours * 60 * 60 * 1000) : null;
      await setConversationMute(conversationId, user.uid, mutedUntil);
      setGroupMemberData((prev) => (prev ? { ...prev, muted: true, mutedUntil } : null));
      setShowGroupMuteModal(false);
      showToast('Conversacion silenciada', 'success');
    } catch (error) {
      console.error('Error muting group:', error);
      showToast('No se pudo silenciar', 'error');
    } finally {
      setIsTogglingGroupMute(false);
    }
  };

  const handleUnmuteGroup = async () => {
    if (!user?.uid) return;
    setIsTogglingGroupMute(true);
    try {
      await clearConversationMute(conversationId, user.uid);
      setGroupMemberData((prev) => (prev ? { ...prev, muted: false, mutedUntil: null } : null));
      showToast('Silencio desactivado', 'success');
    } catch (error) {
      console.error('Error unmuting group:', error);
      showToast('No se pudo activar el sonido', 'error');
    } finally {
      setIsTogglingGroupMute(false);
    }
  };

  const handleShareGroup = async () => {
    if (!conversation.groupId) return;
    const url = `${window.location.origin}/group/${conversation.groupId}`;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        showToast('Enlace copiado', 'success');
      } else {
        window.prompt('Copia el enlace del grupo:', url);
      }
    } catch (error) {
      console.error('Error copying link:', error);
      window.prompt('Copia el enlace del grupo:', url);
    }
  };

  const getGroupMuteStatusText = () => {
    if (!groupMemberData?.muted) return null;
    if (!groupMemberData.mutedUntil) return 'Silenciado';
    const now = new Date();
    if (groupMemberData.mutedUntil <= now) return null;
    return `Silenciado hasta ${groupMemberData.mutedUntil.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const handleSearchConversation = () => {
    setSearchConversationQuery('');
    setShowSearchModal(true);
  };

  const handleJumpToMessage = (messageId: string) => {
    setShowSearchModal(false);
    setHighlightMessageId(messageId);
    setTimeout(() => setHighlightMessageId(null), 2000);
    const target = document.getElementById(`msg-${messageId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleClearChatLocal = () => {
    const confirmed = window.confirm(
      '¿Limpiar el chat localmente? Esto no borra mensajes del servidor.',
    );
    if (!confirmed) return;
    updateClearedConversations((prev) => ({
      ...prev,
      [conversationId]: Date.now(),
    }));
    showToast('Chat limpiado localmente', 'success');
  };

  const handleRestoreChatLocal = () => {
    updateClearedConversations((prev) => {
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  };

  const resetGroupReportForm = () => {
    setGroupReportReason('spam');
    setGroupReportDetails('');
    setGroupReportError(null);
  };

  const handleSubmitGroupReport = async () => {
    if (!user?.uid || !conversation.groupId) return;
    setIsSubmittingGroupReport(true);
    setGroupReportError(null);
    try {
      await createGroupReport({
        reporterUid: user.uid,
        groupId: conversation.groupId,
        reason: groupReportReason,
        details: groupReportDetails.trim() ? groupReportDetails.trim() : null,
        conversationId,
      });
      showToast('Reporte enviado', 'success');
      setShowGroupReportModal(false);
      resetGroupReportForm();
    } catch (error) {
      console.error('Error reporting group:', error);
      setGroupReportError('No se pudo enviar el reporte.');
    } finally {
      setIsSubmittingGroupReport(false);
    }
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

  const attachmentItems: GroupFileItem[] = visibleMessages.flatMap((msg) =>
    (msg.attachments ?? []).map((attachment) => ({
      messageId: msg.id,
      attachment,
    })),
  );

  return (
    // On phones an open conversation takes the whole screen, over the app header and the
    // bottom bar (like Instagram); the chat's own modals render inside, above it.
    <div className="page-feed fixed inset-0 z-[55] mx-auto flex flex-col bg-bg px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] md:static md:z-auto md:h-[calc(100vh-120px)] md:max-w-3xl md:bg-transparent md:px-0 md:pb-0 md:pt-0">
      <ChatConversationHeader
        conversation={conversation}
        title={title}
        onBack={onBack}
        onOpenDetails={handleOpenDetails}
        onOpenGroupOptions={handleOpenGroupOptions}
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
        currentUserId={user?.uid}
        highlightMessageId={highlightMessageId}
        clearedAt={clearedAt}
        onRestoreChatLocal={handleRestoreChatLocal}
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

      <GroupOptionsOverlay
        open={showGroupOptions && conversation.type === 'group'}
        groupName={groupOptionsGroup?.name || title}
        groupIconUrl={groupOptionsGroup?.iconUrl}
        loading={groupOptionsLoading}
        muted={groupMemberData?.muted ?? false}
        muteStatusText={getGroupMuteStatusText()}
        isTogglingMute={isTogglingGroupMute}
        isOwner={groupOptionsGroup?.ownerId === user?.uid}
        onClose={() => setShowGroupOptions(false)}
        onUnmute={handleUnmuteGroup}
        onOpenMuteModal={() => setShowGroupMuteModal(true)}
        onShare={handleShareGroup}
        onOpenFiles={() => setShowGroupFiles(true)}
        onSearch={handleSearchConversation}
        onOpenReportModal={() => setShowGroupReportModal(true)}
        onClearChatLocal={handleClearChatLocal}
        onViewGroup={() => {
          if (conversation.groupId) {
            navigate(`/group/${conversation.groupId}`);
          }
          setShowGroupOptions(false);
        }}
        onEditGroup={() => {
          if (conversation.groupId) {
            navigate(`/group/${conversation.groupId}/edit`);
          }
          setShowGroupOptions(false);
        }}
        onLeaveGroup={handleLeaveGroup}
      />

      <ConversationSearchModal
        open={showSearchModal}
        query={searchConversationQuery}
        messages={visibleMessages}
        currentUserId={user?.uid}
        onClose={() => setShowSearchModal(false)}
        onQueryChange={setSearchConversationQuery}
        onJumpToMessage={handleJumpToMessage}
      />

      <GroupReportModal
        open={showGroupReportModal}
        reason={groupReportReason}
        details={groupReportDetails}
        error={groupReportError}
        isSubmitting={isSubmittingGroupReport}
        onClose={() => {
          setShowGroupReportModal(false);
          resetGroupReportForm();
        }}
        onReasonChange={setGroupReportReason}
        onDetailsChange={setGroupReportDetails}
        onSubmit={handleSubmitGroupReport}
      />

      <GroupMuteModal
        open={showGroupMuteModal}
        isToggling={isTogglingGroupMute}
        onClose={() => setShowGroupMuteModal(false)}
        onMute={handleMuteGroup}
      />

      <GroupFilesModal
        open={showGroupFiles}
        items={attachmentItems}
        onClose={() => setShowGroupFiles(false)}
      />
    </div>
  );
}
