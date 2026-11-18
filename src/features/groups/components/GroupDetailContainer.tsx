import { useParams, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentSnapshot } from 'firebase/firestore';

import { useAuth } from '@/context/auth';
import { CATEGORIES } from '@/shared/constants';
import {
  GroupDetailView,
  type GroupData,
  type CategoryInfo,
  type RecentPost,
  type TopMember,
} from './GroupDetailView';
import CreatePostModal from '@/features/posts/components/CreatePostModal';
import { FEED_CACHE_INVALIDATED_EVENT } from '@/features/posts/model/feedCache';
import GroupMembersPanel, { type GroupMemberItem } from './GroupMembersPanel';
import { useToast } from '@/shared/ui/Toast';
import {
  getBlockedUsers,
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
import { formatRelativeTime } from '@/shared/lib/formatUtils';
import { AppError } from '@/shared/lib/errors';

// formatRelativeTime imported from @/shared/lib/formatUtils

const getPostBodyText = (post: { text?: string; content?: string }): string =>
  post.text || post.content || '';

const getPostAuthorName = (post: {
  authorSnapshot?: { displayName?: string | null };
  authorName?: string;
}): string => post.authorSnapshot?.displayName || post.authorName || 'Usuario';

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

const GroupDetailSession = () => {
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
  const membersPanelLastDocRef = useRef<DocumentSnapshot | null>(null);
  const [membersPanelHasMore, setMembersPanelHasMore] = useState(false);
  const [membersPanelLoadingMore, setMembersPanelLoadingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshSeqRef = useRef(0);
  const membersSeqRef = useRef(0);
  const blockedUidsRef = useRef<Set<string>>(new Set());

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

        const isGroupOwner = !!user && groupDoc.ownerId === user.uid;
        const isPrivateGroup = groupDoc.visibility === 'private';

        const status = user
          ? await getGroupJoinStatus(groupIdStr, user.uid)
          : ('none' as GroupJoinStatus);
        const canViewContent = !isPrivateGroup || isGroupOwner || status === 'member';

        const [members, posts, postsResult, memberRows, blockedUids] = await Promise.all([
          canViewContent
            ? getGroupMemberCount(groupIdStr).catch(() => groupDoc.memberCount ?? 0)
            : Promise.resolve(groupDoc.memberCount ?? 0),
          canViewContent ? getGroupPostsWeekCount(groupIdStr).catch(() => 0) : Promise.resolve(0),
          canViewContent
            ? getPostsByGroup(groupIdStr, 3).catch(() => ({
                items: [],
                lastDoc: null,
                hasMore: false,
              }))
            : Promise.resolve({ items: [], lastDoc: null, hasMore: false }),
          canViewContent && user
            ? getGroupMembers(groupIdStr, 3).catch(() => [])
            : Promise.resolve([]),
          user ? getBlockedUsers(user.uid).catch(() => []) : Promise.resolve([]),
        ]);

        const blockedSet = new Set(blockedUids);
        blockedUidsRef.current = blockedSet;
        const visibleMemberRows = memberRows.filter((member) => !blockedSet.has(member.uid));

        const recent = postsResult.items.map((post) => ({
          id: post.id,
          title: getPostTitle(post.title ?? null, getPostBodyText(post)),
          author: getPostAuthorName(post),
          time: formatRelativeTime(post.createdAt.toDate()),
        })) as RecentPost[];

        if (!isActive) return;

        const baseTopMembers = visibleMemberRows.map(
          (member) =>
            ({
              id: member.uid,
              name: 'Usuario',
              photoURL: null,
              role: formatRole(member.role),
              posts: 0,
            }) as TopMember,
        );

        setGroup(groupDoc);
        setMembersCount(members);
        setPostsPerWeek(posts);
        setJoinStatus(status);
        setRecentPosts(recent);
        setTopMembers(baseTopMembers);
        setIsLoading(false);

        void Promise.all(
          visibleMemberRows.map(async (member) => {
            const profile = await getUserProfile(member.uid).catch(() => null);
            return {
              id: member.uid,
              name: profile?.displayName ?? 'Usuario',
              photoURL: profile?.photoURL ?? null,
              role: formatRole(member.role),
              posts: 0,
            } as TopMember;
          }),
        )
          .then((topMembersData) => {
            if (!isActive) return;
            setTopMembers(topMembersData);
          })
          .catch((membersError) => {
            console.error('Error loading top members:', membersError);
          });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIdStr, user?.uid]);

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
  const effectiveJoinStatus: GroupJoinStatus =
    visibility === 'public' && joinStatus === 'pending' ? 'none' : joinStatus;
  const joinLabel = isOwner
    ? 'Tu grupo'
    : effectiveJoinStatus === 'member'
      ? 'Unido'
      : effectiveJoinStatus === 'pending'
        ? 'Pendiente'
        : visibility === 'private'
          ? 'Solicitar'
          : 'Unirme al grupo';
  const joinDisabled = joinLoading || isOwner || effectiveJoinStatus !== 'none';
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
    if (isOwner || effectiveJoinStatus !== 'none') return;

    setJoinLoading(true);
    try {
      if (visibility === 'public') {
        await joinPublicGroup(group.id, user.uid);
        setJoinStatus('member');
        setMembersCount((prev) => prev + 1);
        void refreshRecentPosts();
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
      if (joinError instanceof AppError && joinError.code === 'PERMISSION_DENIED') {
        const refreshedGroup = await getGroup(group.id).catch(() => null);
        if (refreshedGroup) {
          setGroup(refreshedGroup);
        }
        showToast('No puedes unirte directamente a este grupo.', 'error');
      } else {
        showToast('No se pudo procesar la solicitud', 'error');
      }
    } finally {
      setJoinLoading(false);
    }
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  const refreshRecentPosts = useCallback(async () => {
    if (!groupIdStr) return;
    const seq = ++refreshSeqRef.current;
    try {
      const [postsResult, weekCount] = await Promise.all([
        getPostsByGroup(groupIdStr, 3).catch(() => ({ items: [], lastDoc: null, hasMore: false })),
        getGroupPostsWeekCount(groupIdStr).catch(() => null),
      ]);
      if (seq !== refreshSeqRef.current) return;

      const recent = postsResult.items.map((post) => ({
        id: post.id,
        title: getPostTitle(post.title ?? null, getPostBodyText(post)),
        author: getPostAuthorName(post),
        time: formatRelativeTime(post.createdAt.toDate()),
      })) as RecentPost[];

      setRecentPosts(recent);
      if (typeof weekCount === 'number' && Number.isFinite(weekCount)) {
        setPostsPerWeek(weekCount);
      }
    } catch (refreshError) {
      console.error('Error refreshing posts:', refreshError);
    }
  }, [groupIdStr]);

  useEffect(() => {
    const handlePostsInvalidated = () => {
      void refreshRecentPosts();
    };
    window.addEventListener(FEED_CACHE_INVALIDATED_EVENT, handlePostsInvalidated);
    return () => {
      window.removeEventListener(FEED_CACHE_INVALIDATED_EVENT, handlePostsInvalidated);
    };
  }, [refreshRecentPosts]);

  const handleNavigateToCategory = () => {
    if (category) {
      navigate(`/category/${category.id}`);
    }
  };

  const handleOpenPost = (postId: string) => {
    if (!postId) return;
    navigate(`/post/${postId}`);
  };

  const handleOpenMembers = () => {
    if (!groupIdStr) return;
    if (visibility === 'private' && !isJoined) {
      showToast('Unete al grupo para ver sus miembros.', 'info');
      return;
    }
    setShowMembersPanel(true);
  };

  useEffect(() => {
    membersPanelLastDocRef.current = membersPanelLastDoc;
  }, [membersPanelLastDoc]);

  const loadMembersPanel = useCallback(
    async (reset = false) => {
      if (!groupIdStr) return;
      const seq = ++membersSeqRef.current;
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
          reset ? undefined : (membersPanelLastDocRef.current ?? undefined),
        );
        if (seq !== membersSeqRef.current) return;
        const visibleRows = isOwner
          ? result.items
          : result.items.filter((member) => !blockedUidsRef.current.has(member.uid));
        const profiles = await Promise.all(
          visibleRows.map((member) => getUserProfile(member.uid).catch(() => null)),
        );
        if (seq !== membersSeqRef.current) return;
        const items: GroupMemberItem[] = visibleRows.map((member, index) => ({
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
        membersPanelLastDocRef.current = result.lastDoc;
        setMembersPanelHasMore(result.hasMore);
      } catch (membersError) {
        console.error('Error loading members:', membersError);
        if (seq !== membersSeqRef.current) return;
        setMembersPanelError('No se pudieron cargar los miembros.');
      } finally {
        if (seq === membersSeqRef.current) {
          setMembersPanelLoading(false);
          setMembersPanelLoadingMore(false);
        }
      }
    },
    [groupIdStr, isOwner],
  );

  useEffect(() => {
    if (!showMembersPanel) {
      membersSeqRef.current += 1;
      return;
    }
    setMembersPanelSearch('');
    void loadMembersPanel(true);
  }, [showMembersPanel, loadMembersPanel]);

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
      setTopMembers((prev) =>
        prev.map((member) => (member.id === uid ? { ...member, role: formatRole(role) } : member)),
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
      setTopMembers((prev) => prev.filter((member) => member.id !== uid));
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
      setIsCreatePostOpen(false);
      setMembersCount((prev) => Math.max(0, prev - 1));
      setTopMembers((prev) => prev.filter((member) => member.id !== user.uid));
      if (visibility === 'private') {
        refreshSeqRef.current += 1;
        setShowMembersPanel(false);
        setRecentPosts([]);
        setTopMembers([]);
      }
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
        isPrivateLocked={visibility === 'private' && !isJoined}
        onJoinGroup={handleJoinGroup}
        onGoBack={handleGoBack}
        onNavigateToCategory={handleNavigateToCategory}
        onOpenPost={handleOpenPost}
        onOpenMember={(uid) => navigate(user?.uid === uid ? '/profile' : `/user/${uid}`)}
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

export const GroupDetailContainer = () => {
  const { user } = useAuth();
  const { groupId } = useParams<{ groupId: string }>();
  return <GroupDetailSession key={JSON.stringify([user?.uid ?? null, groupId])} />;
};
export default GroupDetailContainer;
