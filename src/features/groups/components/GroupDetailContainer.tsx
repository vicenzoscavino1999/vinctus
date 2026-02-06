import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { DocumentSnapshot } from 'firebase/firestore';

import { useAuth } from '@/context';
import { CATEGORIES } from '@/shared/constants';
import {
  GroupDetailView,
  type GroupData,
  type CategoryInfo,
  type RecentPost,
  type TopMember,
} from './GroupDetailView';
import CreatePostModal from '@/features/posts/components/CreatePostModal';
import GroupMembersPanel, { type GroupMemberItem } from './GroupMembersPanel';
import { useToast } from '@/shared/ui/Toast';
import {
  getGroup,
  getGroupJoinStatus,
  getGroupMembers,
  getGroupMemberCount,
  getGroupPostsWeekCount,
  getGroupMembersPage,
  getPostsByGroup,
  getOrCreateGroupConversation,
  getUserProfile,
  joinPublicGroup,
  leaveGroupWithSync,
  sendGroupJoinRequest,
  updateGroupMemberRole,
  removeGroupMember,
  type FirestoreGroup,
  type GroupJoinStatus,
} from '@/features/groups/api';

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

const formatRole = (role: string): string => {
  if (role === 'admin') return 'Admin';
  if (role === 'moderator') return 'Mod';
  return 'Miembro';
};

const getPostTitle = (title: string | null | undefined, content: string): string => {
  const trimmedTitle = title?.trim() ?? '';
  if (trimmedTitle)
    return trimmedTitle.length <= 90 ? trimmedTitle : `${trimmedTitle.slice(0, 87)}...`;
  const trimmed = content.trim();
  if (!trimmed) return 'Publicacion sin texto';
  const firstLine = trimmed.split('\n')[0]?.trim() || trimmed;
  if (firstLine.length <= 90) return firstLine;
  return `${firstLine.slice(0, 87)}...`;
};

