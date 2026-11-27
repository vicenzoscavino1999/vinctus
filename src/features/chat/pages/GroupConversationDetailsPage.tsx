import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Bell,
  BellOff,
  Eraser,
  ExternalLink,
  Flag,
  Images,
  LogOut,
  Pencil,
  Search,
  Share2,
} from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import {
  createGroupReport,
  getGroup,
  leaveGroupWithSync,
  type FirestoreGroup,
} from '@/features/chat/api';
import { clearConversationLocally } from '@/features/chat/lib/clearedConversations';
import { chatFilesOf } from '@/features/chat/model/chatDetails';
import { useConversationMute } from '@/features/chat/hooks/useConversationMute';
import { useRecentMessages } from '@/features/chat/hooks/useRecentMessages';
import { ConfirmSheet, MuteSheet } from '@/features/chat/components/details/ChatSheet';
import ChatFilesSheet from '@/features/chat/components/details/ChatFilesSheet';
import ChatSearchSheet from '@/features/chat/components/details/ChatSearchSheet';
import ReportSheet from '@/features/chat/components/details/ReportSheet';
import {
  ActionList,
  ActionRow,
  DetailsHeader,
  DetailsHero,
  DetailsState,
  QuickAction,
  QuickActions,
} from '@/features/chat/components/details/DetailsParts';

type Sheet = 'mute' | 'files' | 'search' | 'report' | 'leave' | 'clear' | null;
type GroupState = { key: string; group: FirestoreGroup | null };

const membersLabel = (count: number | undefined) =>
  typeof count === 'number' && count > 0
    ? `Grupo · ${count.toLocaleString('es-ES')} ${count === 1 ? 'miembro' : 'miembros'}`
    : 'Grupo';

