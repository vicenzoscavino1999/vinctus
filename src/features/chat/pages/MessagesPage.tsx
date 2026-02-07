import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/auth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useToast } from '@/shared/ui/Toast';
import {
  getOrCreateGroupConversation,
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
  type UserReportReason,
} from '@/features/chat/api';
import ChatConversationHeader from '@/features/chat/components/ChatConversationHeader';
import ConversationListItem from '@/features/chat/components/ConversationListItem';
import ConversationSearchModal from '@/features/chat/components/ConversationSearchModal';
import GroupFilesModal, { type GroupFileItem } from '@/features/chat/components/GroupFilesModal';
import GroupMuteModal from '@/features/chat/components/GroupMuteModal';
import GroupOptionsOverlay from '@/features/chat/components/GroupOptionsOverlay';
import GroupReportModal from '@/features/chat/components/GroupReportModal';
import MemberGroupCard from '@/features/chat/components/MemberGroupCard';
import MessageComposer from '@/features/chat/components/MessageComposer';
import MessageThread from '@/features/chat/components/MessageThread';
import CreateGroupModal from '@/features/groups/components/CreateGroupModal';

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

const CLEARED_STORAGE_KEY = 'vinctus:clearedConversations';
const DIRECT_PROFILE_PREFETCH_LIMIT = 50;

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
  const memberGroupsRef = useRef<FirestoreGroup[]>([]);
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

  useEffect(() => {
    memberGroupsRef.current = memberGroups;
  }, [memberGroups]);

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
              const existingGroup = memberGroupsRef.current.find(
                (group) => group.id === conv.groupId,
              );
              if (existingGroup) {
                setGroupInfoCache((prev) => ({
                  ...prev,
                  [conv.groupId!]: {
                    name: existingGroup.name,
                    iconUrl: existingGroup.iconUrl ?? undefined,
                  },
                }));
                return;
              }

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
          const uniqueGroupIds = Array.from(new Set(groupIds));
          const existingById = new Map(
            memberGroupsRef.current.map((group) => [group.id, group] as const),
          );
          const reusedGroups: FirestoreGroup[] = [];
          const missingIds: string[] = [];

          uniqueGroupIds.forEach((groupId) => {
            const existing = existingById.get(groupId);
            if (existing) {
              reusedGroups.push(existing);
            } else {
              missingIds.push(groupId);
            }
          });

          const fetchedGroups =
            missingIds.length > 0 ? await Promise.all(missingIds.map((id) => getGroup(id))) : [];

          if (!isActive || currentRequest !== requestId) return;

          const resolved = [
            ...reusedGroups,
            ...(fetchedGroups.filter(Boolean) as FirestoreGroup[]),
          ];
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
    const directConversations = conversations
      .filter((conv) => conv.type === 'direct')
      .slice(0, DIRECT_PROFILE_PREFETCH_LIMIT);

    for (const conv of directConversations) {
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

  const handleBackToList = useCallback(() => {
    setSelectedConversationId(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('conversation');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

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
  }, [
    selectedConversationId,
    activeConversation,
    blockedUsers,
    getOtherMemberId,
    handleBackToList,
  ]);

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

    const attachmentItems: GroupFileItem[] = visibleMessages.flatMap((msg) =>
      (msg.attachments ?? []).map((attachment) => ({
        messageId: msg.id,
        attachment,
      })),
    );

    return (
      <div className="page-feed pt-0 max-w-3xl mx-auto h-[calc(100vh-120px)] flex flex-col">
        {/* Chat Header */}
        <ChatConversationHeader
          conversation={activeConversation}
          title={getConversationName(activeConversation)}
          onBack={handleBackToList}
          onOpenDetails={handleOpenDetails}
          onOpenGroupOptions={handleOpenGroupOptions}
        />

        {/* Messages */}
        <MessageThread
          messages={visibleMessages}
          currentUserId={user?.uid}
          highlightMessageId={highlightMessageId}
          clearedAt={clearedAt}
          onRestoreChatLocal={handleRestoreChatLocal}
        />

        {/* Input */}
        <MessageComposer
          value={newMessage}
          onValueChange={setNewMessage}
          onSubmit={handleSendMessage}
        />

        {/* Group Options Modal (Full Page Style) */}
        <GroupOptionsOverlay
          open={showGroupOptions && activeConversation.type === 'group'}
          groupName={groupOptionsGroup?.name || getConversationName(activeConversation)}
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
            if (activeConversation.groupId) {
              navigate(`/group/${activeConversation.groupId}`);
            }
            setShowGroupOptions(false);
          }}
          onEditGroup={() => {
            if (activeConversation.groupId) {
              navigate(`/group/${activeConversation.groupId}/edit`);
            }
            setShowGroupOptions(false);
          }}
          onLeaveGroup={handleLeaveGroup}
        />

        {/* Conversation Search Modal */}
        <ConversationSearchModal
          open={showSearchModal}
          query={searchConversationQuery}
          messages={visibleMessages}
          currentUserId={user?.uid}
          onClose={() => setShowSearchModal(false)}
          onQueryChange={setSearchConversationQuery}
          onJumpToMessage={handleJumpToMessage}
        />

        {/* Group Report Modal */}
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

        {/* Group Mute Options */}
        <GroupMuteModal
          open={showGroupMuteModal}
          isToggling={isTogglingGroupMute}
          onClose={() => setShowGroupMuteModal(false)}
          onMute={handleMuteGroup}
        />

        {/* Group Files */}
        <GroupFilesModal
          open={showGroupFiles}
          items={attachmentItems}
          onClose={() => setShowGroupFiles(false)}
        />
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

            return (
              <ConversationListItem
                key={conv.id}
                conversation={conv}
                name={name}
                groupIconUrl={groupInfo?.iconUrl}
                onSelect={() => handleSelectConversation(conv.id)}
              />
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
                    <MemberGroupCard
                      key={group.id}
                      group={group}
                      members={stats.members}
                      postsWeek={stats.postsWeek}
                      onNavigateGroup={() => navigate(`/group/${group.id}`)}
                      onOpenChat={() => void handleOpenMemberGroup(group)}
                    />
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
