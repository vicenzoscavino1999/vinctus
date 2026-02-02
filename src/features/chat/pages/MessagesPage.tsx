import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  ChevronRight,
  Users,
  ArrowLeft,
  Send,
  X,
  ExternalLink,
  Pencil,
  LogOut,
  Bell,
  BellOff,
  Share2,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Flag,
} from 'lucide-react';
import { useToast } from '@/shared/ui/Toast';
import {
  getOrCreateGroupConversation,
  getGroupMemberCount,
  getGroupPostsWeekCount,
  setConversationMute,
  clearConversationMute,
  subscribeToConversations,
  subscribeToMessages,
  subscribeToUserMemberships,
  sendMessage,
  markConversationRead,
  getGroup,
  leaveGroupWithSync,
  createGroupReport,
  getUserProfile,
  getBlockedUsers,
  type ConversationRead,
  type ConversationMemberRead,
  type FirestoreGroup,
  type MessageRead,
  type MessageAttachmentRead,
  type UserReportReason,
} from '@/shared/lib/firestore';
import CreateGroupModal from '@/components/CreateGroupModal';

// Helper to format relative time
const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'ahora';
  if (diffMins < 60) return `${diffMins} min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
};

const parseDirectMemberIds = (conversationId: string): string[] | null => {
  if (!conversationId.startsWith('dm_')) return null;
  const parts = conversationId.slice(3).split('_');
  return parts.length >= 2 ? parts : null;
};

// Group info cache type
interface GroupInfo {
  name: string;
  iconUrl?: string;
}

const REPORT_REASON_OPTIONS: Array<{ value: UserReportReason; label: string }> = [
  { value: 'spam', label: 'Spam o publicidad' },
  { value: 'harassment', label: 'Acoso' },
  { value: 'abuse', label: 'Abuso' },
  { value: 'fake', label: 'Suplantacion' },
  { value: 'other', label: 'Otro' },
];

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

export default function MessagesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationRead[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRead[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'groups' | 'private'>('groups');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupInfoCache, setGroupInfoCache] = useState<Record<string, GroupInfo>>({});
  const groupInfoCacheRef = useRef<Record<string, GroupInfo>>({});
  const [directInfoCache, setDirectInfoCache] = useState<
    Record<string, { name: string; photoURL: string | null }>
  >({});
  const [groupStats, setGroupStats] = useState<
    Record<string, { members: number; postsWeek: number }>
  >({});
  const [memberGroups, setMemberGroups] = useState<FirestoreGroup[]>([]);
  const [memberGroupsLoading, setMemberGroupsLoading] = useState(false);
  const [memberGroupsError, setMemberGroupsError] = useState<string | null>(null);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
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

  const [searchParams, setSearchParams] = useSearchParams();
  const conversationParam = searchParams.get('conversation');

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

  useEffect(() => {
    groupInfoCacheRef.current = groupInfoCache;
  }, [groupInfoCache]);

  const getOtherMemberId = useCallback(
    (conv: ConversationRead): string | null => {
      if (!user || conv.type !== 'direct') return null;
      const memberIds = conv.memberIds ?? parseDirectMemberIds(conv.id);
      if (!memberIds) return null;
      return memberIds.find((id) => id !== user.uid) ?? null;
    },
    [user],
  );

  useEffect(() => {
    if (!conversationParam) return;
    // Only sync URL -> state (one-way)
    setSelectedConversationId(conversationParam);

    const isGroupConversation = conversationParam.startsWith('grp_');
    const memberIds = !isGroupConversation ? parseDirectMemberIds(conversationParam) : null;
    setActiveTab(isGroupConversation ? 'groups' : 'private');

    setConversations((prev) => {
      if (prev.some((conv) => conv.id === conversationParam)) return prev;
      return [
        {
          id: conversationParam,
          type: isGroupConversation ? 'group' : 'direct',
          groupId: isGroupConversation ? conversationParam.replace('grp_', '') : undefined,
          memberIds: memberIds ?? undefined,
          lastMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as ConversationRead,
        ...prev,
      ];
    });
  }, [conversationParam]); // Removed selectedConversationId to prevent sync loop

  // Subscribe to conversations
  useEffect(() => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      setError('Necesitas iniciar sesión para ver mensajes.');
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToConversations(
      user.uid,
      (convs) => {
        setConversations(convs);
        setError(null);
        setLoading(false);

        // Fetch group info for group conversations
        convs.forEach(async (conv) => {
          if (conv.type === 'group' && conv.groupId && !groupInfoCacheRef.current[conv.groupId]) {
            try {
              const group = await getGroup(conv.groupId);
              if (group) {
                setGroupInfoCache((prev) => ({
                  ...prev,
                  [conv.groupId!]: { name: group.name, iconUrl: group.iconUrl ?? undefined },
                }));
              }
            } catch (e) {
              console.error('Error fetching group info:', e);
            }
          }
        });
      },
      (err) => {
        console.error('Error loading conversations:', err);
        setLoading(false);
        setError('No se pudieron cargar conversaciones.');
      },
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (memberGroups.length === 0) return;
    let isActive = true;
    const pending = memberGroups.filter((group) => groupStats[group.id] === undefined);
    if (pending.length === 0) return;

    const loadStats = async () => {
      try {
        const updates: Record<string, { members: number; postsWeek: number }> = {};
        await Promise.all(
          pending.map(async (group) => {
            const [members, postsWeek] = await Promise.all([
              getGroupMemberCount(group.id),
              getGroupPostsWeekCount(group.id),
            ]);
            updates[group.id] = { members, postsWeek };
          }),
        );
        if (isActive) {
          setGroupStats((prev) => ({ ...prev, ...updates }));
        }
      } catch (statsError) {
        console.error('Error loading group stats:', statsError);
      }
    };

    loadStats();

    return () => {
      isActive = false;
    };
  }, [memberGroups, groupStats]);

  useEffect(() => {
    if (!user) {
      setMemberGroups([]);
      setMemberGroupsError(null);
      setMemberGroupsLoading(false);
      return;
    }

    let isActive = true;
    let requestId = 0;

    const unsubscribe = subscribeToUserMemberships(user.uid, (groupIds) => {
      requestId += 1;
      const currentRequest = requestId;
      setMemberGroupsLoading(true);
      setMemberGroupsError(null);

      void (async () => {
        try {
          const groupDocs = await Promise.all(groupIds.map((id) => getGroup(id)));
          if (!isActive || currentRequest !== requestId) return;
          const resolved = groupDocs.filter(Boolean) as FirestoreGroup[];
          setMemberGroups(resolved);
          setMemberGroupsLoading(false);
          setGroupInfoCache((prev) => {
            const updates = { ...prev };
            resolved.forEach((group) => {
              updates[group.id] = {
                name: group.name,
                iconUrl: group.iconUrl ?? undefined,
              };
            });
            return updates;
          });
        } catch (loadError) {
          console.error('Error loading member groups:', loadError);
          if (!isActive || currentRequest !== requestId) return;
          setMemberGroups([]);
          setMemberGroupsError('No se pudieron cargar tus grupos.');
          setMemberGroupsLoading(false);
        }
      })();
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setBlockedUsers(new Set());
      return;
    }

    const loadBlocked = async () => {
      try {
        const ids = await getBlockedUsers(user.uid);
        setBlockedUsers(new Set(ids));
      } catch (err) {
        console.error('Error loading blocked users:', err);
      }
    };

    void loadBlocked();
  }, [user]);

  useEffect(() => {
    if (!user || conversations.length === 0) return;

    const missingIds = new Set<string>();
    for (const conv of conversations) {
      if (conv.type !== 'direct') continue;
      const otherId = getOtherMemberId(conv);
      if (otherId && !directInfoCache[otherId]) {
        missingIds.add(otherId);
      }
    }

    if (missingIds.size === 0) return;

    missingIds.forEach((uid) => {
      void (async () => {
        try {
          const profile = await getUserProfile(uid);
          if (!profile) return;
          setDirectInfoCache((prev) => {
            if (prev[uid]) return prev;
            return {
              ...prev,
              [uid]: {
                name: profile.displayName ?? 'Usuario',
                photoURL: profile.photoURL ?? null,
              },
            };
          });
        } catch (err) {
          console.error('Error fetching user profile:', err);
        }
      })();
    });
  }, [conversations, user, directInfoCache, getOtherMemberId]);

  // Subscribe to messages of selected conversation
  useEffect(() => {
    if (!selectedConversationId) return;

    const unsubscribe = subscribeToMessages(selectedConversationId, (msgs) => {
      setMessages(msgs.reverse()); // Reverse to show oldest first
    });

    return () => unsubscribe();
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId || messages.length === 0) return;
    const jumpId = window.sessionStorage.getItem('vinctus:jumpMessageId');
    if (!jumpId) return;
    const target = document.getElementById(`msg-${jumpId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightMessageId(jumpId);
      setTimeout(() => setHighlightMessageId(null), 2000);
    }
    window.sessionStorage.removeItem('vinctus:jumpMessageId');
  }, [selectedConversationId, messages]);

  // Mark as read when opening conversation
  useEffect(() => {
    if (!selectedConversationId || !user) return;
    markConversationRead(selectedConversationId, user.uid);
  }, [selectedConversationId, user]);

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    if (conversationId !== conversationParam) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('conversation', conversationId);
      setSearchParams(nextParams, { replace: true });
    }
  };

  const handleBackToList = () => {
    setSelectedConversationId(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('conversation');
    setSearchParams(nextParams, { replace: true });
  };

  const handleOpenDetails = () => {
    if (!activeConversation || activeConversation.type !== 'direct') return;
    if (!selectedConversationId) return;
    // Navigate to details page using conversationId in URL
    navigate(`/messages/${selectedConversationId}/details`);
  };

  const handleOpenGroupOptions = () => {
    if (!activeConversation || activeConversation.type !== 'group' || !selectedConversationId)
      return;
    navigate(`/messages/${selectedConversationId}/group-details`);
  };

  const handleLeaveGroup = async () => {
    if (!user?.uid || !activeConversation?.groupId) return;
    const groupId = activeConversation.groupId;

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
      handleBackToList();
    } catch (error) {
      console.error('Error leaving group:', error);
      showToast('No se pudo salir del grupo.', 'error');
    }
  };

  const handleMuteGroup = async (hours: number | null) => {
    if (!user?.uid || !selectedConversationId) return;
    setIsTogglingGroupMute(true);
    try {
      const mutedUntil = hours ? new Date(Date.now() + hours * 60 * 60 * 1000) : null;
      await setConversationMute(selectedConversationId, user.uid, mutedUntil);
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
    if (!user?.uid || !selectedConversationId) return;
    setIsTogglingGroupMute(true);
    try {
      await clearConversationMute(selectedConversationId, user.uid);
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
    if (!activeConversation?.groupId) return;
    const url = `${window.location.origin}/group/${activeConversation.groupId}`;
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
    if (!selectedConversationId) return;
    const confirmed = window.confirm(
      '¿Limpiar el chat localmente? Esto no borra mensajes del servidor.',
    );
    if (!confirmed) return;
    updateClearedConversations((prev) => ({
      ...prev,
      [selectedConversationId]: Date.now(),
    }));
    showToast('Chat limpiado localmente', 'success');
  };

  const handleRestoreChatLocal = () => {
    if (!selectedConversationId) return;
    updateClearedConversations((prev) => {
      const next = { ...prev };
      delete next[selectedConversationId];
      return next;
    });
  };

  const resetGroupReportForm = () => {
    setGroupReportReason('spam');
    setGroupReportDetails('');
    setGroupReportError(null);
  };

  const handleSubmitGroupReport = async () => {
    if (!user?.uid || !activeConversation?.groupId) return;
    setIsSubmittingGroupReport(true);
    setGroupReportError(null);
    try {
      await createGroupReport({
        reporterUid: user.uid,
        groupId: activeConversation.groupId,
        reason: groupReportReason,
        details: groupReportDetails.trim() ? groupReportDetails.trim() : null,
        conversationId: selectedConversationId ?? null,
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

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversationId || !user) return;

    const text = newMessage.trim();
    setNewMessage('');
    try {
      await sendMessage(selectedConversationId, user.uid, text);
    } catch (err) {
      console.error('Error sending message:', err);
      setNewMessage(text);
      showToast('No se pudo enviar el mensaje.', 'error');
    }
  };

  const getGroupStats = (group: FirestoreGroup): { members: number; postsWeek: number } => {
    const cached = groupStats[group.id];
    return {
      members: cached?.members ?? group.memberCount ?? 0,
      postsWeek: cached?.postsWeek ?? 0,
    };
  };

  const handleOpenMemberGroup = async (group: FirestoreGroup) => {
    if (!user) {
      showToast('Inicia sesion para abrir el chat', 'info');
      return;
    }
    try {
      const conversationId = await getOrCreateGroupConversation(group.id, user.uid);
      handleSelectConversation(conversationId);
      setActiveTab('groups');
    } catch (openError) {
      console.error('Error opening group chat:', openError);
      showToast('No se pudo abrir el chat del grupo', 'error');
    }
  };

  const handleGroupCreated = (groupId: string) => {
    setIsCreateGroupOpen(false);
    void (async () => {
      try {
        const created = await getGroup(groupId);
        if (created) {
          setMemberGroups((prev) => {
            if (prev.some((group) => group.id === created.id)) return prev;
            return [created, ...prev];
          });
          setGroupInfoCache((prev) => ({
            ...prev,
            [created.id]: { name: created.name, iconUrl: created.iconUrl ?? undefined },
          }));
        }
        setGroupStats((prev) => ({ ...prev, [groupId]: { members: 1, postsWeek: 0 } }));
      } catch (refreshError) {
        console.error('Error refreshing group list:', refreshError);
      }
    })();
  };

  // Get conversation display name
  const getConversationName = (conv: ConversationRead): string => {
    if (conv.type === 'group' && conv.groupId) {
      return groupInfoCache[conv.groupId]?.name || conv.groupId;
    }
    if (conv.type === 'direct') {
      const otherId = getOtherMemberId(conv);
      if (otherId) {
        return directInfoCache[otherId]?.name || 'Mensaje Directo';
      }
    }
    return 'Mensaje Directo';
  };

  const filteredMemberGroups = memberGroups.filter((group) => {
    if (!searchQuery.trim()) return true;
    return group.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Filter conversations by type and search
  const groupConversations = conversations.filter((conv) => {
    if (conv.type !== 'group') return false;
    if (!searchQuery.trim()) return true;
    const name = getConversationName(conv);
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const privateConversations = conversations.filter((conv) => {
    if (conv.type !== 'direct') return false;
    const otherId = getOtherMemberId(conv);
    if (otherId && blockedUsers.has(otherId)) return false;
    if (!searchQuery.trim()) return true;
    const name = getConversationName(conv);
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const activeConversations = activeTab === 'groups' ? groupConversations : privateConversations;

  // Check if all group conversations have their names loaded in cache
  const isGroupCacheReady = useMemo(() => {
    if (activeTab !== 'groups') return true; // Only matters for groups tab
    if (groupConversations.length === 0) return true; // No groups to check
    return groupConversations.every((conv) => !conv.groupId || groupInfoCache[conv.groupId]?.name);
  }, [activeTab, groupConversations, groupInfoCache]);

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
  const fallbackConversation =
    selectedConversationId && !selectedConversation
      ? ({
          id: selectedConversationId,
          type: selectedConversationId.startsWith('grp_') ? 'group' : 'direct',
          groupId: selectedConversationId.startsWith('grp_')
            ? selectedConversationId.replace('grp_', '')
            : undefined,
          memberIds: selectedConversationId.startsWith('dm_')
            ? (parseDirectMemberIds(selectedConversationId) ?? undefined)
            : undefined,
          lastMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as ConversationRead)
      : null;
  const activeConversation = selectedConversation ?? fallbackConversation;

  useEffect(() => {
    if (!selectedConversationId || !activeConversation || activeConversation.type !== 'direct')
      return;
    const otherId = getOtherMemberId(activeConversation);
    if (otherId && blockedUsers.has(otherId)) {
      handleBackToList();
    }
  }, [selectedConversationId, activeConversation, blockedUsers, getOtherMemberId]);

  if (loading) {
    return (
      <div className="page-feed pt-6 max-w-3xl mx-auto">
        <div className="text-center text-neutral-500 py-20">Cargando conversaciones...</div>
      </div>
    );
  }

  // Chat View (when conversation is selected)
  if (selectedConversationId && activeConversation) {
    const clearedAt = selectedConversationId
      ? clearedConversations[selectedConversationId]
      : undefined;
    const visibleMessages = clearedAt
      ? messages.filter((msg) => msg.createdAt.getTime() > clearedAt)
      : messages;

    const attachmentItems = visibleMessages.flatMap((msg) => {
      const attachments = msg.attachments ?? [];
      return attachments.map((att) => ({
        messageId: msg.id,
        senderId: msg.senderId,
        createdAt: msg.createdAt,
        attachment: att,
      }));
    });

    return (
      <div className="page-feed pt-0 max-w-3xl mx-auto h-[calc(100vh-120px)] flex flex-col">
        {/* Chat Header */}
        <div className="flex items-center gap-4 py-4 border-b border-neutral-800/50">
          <button
            onClick={handleBackToList}
            className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 flex items-center justify-center">
            <Users size={18} className="text-amber-500" />
          </div>
          {activeConversation.type === 'direct' ? (
            <button
              type="button"
              onClick={handleOpenDetails}
              aria-label="Ver detalles del chat"
              className="flex-1 text-left hover:opacity-80 transition-opacity cursor-pointer"
            >
              <h2 className="text-white font-medium">{getConversationName(activeConversation)}</h2>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenGroupOptions}
              aria-label="Opciones del grupo"
              className="flex-1 text-left hover:opacity-80 transition-opacity cursor-pointer"
            >
              <h2 className="text-white font-medium">{getConversationName(activeConversation)}</h2>
              {activeConversation.type === 'group' && (
                <span className="text-xs text-neutral-500">Grupo</span>
              )}
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-6 space-y-4 chat-scroll">
          {visibleMessages.length === 0 ? (
            <div className="text-center text-neutral-500 py-10">
              {clearedAt ? (
                <div className="space-y-3">
                  <p>Chat limpiado localmente.</p>
                  <button
                    type="button"
                    onClick={handleRestoreChatLocal}
                    className="px-4 py-2 rounded-lg bg-neutral-800 text-neutral-200 hover:bg-neutral-700 transition-colors text-sm"
                  >
                    Mostrar mensajes
                  </button>
                </div>
              ) : (
                'No hay mensajes aún. ¡Envía el primero!'
              )}
            </div>
          ) : (
            visibleMessages.map((msg) => (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                className={`flex ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] px-4 py-3 rounded-2xl ${
                    msg.senderId === user?.uid
                      ? 'bg-amber-600 text-white'
                      : 'bg-neutral-800/80 text-neutral-100'
                  } ${highlightMessageId === msg.id ? 'ring-2 ring-amber-400' : ''}`}
                >
                  <div className="text-sm leading-relaxed">{msg.text}</div>
                  <div className="text-xs opacity-60 mt-1.5 text-right">
                    {new Date(msg.createdAt).toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSendMessage} className="py-4 border-t border-neutral-800/50">
          <div className="flex gap-3">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Escribe un mensaje..."
              className="flex-1 px-5 py-3 bg-neutral-900/50 border border-neutral-800 rounded-full text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-black rounded-full hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium flex items-center gap-2"
            >
              <Send size={18} />
            </button>
          </div>
        </form>

        {/* Group Options Modal (Full Page Style) */}
        {showGroupOptions && activeConversation.type === 'group' && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm overflow-y-auto">
            <div className="page-feed pt-6 max-w-3xl mx-auto pb-10">
              {/* Header */}
              <div className="flex items-center gap-4 mb-8">
                <button
                  type="button"
                  onClick={() => setShowGroupOptions(false)}
                  aria-label="Volver al chat"
                  className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>
                <h1 className="text-2xl font-serif font-light text-white">Detalles del Grupo</h1>
              </div>

              {/* Group Info */}
              <div className="flex flex-col items-center py-8 border-b border-neutral-800/50">
                <div className="w-24 h-24 rounded-full bg-neutral-800 border-2 border-neutral-700 overflow-hidden flex items-center justify-center mb-4">
                  {groupOptionsGroup?.iconUrl ? (
                    <img
                      src={groupOptionsGroup.iconUrl}
                      alt={groupOptionsGroup?.name || 'Grupo'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl text-neutral-400">
                      {(groupOptionsGroup?.name || getConversationName(activeConversation) || 'G')
                        .charAt(0)
                        .toUpperCase()}
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-medium text-white mb-1">
                  {groupOptionsGroup?.name || getConversationName(activeConversation)}
                </h2>
                <p className="text-sm text-neutral-500">Grupo</p>
              </div>

              {/* Actions */}
              <div className="mt-8 space-y-2">
                {groupOptionsLoading && <div className="text-sm text-neutral-500">Cargando...</div>}
                {groupMemberData?.muted ? (
                  <button
                    type="button"
                    onClick={handleUnmuteGroup}
                    disabled={isTogglingGroupMute}
                    className="w-full flex items-center gap-4 p-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 rounded-xl transition-all text-left cursor-pointer disabled:opacity-50"
                  >
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                      <BellOff size={18} className="text-amber-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-amber-400 font-medium">Quitar silencio</p>
                      <p className="text-xs text-amber-300">{getGroupMuteStatusText()}</p>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowGroupMuteModal(true)}
                    disabled={isTogglingGroupMute}
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
                  onClick={() => {
                    if (activeConversation.groupId) {
                      navigate(`/group/${activeConversation.groupId}`);
                    }
                    setShowGroupOptions(false);
                  }}
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
                {groupOptionsGroup?.ownerId === user?.uid && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeConversation.groupId) {
                        navigate(`/group/${activeConversation.groupId}/edit`);
                      }
                      setShowGroupOptions(false);
                    }}
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
              </div>
            </div>
          </div>
        )}

        {/* Conversation Search Modal */}
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
                  value={searchConversationQuery}
                  onChange={(event) => setSearchConversationQuery(event.target.value)}
                  placeholder="Escribe para buscar..."
                  className="w-full bg-neutral-800/60 border border-neutral-700 rounded-lg px-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/60 transition-colors"
                />
                <div className="max-h-[45vh] overflow-y-auto space-y-2">
                  {searchConversationQuery.trim() === '' ? (
                    <div className="text-sm text-neutral-500 text-center py-8">
                      Escribe un termino para buscar.
                    </div>
                  ) : (
                    visibleMessages
                      .filter((msg) =>
                        msg.text
                          .toLowerCase()
                          .includes(searchConversationQuery.trim().toLowerCase()),
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
                    onChange={(event) =>
                      setGroupReportReason(event.target.value as UserReportReason)
                    }
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
        {showGroupMuteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowGroupMuteModal(false)}
            />
            <div className="relative w-full max-w-sm mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
                <h3 className="text-lg font-medium text-white">Silenciar grupo</h3>
                <button
                  onClick={() => setShowGroupMuteModal(false)}
                  className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 space-y-2">
                <button
                  onClick={() => handleMuteGroup(1)}
                  disabled={isTogglingGroupMute}
                  className="w-full p-3 text-left text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  1 hora
                </button>
                <button
                  onClick={() => handleMuteGroup(4)}
                  disabled={isTogglingGroupMute}
                  className="w-full p-3 text-left text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  4 horas
                </button>
                <button
                  onClick={() => handleMuteGroup(8)}
                  disabled={isTogglingGroupMute}
                  className="w-full p-3 text-left text-white hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  8 horas
                </button>
                <button
                  onClick={() => handleMuteGroup(null)}
                  disabled={isTogglingGroupMute}
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

  // Conversations List View
  return (
    <div className="page-feed pt-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <p className="text-xs tracking-[0.3em] text-neutral-500 uppercase mb-2">En Conversación</p>
        <h1 className="text-4xl font-serif font-light text-white">Diálogos</h1>
      </div>

      {/* Search */}
      <div className="relative bg-neutral-900/50 border border-neutral-800 rounded-full px-6 py-3.5 mb-6">
        <input
          type="text"
          placeholder="Buscar mensajes o grupos..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-transparent text-white text-center focus:outline-none placeholder:text-neutral-600 font-light"
        />
        <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-neutral-600" size={18} />
      </div>

      {/* Tabs */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex bg-neutral-900/30 border border-neutral-800 rounded-full p-1">
          <button
            onClick={() => setActiveTab('groups')}
            className={`px-8 py-2.5 rounded-full text-sm font-medium transition-all ${
              activeTab === 'groups'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Grupos
          </button>
          <button
            onClick={() => setActiveTab('private')}
            className={`px-8 py-2.5 rounded-full text-sm font-medium transition-all ${
              activeTab === 'private'
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Privados
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && activeConversations.length === 0 && (
        <div className="text-center text-red-400 py-10">{error}</div>
      )}

      {/* Conversations List */}
      <div className="space-y-2">
        {/* Skeleton while group names are loading */}
        {activeTab === 'groups' && !isGroupCacheReady && activeConversations.length > 0 ? (
          <>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4 bg-neutral-900/20 border border-neutral-800/50 rounded-xl"
              >
                <div className="w-14 h-14 rounded-full skeleton" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 skeleton" />
                  <div className="h-3 w-20 skeleton" />
                </div>
              </div>
            ))}
          </>
        ) : activeConversations.length === 0 && !error ? (
          <div className="text-center text-neutral-500 py-10">
            {searchQuery
              ? 'No hay resultados'
              : `No hay ${activeTab === 'groups' ? 'grupos' : 'mensajes privados'} aún`}
          </div>
        ) : (
          activeConversations.map((conv) => {
            const groupInfo = conv.groupId ? groupInfoCache[conv.groupId] : null;
            const name = getConversationName(conv);
            const lastMessageTime = conv.lastMessage?.createdAt
              ? formatRelativeTime(new Date(conv.lastMessage.createdAt))
              : '';

            return (
              <button
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
                className="w-full flex items-center gap-4 p-4 bg-neutral-900/20 hover:bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700/50 rounded-xl transition-all group"
              >
                {/* Icon */}
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-neutral-800 to-neutral-900 border border-neutral-700/50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {groupInfo?.iconUrl ? (
                    <img
                      src={groupInfo.iconUrl}
                      alt={name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Users size={22} className="text-neutral-500" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-medium truncate">{name}</span>
                    {conv.type === 'group' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-neutral-800/80 text-neutral-400 text-xs rounded-full">
                        <Users size={10} />
                        Grupo
                      </span>
                    )}
                  </div>
                  {conv.lastMessage && (
                    <p className="text-neutral-500 text-sm truncate">{conv.lastMessage.text}</p>
                  )}
                </div>

                {/* Right side */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {lastMessageTime && (
                    <span className="text-neutral-500 text-sm">{lastMessageTime}</span>
                  )}
                  <ChevronRight
                    size={18}
                    className="text-neutral-600 group-hover:text-neutral-400 transition-colors"
                  />
                </div>
              </button>
            );
          })
        )}
      </div>

      {activeTab === 'groups' && (
        <div className="mt-10 space-y-10">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-light text-white">Tus grupos</h2>
              <button
                onClick={() => setIsCreateGroupOpen(true)}
                className="text-xs uppercase tracking-widest px-4 py-2 rounded-full border border-amber-500/40 text-amber-200 hover:text-amber-100 hover:border-amber-400 transition-colors"
              >
                + Crear grupo
              </button>
            </div>
            {memberGroupsLoading ? (
              <div className="text-center text-neutral-500 py-6">Cargando grupos...</div>
            ) : memberGroupsError ? (
              <div className="text-center text-red-400 py-6">{memberGroupsError}</div>
            ) : filteredMemberGroups.length === 0 ? (
              <div className="text-center text-neutral-500 py-6">Aun no tienes grupos.</div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredMemberGroups.map((group) => {
                  const stats = getGroupStats(group);
                  return (
                    <div
                      key={group.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/group/${group.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          navigate(`/group/${group.id}`);
                        }
                      }}
                      className="bg-surface-1 border border-neutral-800/50 rounded-lg p-5 cursor-pointer hover:border-neutral-700/70 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center overflow-hidden">
                            {group.iconUrl ? (
                              <img
                                src={group.iconUrl}
                                alt={group.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Users size={20} className="text-neutral-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-white font-medium text-lg truncate">
                              {group.name}
                            </h3>
                            <p className="text-neutral-500 text-sm mt-1 line-clamp-2">
                              {group.description || 'Sin descripcion.'}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleOpenMemberGroup(group);
                          }}
                          className="px-3 py-1.5 rounded text-xs bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
                        >
                          Chat
                        </button>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-neutral-800/50 mt-4">
                        <div className="text-neutral-500 text-xs">
                          {stats.members.toLocaleString('es-ES')} miembros - {stats.postsWeek}{' '}
                          posts/semana
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/group/${group.id}`);
                          }}
                          className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                        >
                          Ver grupo
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      <CreateGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        onCreated={handleGroupCreated}
      />
    </div>
  );
}
