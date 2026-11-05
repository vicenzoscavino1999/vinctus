import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import {
  getGroupJoinStatus,
  getGroups,
  joinPublicGroup,
  sendGroupJoinRequest,
  type FirestoreGroup,
  type GroupJoinStatus,
} from '@/features/groups/api';

/**
 * Every group (the trend ranking counts them) and the four biggest, with the signed-in user's
 * join status for each and the join or request action.
 */
export const useRecommendedGroups = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [allGroups, setAllGroups] = useState<FirestoreGroup[]>([]);
  const [groups, setGroups] = useState<FirestoreGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [groupJoinStatusMap, setGroupJoinStatusMap] = useState<Record<string, GroupJoinStatus>>({});
  const [groupActionLoading, setGroupActionLoading] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadGroups = async () => {
      setGroupsLoading(true);
      setGroupsError(null);
      try {
        const data = await getGroups();
        const sorted = [...data].sort((a, b) => {
          const aMembers = a.memberCount ?? 0;
          const bMembers = b.memberCount ?? 0;
          if (aMembers !== bMembers) return bMembers - aMembers;
          const aTime = a.createdAt ? a.createdAt.getTime() : 0;
          const bTime = b.createdAt ? b.createdAt.getTime() : 0;
          return bTime - aTime;
        });
        if (isActive) {
          setAllGroups(sorted);
          setGroups(sorted.slice(0, 4));
        }
      } catch (loadError) {
        console.error('Error loading groups:', loadError);
        if (isActive) {
          setGroupsError('No se pudieron cargar grupos.');
        }
      } finally {
        if (isActive) {
          setGroupsLoading(false);
        }
      }
    };

    loadGroups();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!user || groups.length === 0) {
      if (!user) setGroupJoinStatusMap({});
      return;
    }
    let isActive = true;
    const pending = groups.filter((group) => groupJoinStatusMap[group.id] === undefined);
    if (pending.length === 0) return;

    const loadStatuses = async () => {
      try {
        const updates: Record<string, GroupJoinStatus> = {};
        await Promise.all(
          pending.map(async (group) => {
            const status = await getGroupJoinStatus(group.id, user.uid);
            updates[group.id] = status;
          }),
        );
        if (isActive) {
          setGroupJoinStatusMap((prev) => ({ ...prev, ...updates }));
        }
      } catch (statusError) {
        console.error('Error loading group status:', statusError);
      }
    };

    loadStatuses();

    return () => {
      isActive = false;
    };
  }, [groups, user, groupJoinStatusMap]);

  const handleGroupAction = async (group: FirestoreGroup) => {
    if (!user) {
      showToast('Inicia sesion para unirte a grupos', 'info');
      return;
    }

    const status = groupJoinStatusMap[group.id] ?? 'none';
    const isOwner = group.ownerId && group.ownerId === user.uid;
    if (isOwner || status === 'member') {
      navigate(`/group/${group.id}`);
      return;
    }
    if (status === 'pending') {
      showToast('Solicitud pendiente', 'info');
      return;
    }

    setGroupActionLoading(group.id);
    try {
      const visibility = group.visibility ?? 'public';
      if (visibility === 'public') {
        await joinPublicGroup(group.id, user.uid);
        setGroupJoinStatusMap((prev) => ({ ...prev, [group.id]: 'member' }));
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
        setGroupJoinStatusMap((prev) => ({ ...prev, [group.id]: 'pending' }));
        showToast('Solicitud enviada', 'success');
      }
    } catch (actionError) {
      console.error('Error joining group:', actionError);
      showToast('No se pudo procesar la solicitud', 'error');
    } finally {
      setGroupActionLoading(null);
    }
  };

  const getGroupActionLabel = (group: FirestoreGroup): string => {
    if (user && group.ownerId === user.uid) return 'Tu grupo';
    const status = groupJoinStatusMap[group.id] ?? 'none';
    if (status === 'member') return 'Unido';
    if (status === 'pending') return 'Pendiente';
    return (group.visibility ?? 'public') === 'public' ? 'Unirme' : 'Solicitar';
  };

  return {
    allGroups,
    groups,
    groupsLoading,
    groupsError,
    groupActionLoading,
    handleGroupAction,
    getGroupActionLabel,
  };
};