export const GroupDetailContainer = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [openingChat, setOpeningChat] = useState(false);
  const [group, setGroup] = useState<FirestoreGroup | null>(null);
  const [membersCount, setMembersCount] = useState(0);
  const [postsPerWeek, setPostsPerWeek] = useState(0);
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);
  const [topMembers, setTopMembers] = useState<TopMember[]>([]);
  const [joinStatus, setJoinStatus] = useState<GroupJoinStatus>('none');
  const [joinLoading, setJoinLoading] = useState(false);
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [membersPanelItems, setMembersPanelItems] = useState<GroupMemberItem[]>([]);
  const [membersPanelLoading, setMembersPanelLoading] = useState(false);
  const [membersPanelError, setMembersPanelError] = useState<string | null>(null);
  const [membersPanelBusyUid, setMembersPanelBusyUid] = useState<string | null>(null);
  const [membersPanelSearch, setMembersPanelSearch] = useState('');
  const [membersPanelLastDoc, setMembersPanelLastDoc] = useState<DocumentSnapshot | null>(null);
  const [membersPanelHasMore, setMembersPanelHasMore] = useState(false);
  const [membersPanelLoadingMore, setMembersPanelLoadingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const groupIdStr = groupId || '';

  useEffect(() => {
    let isActive = true;

    const loadGroup = async () => {
      if (!groupIdStr) {
        setError('Grupo no encontrado.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      setGroup(null);
      setMembersCount(0);
      setPostsPerWeek(0);
      setRecentPosts([]);
      setTopMembers([]);
      setJoinStatus('none');
      setJoinLoading(false);

      try {
        const groupDoc = await getGroup(groupIdStr);
        if (!groupDoc) {
          setError('Grupo no encontrado.');
          setIsLoading(false);
          return;
        }

        const [members, posts, status, postsResult, memberRows] = await Promise.all([
          getGroupMemberCount(groupIdStr).catch(() => groupDoc.memberCount ?? 0),
          getGroupPostsWeekCount(groupIdStr).catch(() => 0),
          user
            ? getGroupJoinStatus(groupIdStr, user.uid)
            : Promise.resolve('none' as GroupJoinStatus),
          getPostsByGroup(groupIdStr, 3).catch(() => ({
            items: [],
            lastDoc: null,
            hasMore: false,
          })),
          user ? getGroupMembers(groupIdStr, 3).catch(() => []) : Promise.resolve([]),
        ]);

        const recent = postsResult.items.map((post) => ({
          id: post.id,
          title: getPostTitle(post.title ?? null, post.content || ''),
          author: post.authorName || 'Usuario',
          time: formatRelativeTime(post.createdAt.toDate()),
        })) as RecentPost[];

        const topMembersData = await Promise.all(
          memberRows.map(async (member) => {
            const profile = await getUserProfile(member.uid);
            return {
              id: member.uid,
              name: profile?.displayName ?? 'Usuario',
              role: formatRole(member.role),
              posts: 0,
            } as TopMember;
          }),
        );

        if (!isActive) return;

        setGroup(groupDoc);
        setMembersCount(members);
        setPostsPerWeek(posts);
        setJoinStatus(status);
        setRecentPosts(recent);
        setTopMembers(topMembersData);
        setIsLoading(false);
      } catch (loadError) {
        console.error('Error loading group:', loadError);
        if (!isActive) return;
        setError('No se pudo cargar el grupo.');
        setIsLoading(false);
      }
    };

    void loadGroup();

    return () => {
      isActive = false;
    };
  }, [groupIdStr, user]);

  const categoryData = group?.categoryId
    ? CATEGORIES.find((category) => category.id === group.categoryId)
    : null;

  const category: CategoryInfo | null = categoryData
    ? { id: categoryData.id, label: categoryData.label }
    : null;

  const isOwner = !!user && group?.ownerId === user.uid;
  const isJoined = joinStatus === 'member' || isOwner;
  const canCreatePost = !!user && isJoined;
  const canLeaveGroup = !!user && isJoined && !isOwner;
  const visibility = group?.visibility ?? 'public';
  const joinLabel = isOwner
    ? 'Tu grupo'
    : joinStatus === 'member'
      ? 'Unido'
      : joinStatus === 'pending'
        ? 'Pendiente'
        : visibility === 'private'
          ? 'Solicitar'
          : 'Unirme al grupo';
  const joinDisabled = joinLoading || isOwner || joinStatus !== 'none';
  const canOpenChat = isJoined || isOwner;

  const groupData: GroupData | null = group
    ? {
        id: group.id,
        categoryId: group.categoryId ?? undefined,
        name: group.name,
        description: group.description ?? '',
        members: membersCount,
        postsPerWeek,
        iconUrl: group.iconUrl ?? null,
        icon: (group.name || 'G').charAt(0).toUpperCase(),
        recentPosts,
        topMembers,
      }
    : null;

  const handleJoinGroup = async () => {
    if (!user) {
      showToast('Inicia sesion para unirte a un grupo.', 'info');
      return;
    }
    if (!group) return;
    if (isOwner || joinStatus !== 'none') return;

    setJoinLoading(true);
    try {
      if (visibility === 'public') {
        await joinPublicGroup(group.id, user.uid);
        setJoinStatus('member');
        setMembersCount((prev) => prev + 1);
        showToast('Te uniste al grupo', 'success');
      } else {
        if (!group.ownerId) {
          throw new Error('Grupo privado sin owner');
        }
        await sendGroupJoinRequest({
          groupId: group.id,
          groupName: group.name,
          fromUid: user.uid,
          toUid: group.ownerId,
          message: null,
          fromUserName: user.displayName || 'Usuario',
          fromUserPhoto: user.photoURL || null,
        });
        setJoinStatus('pending');
        showToast('Solicitud enviada', 'success');
      }
    } catch (joinError) {
      console.error('Error joining group:', joinError);
      showToast('No se pudo procesar la solicitud', 'error');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  const refreshRecentPosts = async () => {
    if (!groupIdStr) return;
    try {
      const [postsResult, weekCount] = await Promise.all([
        getPostsByGroup(groupIdStr, 3).catch(() => ({ items: [], lastDoc: null, hasMore: false })),
        getGroupPostsWeekCount(groupIdStr).catch(() => postsPerWeek),
      ]);

      const recent = postsResult.items.map((post) => ({
        id: post.id,
        title: getPostTitle(post.title ?? null, post.content || ''),
        author: post.authorName || 'Usuario',
        time: formatRelativeTime(post.createdAt.toDate()),
      })) as RecentPost[];

      setRecentPosts(recent);
      if (Number.isFinite(weekCount)) {
        setPostsPerWeek(weekCount);
      }
    } catch (refreshError) {
      console.error('Error refreshing posts:', refreshError);
    }
  };

  const handleNavigateToCategory = () => {
    if (category) {
      navigate(`/category/${category.id}`);
    }
  };

  const handleOpenPost = (_postId: string) => {
    showToast('Detalle de publicacion estara disponible pronto', 'info');
  };

  const handleOpenMembers = () => {
    if (!groupIdStr) return;
    setShowMembersPanel(true);
  };

  const loadMembersPanel = async (reset = false) => {
    if (!groupIdStr) return;
    if (reset) {
      setMembersPanelLoading(true);
      setMembersPanelError(null);
      setMembersPanelItems([]);
      setMembersPanelLastDoc(null);
      setMembersPanelHasMore(false);
    } else {
      setMembersPanelLoadingMore(true);
    }
    try {
      const result = await getGroupMembersPage(
        groupIdStr,
        30,
        reset ? undefined : (membersPanelLastDoc ?? undefined),
      );
      const profiles = await Promise.all(
        result.items.map((member) => getUserProfile(member.uid).catch(() => null)),
      );
      const items: GroupMemberItem[] = result.items.map((member, index) => ({
        uid: member.uid,
        role: member.role,
        name: profiles[index]?.displayName ?? 'Usuario',
        photoURL: profiles[index]?.photoURL ?? null,
      }));
      setMembersPanelItems((prev) => {
        if (reset) return items;
        const map = new Map(prev.map((item) => [item.uid, item]));
        items.forEach((item) => {
          map.set(item.uid, item);
        });
        return Array.from(map.values());
      });
      setMembersPanelLastDoc(result.lastDoc);
      setMembersPanelHasMore(result.hasMore);
    } catch (membersError) {
      console.error('Error loading members:', membersError);
      setMembersPanelError('No se pudieron cargar los miembros.');
    } finally {
      setMembersPanelLoading(false);
      setMembersPanelLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!showMembersPanel) return;
    setMembersPanelSearch('');
    void loadMembersPanel(true);
  }, [showMembersPanel]);

  const handleLoadMoreMembers = () => {
    if (membersPanelLoadingMore || !membersPanelHasMore) return;
    void loadMembersPanel(false);
  };

  const handleChangeMemberRole = async (uid: string, role: 'member' | 'moderator' | 'admin') => {
    if (!groupIdStr || !isOwner) return;
    if (group?.ownerId === uid) {
      showToast('No puedes cambiar el rol del propietario.', 'info');
      return;
    }
    setMembersPanelBusyUid(uid);
    try {
      await updateGroupMemberRole(groupIdStr, uid, role);
      setMembersPanelItems((prev) =>
        prev.map((member) => (member.uid === uid ? { ...member, role } : member)),
      );
      showToast('Rol actualizado', 'success');
    } catch (roleError) {
      console.error('Error updating role:', roleError);
      showToast('No se pudo actualizar el rol.', 'error');
    } finally {
      setMembersPanelBusyUid(null);
    }
  };

  const handleRemoveMember = async (uid: string) => {
    if (!groupIdStr || !isOwner) return;
    if (group?.ownerId === uid) {
      showToast('No puedes expulsar al propietario.', 'info');
      return;
    }
    if (user?.uid === uid) {
      showToast('No puedes expulsarte a ti mismo.', 'info');
      return;
    }
    const confirmed = window.confirm('¿Seguro que deseas expulsar a este miembro?');
    if (!confirmed) return;

    setMembersPanelBusyUid(uid);
    try {
      await removeGroupMember(groupIdStr, uid);
      setMembersPanelItems((prev) => prev.filter((member) => member.uid !== uid));
      setMembersCount((prev) => Math.max(0, prev - 1));
      showToast('Miembro expulsado', 'success');
    } catch (removeError) {
      console.error('Error removing member:', removeError);
      showToast('No se pudo expulsar al miembro.', 'error');
    } finally {
      setMembersPanelBusyUid(null);
    }
  };

  const handleOpenCreatePost = () => {
    if (!user) {
      showToast('Inicia sesion para publicar', 'info');
      return;
    }
    if (!isJoined) {
      showToast('Unete al grupo para publicar', 'info');
      return;
    }
    setIsCreatePostOpen(true);
  };

  const handleOpenGroupChat = async () => {
    if (!user || !groupIdStr) return;

    setOpeningChat(true);
    try {
      const conversationId = await getOrCreateGroupConversation(groupIdStr, user.uid);
      navigate(`/messages?conversation=${conversationId}`);
    } catch (error) {
      console.error('Error opening group chat:', error);
      showToast('Error al abrir el chat del grupo', 'error');
    } finally {
      setOpeningChat(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!user || !groupIdStr) return;
    if (isOwner) {
      showToast('El propietario no puede salir del grupo.', 'info');
      return;
    }
    const confirmed = window.confirm('¿Seguro que deseas salir del grupo?');
    if (!confirmed) return;

    try {
      await leaveGroupWithSync(groupIdStr, user.uid);
      setJoinStatus('none');
      setMembersCount((prev) => Math.max(0, prev - 1));
      showToast('Saliste del grupo', 'success');
    } catch (leaveError) {
      console.error('Error leaving group:', leaveError);
      showToast('No se pudo salir del grupo', 'error');
    }
  };

  return (
    <>
      <GroupDetailView
        isLoading={isLoading}
        error={error}
        group={groupData}
        category={category}
        isJoined={isJoined}
        joinLabel={joinLabel}
        joinDisabled={joinDisabled}
        canOpenChat={canOpenChat}
        openingChat={openingChat}
        isAuthenticated={!!user}
        canCreatePost={canCreatePost}
        canEditGroup={isOwner}
        canLeaveGroup={canLeaveGroup}
        onJoinGroup={handleJoinGroup}
        onGoBack={handleGoBack}
        onNavigateToCategory={handleNavigateToCategory}
        onOpenPost={handleOpenPost}
        onOpenGroupChat={handleOpenGroupChat}
        onOpenCreatePost={handleOpenCreatePost}
        onEditGroup={() => navigate(`/group/${groupIdStr}/edit`)}
        onOpenMembers={handleOpenMembers}
        onLeaveGroup={handleLeaveGroup}
      />
      <CreatePostModal
        isOpen={isCreatePostOpen}
        onClose={() => setIsCreatePostOpen(false)}
        groupId={groupIdStr || null}
        categoryId={group?.categoryId ?? null}
        redirectTo={null}
        onCreated={() => {
          void refreshRecentPosts();
        }}
      />
      <GroupMembersPanel
        isOpen={showMembersPanel}
        onClose={() => setShowMembersPanel(false)}
        members={membersPanelItems}
        isOwner={isOwner}
        ownerId={group?.ownerId ?? null}
        currentUid={user?.uid ?? null}
        isLoading={membersPanelLoading}
        error={membersPanelError}
        busyUid={membersPanelBusyUid}
        searchQuery={membersPanelSearch}
        onSearchChange={setMembersPanelSearch}
        hasMore={membersPanelHasMore}
        isLoadingMore={membersPanelLoadingMore}
        onLoadMore={handleLoadMoreMembers}
        onChangeRole={handleChangeMemberRole}
        onRemoveMember={handleRemoveMember}
      />
    </>
  );
};

export default GroupDetailContainer;
