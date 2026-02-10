import { useEffect, useMemo, useState } from 'react';
import { formatBytes } from '@/shared/lib/formatUtils';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  BellOff,
  ExternalLink,
  FileText,
  Flag,
  Image as ImageIcon,
  LogOut,
  Paperclip,
  Pencil,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import {
  clearConversationMute,
  createGroupReport,
  getConversationMember,
  getGroup,
  leaveGroupWithSync,
  setConversationMute,
  subscribeToMessages,
  type ConversationMemberRead,
  type FirestoreGroup,
  type MessageAttachmentRead,
  type MessageRead,
  type UserReportReason,
} from '@/features/chat/api';

const CLEARED_STORAGE_KEY = 'vinctus:clearedConversations';

const REPORT_REASON_OPTIONS: Array<{ value: UserReportReason; label: string }> = [
  { value: 'spam', label: 'Spam o publicidad' },
  { value: 'harassment', label: 'Acoso' },
  { value: 'abuse', label: 'Abuso' },
  { value: 'fake', label: 'Suplantacion' },
  { value: 'other', label: 'Otro' },
];

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

const persistClearedConversations = (next: Record<string, number>) => {
  try {
    window.localStorage.setItem(CLEARED_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('Error saving cleared conversations:', error);
  }
};

export default function GroupConversationDetailsPage() {
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [group, setGroup] = useState<FirestoreGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRead[]>([]);
  const [memberData, setMemberData] = useState<ConversationMemberRead | null>(null);
  const [showMuteModal, setShowMuteModal] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const [showGroupFiles, setShowGroupFiles] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showGroupReportModal, setShowGroupReportModal] = useState(false);
  const [groupReportReason, setGroupReportReason] = useState<UserReportReason>('spam');
  const [groupReportDetails, setGroupReportDetails] = useState('');
  const [groupReportError, setGroupReportError] = useState<string | null>(null);
  const [isSubmittingGroupReport, setIsSubmittingGroupReport] = useState(false);

  const groupId =
    conversationId && conversationId.startsWith('grp_') ? conversationId.replace('grp_', '') : null;

  const isOwner = group?.ownerId === user?.uid;

  useEffect(() => {
    if (!user?.uid) {
      setLoading(true);
      return;
    }

    if (!conversationId || !groupId) {
      navigate('/messages', { replace: true });
      return;
    }

    const loadGroup = async () => {
      try {
        setLoading(true);
        setError(null);
        const fetched = await getGroup(groupId);
        if (!fetched) {
          setError('No se pudo cargar el grupo.');
          return;
        }
        setGroup(fetched);
      } catch (err) {
        console.error('[GroupConversationDetailsPage] Error loading group:', err);
        setError('No se pudo cargar el grupo.');
      } finally {
        setLoading(false);
      }
    };

    void loadGroup();
  }, [conversationId, groupId, user, navigate]);

  useEffect(() => {
    if (!conversationId || !user?.uid) return;
    const unsubscribe = subscribeToMessages(conversationId, (msgs) => {
      setMessages(msgs.reverse());
    });
    return () => unsubscribe();
  }, [conversationId, user]);

  useEffect(() => {
    if (!conversationId || !user?.uid) return;

    const loadMemberData = async () => {
      try {
        const member = await getConversationMember(conversationId, user.uid);
        if (member) {
          if (member.muted && member.mutedUntil && member.mutedUntil < new Date()) {
            await clearConversationMute(conversationId, user.uid);
            setMemberData({ ...member, muted: false, mutedUntil: null });
          } else {
            setMemberData(member);
          }
        }
      } catch (err) {
        console.error('[GroupConversationDetailsPage] Error loading member data:', err);
      }
    };

    void loadMemberData();
  }, [conversationId, user]);

  const attachmentItems = useMemo(() => {
    return messages.flatMap((msg) => {
      const attachments = msg.attachments ?? [];
      return attachments.map((att) => ({
        messageId: msg.id,
        senderId: msg.senderId,
        createdAt: msg.createdAt,
        attachment: att,
      }));
    });
  }, [messages]);

  const getMuteStatusText = () => {
    if (!memberData?.muted) return null;
    if (!memberData.mutedUntil) return 'Silenciado';
    const now = new Date();
    if (memberData.mutedUntil <= now) return null;
    return `Silenciado hasta ${memberData.mutedUntil.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const handleGoBack = () => {
    navigate('/messages');
  };

  const handleMuteGroup = async (hours: number | null) => {
    if (!conversationId || !user?.uid) return;
    setIsTogglingMute(true);
    try {
      const mutedUntil = hours ? new Date(Date.now() + hours * 60 * 60 * 1000) : null;
      await setConversationMute(conversationId, user.uid, mutedUntil);
      setMemberData((prev) => (prev ? { ...prev, muted: true, mutedUntil } : null));
      setShowMuteModal(false);
      showToast('Conversacion silenciada', 'success');
    } catch (error) {
      console.error('Error muting group:', error);
      showToast('No se pudo silenciar', 'error');
    } finally {
      setIsTogglingMute(false);
    }
  };

  const handleUnmuteGroup = async () => {
    if (!conversationId || !user?.uid) return;
    setIsTogglingMute(true);
    try {
      await clearConversationMute(conversationId, user.uid);
      setMemberData((prev) => (prev ? { ...prev, muted: false, mutedUntil: null } : null));
      showToast('Silencio desactivado', 'success');
    } catch (error) {
      console.error('Error unmuting group:', error);
      showToast('No se pudo activar el sonido', 'error');
    } finally {
      setIsTogglingMute(false);
    }
  };

  const handleShareGroup = async () => {
    if (!groupId) return;
    const url = `${window.location.origin}/group/${groupId}`;
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

  const handleSearchConversation = () => {
    setSearchQuery('');
    setShowSearchModal(true);
  };

  const handleJumpToMessage = (messageId: string) => {
    if (!conversationId) return;
    window.sessionStorage.setItem('vinctus:jumpMessageId', messageId);
    navigate(`/messages?conversation=${conversationId}#msg-${messageId}`);
  };

  const handleClearChatLocal = () => {
    if (!conversationId) return;
    const confirmed = window.confirm(
      '¿Limpiar el chat localmente? Esto no borra mensajes del servidor.',
    );
    if (!confirmed) return;
    const current = loadClearedConversations();
    const next = { ...current, [conversationId]: Date.now() };
    persistClearedConversations(next);
    showToast('Chat limpiado localmente', 'success');
  };

  const handleLeaveGroup = async () => {
    if (!user?.uid || !groupId) return;
    if (isOwner) {
      showToast('El propietario no puede salir del grupo.', 'info');
      return;
    }
    const confirmed = window.confirm('¿Seguro que deseas salir del grupo?');
    if (!confirmed) return;
    try {
      await leaveGroupWithSync(groupId, user.uid);
      showToast('Saliste del grupo', 'success');
      navigate('/messages');
    } catch (error) {
      console.error('Error leaving group:', error);
      showToast('No se pudo salir del grupo.', 'error');
    }
  };

  const resetGroupReportForm = () => {
    setGroupReportReason('spam');
    setGroupReportDetails('');
    setGroupReportError(null);
  };

  const handleSubmitGroupReport = async () => {
    if (!user?.uid || !groupId) return;
    setIsSubmittingGroupReport(true);
    setGroupReportError(null);
    try {
      await createGroupReport({
        reporterUid: user.uid,
        groupId,
        reason: groupReportReason,
        details: groupReportDetails.trim() ? groupReportDetails.trim() : null,
        conversationId: conversationId ?? null,
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

  if (loading) {
    return (
      <div className="page-feed pt-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="page-feed pt-6 max-w-3xl mx-auto">
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-neutral-400 mb-6">{error || 'No se pudo cargar el grupo.'}</p>
          <button
            onClick={handleGoBack}
            className="px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors"
          >
            Volver a Mensajes
          </button>
        </div>
      </div>
    );
  }

  if (!groupId) {
    return null;
  }

  return (
    <div className="page-feed pt-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          type="button"
          onClick={handleGoBack}
          aria-label="Volver a mensajes"
          className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-serif font-light text-white">Detalles del Grupo</h1>
      </div>

      {/* Group Info */}
      <div className="flex flex-col items-center py-8 border-b border-neutral-800/50">
        <div className="w-24 h-24 rounded-full overflow-hidden bg-neutral-800 border-2 border-neutral-700 mb-4 flex items-center justify-center">
          {group.iconUrl ? (
            <img src={group.iconUrl} alt={group.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl text-neutral-400">{group.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <h2 className="text-xl font-medium text-white mb-1">{group.name}</h2>
        <p className="text-sm text-neutral-500">Grupo</p>
      </div>

      {/* Actions */}
      <div className="mt-8 space-y-2">
        {memberData?.muted ? (
          <button
            type="button"
            onClick={handleUnmuteGroup}
            disabled={isTogglingMute}
            className="w-full flex items-center gap-4 p-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 rounded-xl transition-all text-left cursor-pointer disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <BellOff size={18} className="text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-amber-400 font-medium">Quitar silencio</p>
              <p className="text-xs text-amber-300">{getMuteStatusText()}</p>
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowMuteModal(true)}
            disabled={isTogglingMute}
            className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <Bell size={18} className="text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">Silenciar</p>
              <p className="text-xs text-neutral-500">No recibir notificaciones</p>
            </div>
          </button>
        )}

        <button
          type="button"
          onClick={handleShareGroup}
          className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
            <Share2 size={18} className="text-amber-500" />
          </div>
          <div className="flex-1">
            <p className="text-white font-medium">Compartir enlace</p>
            <p className="text-xs text-neutral-500">Copia el enlace del grupo</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setShowGroupFiles(true)}
          className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
            <Paperclip size={18} className="text-amber-500" />
          </div>
          <div className="flex-1">
            <p className="text-white font-medium">Ver archivos</p>
            <p className="text-xs text-neutral-500">Adjuntos del chat</p>
          </div>
        </button>

        <button
          type="button"
          onClick={handleSearchConversation}
          className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
            <Search size={18} className="text-amber-500" />
          </div>
          <div className="flex-1">
            <p className="text-white font-medium">Buscar en la conversacion</p>
            <p className="text-xs text-neutral-500">Encuentra mensajes</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setShowGroupReportModal(true)}
          className="w-full flex items-center gap-4 p-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 rounded-xl transition-all text-left cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0">
            <Flag size={18} className="text-red-400" />
          </div>
          <div className="flex-1">
            <p className="text-red-200 font-medium">Reportar grupo</p>
            <p className="text-xs text-red-300">Denunciar comportamiento</p>
          </div>
        </button>

        <button
          type="button"
          onClick={handleClearChatLocal}
          className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center flex-shrink-0">
            <X size={18} className="text-neutral-400" />
          </div>
          <div className="flex-1">
            <p className="text-white font-medium">Limpiar chat local</p>
            <p className="text-xs text-neutral-500">No borra mensajes del servidor</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate(`/group/${groupId}`)}
          className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
            <ExternalLink size={18} className="text-amber-500" />
          </div>
          <div className="flex-1">
            <p className="text-white font-medium">Ver grupo</p>
            <p className="text-xs text-neutral-500">Ir a la pagina del grupo</p>
          </div>
        </button>

        {isOwner && (
          <button
            type="button"
            onClick={() => navigate(`/group/${groupId}/edit`)}
            className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <Pencil size={18} className="text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">Editar grupo</p>
              <p className="text-xs text-neutral-500">Cambiar nombre o detalles</p>
            </div>
          </button>
        )}

        {!isOwner && (
          <button
            type="button"
            onClick={handleLeaveGroup}
            className="w-full flex items-center gap-4 p-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 rounded-xl transition-all text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0">
              <LogOut size={18} className="text-red-400" />
            </div>
            <div className="flex-1">
              <p className="text-red-200 font-medium">Salir del grupo</p>
              <p className="text-xs text-red-300">Dejaras de ver el chat</p>
            </div>
          </button>
        )}
      </div>

      {/* Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowSearchModal(false)}
          />
          <div className="relative w-full max-w-lg mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
              <h3 className="text-lg font-medium text-white">Buscar en la conversacion</h3>
              <button
                onClick={() => setShowSearchModal(false)}
                className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Escribe para buscar..."
                className="w-full bg-neutral-800/60 border border-neutral-700 rounded-lg px-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/60 transition-colors"
              />
              <div className="max-h-[45vh] overflow-y-auto space-y-2">
                {searchQuery.trim() === '' ? (
                  <div className="text-sm text-neutral-500 text-center py-8">
                    Escribe un termino para buscar.
                  </div>
                ) : (
                  messages
                    .filter((msg) =>
                      msg.text.toLowerCase().includes(searchQuery.trim().toLowerCase()),
                    )
                    .map((msg) => (
                      <button
                        key={msg.id}
                        type="button"
                        onClick={() => handleJumpToMessage(msg.id)}
                        className="w-full text-left p-3 rounded-xl bg-neutral-900/40 border border-neutral-800/60 hover:bg-neutral-800/60 transition-colors"
                      >
                        <p className="text-sm text-white truncate">{msg.text}</p>
                        <p className="text-xs text-neutral-500 mt-1">
                          {msg.senderId === user?.uid ? 'Tu' : 'Miembro'} ·{' '}
                          {new Date(msg.createdAt).toLocaleTimeString('es-ES', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </button>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Group Report Modal */}
      {showGroupReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => {
              setShowGroupReportModal(false);
              resetGroupReportForm();
            }}
          />
          <div className="relative w-full max-w-md mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
              <h3 className="text-lg font-medium text-white">Reportar grupo</h3>
              <button
                onClick={() => {
                  setShowGroupReportModal(false);
                  resetGroupReportForm();
                }}
                className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                  Motivo
                </label>
                <select
                  value={groupReportReason}
                  onChange={(event) => setGroupReportReason(event.target.value as UserReportReason)}
                  className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500/50 transition-colors"
                >
                  {REPORT_REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                  Detalles (opcional)
                </label>
                <textarea
                  value={groupReportDetails}
                  onChange={(event) => setGroupReportDetails(event.target.value)}
                  rows={4}
                  maxLength={2000}
                  className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-red-500/50 transition-colors resize-none"
                  placeholder="Describe el motivo del reporte"
                />
                <div className="text-right text-xs text-neutral-500 mt-1">
                  {groupReportDetails.length}/2000
                </div>
              </div>

              {groupReportError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {groupReportError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowGroupReportModal(false);
                    resetGroupReportForm();
                  }}
                  className="px-4 py-2 rounded-lg text-neutral-300 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSubmitGroupReport}
                  disabled={isSubmittingGroupReport}
                  className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingGroupReport ? 'Enviando...' : 'Enviar reporte'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Group Mute Options */}
      {showMuteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowMuteModal(false)}
          />
          <div className="relative w-full max-w-sm mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
              <h3 className="text-lg font-medium text-white">Silenciar conversacion</h3>
              <button
                onClick={() => setShowMuteModal(false)}
                className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-2">
              <button
                onClick={() => handleMuteGroup(1)}
                disabled={isTogglingMute}
                className="w-full p-3 text-left text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
              >
                1 hora
              </button>
              <button
                onClick={() => handleMuteGroup(4)}
                disabled={isTogglingMute}
                className="w-full p-3 text-left text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
              >
                4 horas
              </button>
              <button
                onClick={() => handleMuteGroup(8)}
                disabled={isTogglingMute}
                className="w-full p-3 text-left text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
              >
                8 horas
              </button>
              <button
                onClick={() => handleMuteGroup(null)}
                disabled={isTogglingMute}
                className="w-full p-3 text-left text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
              >
                Para siempre
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Files */}
      {showGroupFiles && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowGroupFiles(false)}
          />
          <div className="relative w-full max-w-lg mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
              <h3 className="text-lg font-medium text-white">Archivos del chat</h3>
              <button
                onClick={() => setShowGroupFiles(false)}
                className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3">
              {attachmentItems.length === 0 ? (
                <div className="text-center text-neutral-500 py-8">
                  No hay archivos compartidos en este chat.
                </div>
              ) : (
                attachmentItems.map((item) => {
                  const att = item.attachment as MessageAttachmentRead;
                  const isImage = att.kind === 'image';
                  const title = isImage ? 'Imagen' : att.fileName || 'Archivo';
                  return (
                    <button
                      key={`${item.messageId}_${att.path}`}
                      type="button"
                      onClick={() => window.open(att.url, '_blank')}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-neutral-900/40 border border-neutral-800/60 text-left hover:bg-neutral-800/60 transition-colors"
                    >
                      <div className="w-12 h-12 rounded-lg bg-neutral-800 flex items-center justify-center overflow-hidden">
                        {isImage ? (
                          att.thumbUrl ? (
                            <img
                              src={att.thumbUrl}
                              alt={title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon size={18} className="text-amber-400" />
                          )
                        ) : (
                          <FileText size={18} className="text-amber-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{title}</p>
                        <p className="text-xs text-neutral-500">
                          {isImage ? 'Imagen' : att.contentType} · {formatBytes(att.size || 0)}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