/** `/messages/:conversationId/group-details`: the group, and what you can do with its chat. */
export default function GroupConversationDetailsPage() {
  const navigate = useNavigate();
  const { conversationId = '' } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const uid = user?.uid ?? null;
  const groupId = conversationId.startsWith('grp_') ? conversationId.slice(4) : null;

  const groupKey = JSON.stringify([groupId, uid]);
  const [groupState, setGroupState] = useState<GroupState | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [leaving, setLeaving] = useState(false);
  const mute = useConversationMute(groupId ? conversationId : null, uid);
  const messages = useRecentMessages(groupId ? conversationId : null, uid);

  // Only group chats have these details.
  useEffect(() => {
    if (!groupId) navigate('/messages', { replace: true });
  }, [groupId, navigate]);

  useEffect(() => {
    if (!uid || !groupId) return;
    let active = true;
    getGroup(groupId)
      .then((group) => {
        if (active) setGroupState({ key: groupKey, group });
      })
      .catch((error) => {
        console.error('Error loading the group:', error);
        if (active) setGroupState({ key: groupKey, group: null });
      });
    return () => {
      active = false;
    };
  }, [uid, groupId, groupKey]);

  const backToChat = () => navigate(`/messages?conversation=${conversationId}`);
  const current = groupState?.key === groupKey ? groupState : null;

  if (!current?.group || !groupId) {
    return (
      <DetailsState message={current ? 'No se pudo cargar el grupo.' : null} onBack={backToChat} />
    );
  }

  const group = current.group;
  const isOwner = !!uid && group.ownerId === uid;
  const files = chatFilesOf(messages);
  const close = () => setSheet(null);

  const share = async () => {
    const url = `${window.location.origin}/group/${groupId}`;
    try {
      if (!navigator.clipboard) throw new Error('No clipboard');
      await navigator.clipboard.writeText(url);
      showToast('Enlace copiado', 'success');
    } catch {
      window.prompt('Copia el enlace del grupo:', url);
    }
  };

  const leave = async () => {
    if (!uid) return;
    setLeaving(true);
    try {
      await leaveGroupWithSync(groupId, uid);
      showToast('Saliste del grupo', 'success');
      navigate('/messages');
    } catch (error) {
      console.error('Error leaving the group:', error);
      showToast('No se pudo salir del grupo.', 'error');
      setLeaving(false);
    }
  };

  const jumpTo = (messageId: string) => {
    window.sessionStorage.setItem('vinctus:jumpMessageId', messageId);
    navigate(`/messages?conversation=${conversationId}#msg-${messageId}`);
  };

  return (
    <div className="page-feed mx-auto max-w-xl pb-24 pt-4">
      <DetailsHeader title="Detalles del grupo" onBack={backToChat} />
      <DetailsHero
        name={group.name}
        photoURL={group.iconUrl}
        shape="group"
        subtitle={membersLabel(group.memberCount)}
        status={mute.statusText}
      />

      <QuickActions>
        <QuickAction
          icon={ExternalLink}
          label="Grupo"
          ariaLabel="Ver grupo"
          onClick={() => navigate(`/group/${groupId}`)}
        />
        <QuickAction
          icon={mute.muted ? BellOff : Bell}
          label={mute.muted ? 'Silenciado' : 'Silenciar'}
          ariaLabel={mute.muted ? 'Quitar silencio' : 'Silenciar'}
          active={mute.muted}
          disabled={mute.busy}
          onClick={() => (mute.muted ? void mute.unmute() : setSheet('mute'))}
        />
        <QuickAction
          icon={Search}
          label="Buscar"
          ariaLabel="Buscar en la conversación"
          onClick={() => setSheet('search')}
        />
      </QuickActions>

      <ActionList>
        <ActionRow
          icon={Images}
          label="Fotos y archivos"
          value={files.length ? String(files.length) : undefined}
          chevron
          onClick={() => setSheet('files')}
        />
        <ActionRow icon={Share2} label="Compartir enlace" onClick={() => void share()} />
        {isOwner && (
          <ActionRow
            icon={Pencil}
            label="Editar grupo"
            chevron
            onClick={() => navigate(`/group/${groupId}/edit`)}
          />
        )}
        <ActionRow
          icon={Eraser}
          label="Limpiar chat local"
          detail="No borra mensajes del servidor"
          onClick={() => setSheet('clear')}
        />
      </ActionList>

      <ActionList>
        <ActionRow
          icon={Flag}
          label="Reportar grupo"
          tone="danger"
          onClick={() => setSheet('report')}
        />
        {!isOwner && (
          <ActionRow
            icon={LogOut}
            label="Salir del grupo"
            tone="danger"
            onClick={() => setSheet('leave')}
          />
        )}
      </ActionList>
      {isOwner && (
        <p className="px-1 text-xs text-neutral-600">
          Eres el propietario: puedes editar el grupo, pero no salir de él.
        </p>
      )}

      {sheet === 'mute' && (
        <MuteSheet
          busy={mute.busy}
          onClose={close}
          onMute={(hours) => {
            void mute.mute(hours).then((done) => done && close());
          }}
        />
      )}
      {sheet === 'files' && <ChatFilesSheet files={files} onClose={close} />}
      {sheet === 'search' && (
        <ChatSearchSheet messages={messages} currentUserId={uid} onJump={jumpTo} onClose={close} />
      )}
      {sheet === 'clear' && (
        <ConfirmSheet
          title="Limpiar chat local"
          message="Los mensajes se ocultan solo en este dispositivo. Siguen en el servidor y puedes volver a mostrarlos desde el chat."
          confirmLabel="Limpiar"
          tone="gold"
          onClose={close}
          onConfirm={() => {
            clearConversationLocally(conversationId);
            showToast('Chat limpiado localmente', 'success');
            close();
          }}
        />
      )}
      {sheet === 'leave' && (
        <ConfirmSheet
          title="Salir del grupo"
          message={`Dejarás de ser miembro de ${group.name} y de ver su chat.`}
          confirmLabel="Salir"
          busy={leaving}
          onClose={close}
          onConfirm={() => void leave()}
        />
      )}
      {sheet === 'report' && (
        <ReportSheet
          title="Reportar grupo"
          onClose={close}
          onSubmit={async (reason, details) => {
            if (!uid) return;
            await createGroupReport({
              reporterUid: uid,
              groupId,
              reason,
              details,
              conversationId,
            });
            showToast('Reporte enviado', 'success');
            close();
          }}
        />
      )}
    </div>
  );
}
