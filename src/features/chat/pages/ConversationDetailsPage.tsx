import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  Ban,
  Bell,
  BellOff,
  Eraser,
  Images,
  Search,
  ShieldOff,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import {
  blockUser,
  createUserReport,
  getUserProfile,
  isUserBlocked,
  unblockUser,
  type UserProfileRead,
} from '@/features/chat/api';
import CreateGroupModal from '@/features/groups/components/CreateGroupModal';
import { directParticipants } from '@/features/chat/lib/conversationIds';
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

type Sheet = 'mute' | 'files' | 'search' | 'report' | 'block' | 'clear' | 'group' | null;
type ProfileState = { key: string; profile: UserProfileRead | null; error: string | null };

/** `/messages/:conversationId/details`: the person, and what you can do with this chat. */
export default function ConversationDetailsPage() {
  const navigate = useNavigate();
  const { conversationId = '' } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const uid = user?.uid ?? null;
  const isDirect = conversationId.startsWith('dm_');
  const otherId = uid
    ? (directParticipants(conversationId, uid)?.find((id) => id !== uid) ?? null)
    : null;

  const profileKey = JSON.stringify([conversationId, uid]);
  const [profileState, setProfileState] = useState<ProfileState | null>(null);
  const [blockedState, setBlockedState] = useState<{ key: string; blocked: boolean } | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const mute = useConversationMute(isDirect ? conversationId : null, uid);
  const messages = useRecentMessages(isDirect ? conversationId : null, uid);

  // Only direct chats have these details.
  useEffect(() => {
    if (!isDirect) navigate('/messages', { replace: true });
  }, [isDirect, navigate]);

  useEffect(() => {
    if (!uid || !otherId) return;
    let active = true;
    getUserProfile(otherId)
      .then((profile) => {
        if (!active) return;
        setProfileState({
          key: profileKey,
          profile,
          error: profile ? null : 'Usuario no encontrado.',
        });
      })
      .catch((error) => {
        console.error('Error loading the chat profile:', error);
        if (active)
          setProfileState({
            key: profileKey,
            profile: null,
            error: 'No se pudo cargar el perfil del usuario.',
          });
      });
    isUserBlocked(uid, otherId)
      .then((blocked) => {
        if (active) setBlockedState({ key: profileKey, blocked });
      })
      .catch((error) => console.error('Error loading the block status:', error));
    return () => {
      active = false;
    };
  }, [uid, otherId, profileKey]);

  const backToChat = () => navigate(`/messages?conversation=${conversationId}`);
  const current = profileState?.key === profileKey ? profileState : null;
  const isBlocked = blockedState?.key === profileKey && blockedState.blocked;

  if (uid && isDirect && !otherId) {
    return <DetailsState message="No se pudo identificar al usuario." onBack={backToChat} />;
  }
  if (!current?.profile) {
    return <DetailsState message={current?.error ?? null} onBack={backToChat} />;
  }

  const profile = current.profile;
  const name = profile.displayName?.trim() || 'Usuario';
  const files = chatFilesOf(messages);
  const close = () => setSheet(null);

  const toggleBlock = async () => {
    if (!uid) return;
    setBusy(true);
    try {
      if (isBlocked) {
        await unblockUser(uid, profile.uid);
        setBlockedState({ key: profileKey, blocked: false });
        showToast('Usuario desbloqueado', 'success');
        close();
      } else {
        await blockUser(uid, profile.uid);
        showToast('Usuario bloqueado', 'success');
        navigate('/messages');
      }
    } catch (error) {
      console.error('Error toggling the block:', error);
      showToast('No se pudo completar la acción', 'error');
    } finally {
      setBusy(false);
    }
  };

  const jumpTo = (messageId: string) => {
    window.sessionStorage.setItem('vinctus:jumpMessageId', messageId);
    navigate(`/messages?conversation=${conversationId}#msg-${messageId}`);
  };

  return (
    <div className="page-feed mx-auto max-w-xl pb-24 pt-4">
      <DetailsHeader title="Detalles del chat" onBack={backToChat} />
      <DetailsHero
        name={name}
        photoURL={profile.photoURL}
        shape="person"
        subtitle={profile.username ? `@${profile.username}` : null}
        status={mute.statusText}
      />

      <QuickActions>
        <QuickAction
          icon={UserIcon}
          label="Perfil"
          ariaLabel="Ver perfil"
          onClick={() => navigate(`/user/${profile.uid}`)}
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
        <ActionRow
          icon={Users}
          label="Crear grupo con esta persona"
          chevron
          onClick={() => setSheet('group')}
        />
        <ActionRow
          icon={Eraser}
          label="Limpiar chat local"
          detail="No borra mensajes del servidor"
          onClick={() => setSheet('clear')}
        />
      </ActionList>

      <ActionList>
        <ActionRow
          icon={isBlocked ? ShieldOff : Ban}
          label={isBlocked ? `Desbloquear a ${name}` : `Bloquear a ${name}`}
          tone={isBlocked ? 'default' : 'danger'}
          onClick={() => setSheet('block')}
        />
        <ActionRow
          icon={AlertCircle}
          label={`Reportar a ${name}`}
          tone="danger"
          onClick={() => setSheet('report')}
        />
      </ActionList>

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
      {sheet === 'block' && (
        <ConfirmSheet
          title={isBlocked ? `Desbloquear a ${name}` : `Bloquear a ${name}`}
          message={
            isBlocked
              ? 'Podrán volver a enviarse mensajes y seguirse.'
              : 'No podrán enviarse mensajes. Dejarán de seguirse y no verás sus publicaciones.'
          }
          confirmLabel={isBlocked ? 'Desbloquear' : 'Bloquear'}
          tone={isBlocked ? 'gold' : 'danger'}
          busy={busy}
          onClose={close}
          onConfirm={() => void toggleBlock()}
        />
      )}
      {sheet === 'report' && (
        <ReportSheet
          title="Reportar usuario"
          onClose={close}
          onSubmit={async (reason, details) => {
            if (!uid) return;
            await createUserReport({
              reporterUid: uid,
              reportedUid: profile.uid,
              reason,
              details,
              conversationId,
            });
            showToast('Reporte enviado', 'success');
            close();
          }}
        />
      )}
      <CreateGroupModal
        isOpen={sheet === 'group'}
        onClose={close}
        onCreated={(groupId) => {
          close();
          navigate(`/group/${groupId}`);
        }}
        preselectedMemberProfiles={[profile]}
      />
    </div>
  );
}
