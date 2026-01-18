import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import { CATEGORIES } from '../data';
import {
    GroupDetailView,
    type GroupData,
    type CategoryInfo,
    type RecentPost,
    type TopMember
} from './GroupDetailView';
import { useToast } from './Toast';
import {
    getGroup,
    getGroupJoinStatus,
    getGroupMembers,
    getGroupMemberCount,
    getGroupPostsWeekCount,
    getPostsByGroup,
    getOrCreateGroupConversation,
    getUserProfile,
    joinPublicGroup,
    sendGroupJoinRequest,
    type FirestoreGroup,
    type GroupJoinStatus
} from '../lib/firestore';

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

const getPostTitle = (content: string): string => {
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
                    user ? getGroupJoinStatus(groupIdStr, user.uid) : Promise.resolve('none' as GroupJoinStatus),
                    getPostsByGroup(groupIdStr, 3).catch(() => ({ items: [], lastDoc: null, hasMore: false })),
                    user ? getGroupMembers(groupIdStr, 3).catch(() => []) : Promise.resolve([])
                ]);

                const recent = postsResult.items.map((post) => ({
                    id: post.id,
                    title: getPostTitle(post.content || ''),
                    author: post.authorName || 'Usuario',
                    time: formatRelativeTime(post.createdAt.toDate())
                })) as RecentPost[];

                const topMembersData = await Promise.all(
                    memberRows.map(async (member) => {
                        const profile = await getUserProfile(member.uid);
                        return {
                            id: member.uid,
                            name: profile?.displayName ?? 'Usuario',
                            role: formatRole(member.role),
                            posts: 0
                        } as TopMember;
                    })
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
            topMembers
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
                    fromUserPhoto: user.photoURL || null
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

    const handleNavigateToCategory = () => {
        if (category) {
            navigate(`/category/${category.id}`);
        }
    };

    const handleOpenPost = (_postId: string) => {
        showToast('Detalle de publicacion estara disponible pronto', 'info');
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

    return (
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
            onJoinGroup={handleJoinGroup}
            onGoBack={handleGoBack}
            onNavigateToCategory={handleNavigateToCategory}
            onOpenPost={handleOpenPost}
            onOpenGroupChat={handleOpenGroupChat}
        />
    );
};

export default GroupDetailContainer;
