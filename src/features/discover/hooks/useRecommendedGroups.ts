import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import { AppError } from '@/shared/lib/errors';
import { useToast } from '@/shared/ui/Toast';
import {
  getGroupJoinStatus,
  getGroups,
  joinPublicGroup,
  sendGroupJoinRequest,
  type FirestoreGroup,
  type GroupJoinStatus,
} from '@/features/groups/api';
import {
  filterRecommendedGroups,
  type SearchFiltersState,
} from '@/features/discover/model/categoryFilter';

/**
 * Every group (the trend ranking counts them) and the ones the search and filters leave, with
 * the signed-in user's join status for each and the join or request action.
 */
export const useRecommendedGroups = ({
  searchQuery,
  filters,
}: {
  searchQuery: string;
  filters: SearchFiltersState;
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [allGroups, setAllGroups] = useState<FirestoreGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [groupsReloadToken, setGroupsReloadToken] = useState(0);
  const [groupJoinStatusMap, setGroupJoinStatusMap] = useState<Record<string, GroupJoinStatus>>({});
  const [groupActionLoading, setGroupActionLoading] = useState<string | null>(null);

  const groups = useMemo(
    () => filterRecommendedGroups(allGroups, { searchQuery, filters }),
    [allGroups, searchQuery, filters],
  );

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
  }, [groupsReloadToken]);

  useEffect(() => {
    if (!user || groups.length === 0) {
      return;
    }
    let isActive = true;
    const pending = groups.filter((group) => groupJoinStatusMap[group.id] === undefined);
    if (pending.length === 0) return;

    const loadStatuses = async () => {
      const updates: Record<string, GroupJoinStatus> = {};
      const settled = await Promise.allSettled(
        pending.map(async (group) => {
          const status = await getGroupJoinStatus(group.id, user.uid);
          return { groupId: group.id, status };
        }),
      );
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          updates[result.value.groupId] = result.value.status;
        } else {
          console.error('Error loading group status:', result.reason);
        }
      }
      if (isActive && Object.keys(updates).length > 0) {
        setGroupJoinStatusMap((prev) => ({ ...prev, ...updates }));
      }
    };

    void loadStatuses();

    return () => {
      isActive = false;
    };
  }, [groups, user, groupJoinStatusMap]);

  /** A public group never stays "pending": a stale request there means the user can just join. */
  const getEffectiveJoinStatus = (group: FirestoreGroup): GroupJoinStatus => {
    const rawStatus = groupJoinStatusMap[group.id] ?? 'none';
    const visibility = group.visibility ?? 'public';
    return visibility === 'public' && rawStatus === 'pending' ? 'none' : rawStatus;
  };

  const handleGroupAction = async (group: FirestoreGroup) => {
    if (!user) {
      showToast('Inicia sesion para unirte a grupos', 'info');
      return;
    }

    const visibility = group.visibility ?? 'public';
    const status = getEffectiveJoinStatus(group);
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
      if (actionError instanceof AppError && actionError.code === 'PERMISSION_DENIED') {
        showToast('No puedes unirte directamente a este grupo.', 'error');
      } else {
        showToast('No se pudo procesar la solicitud', 'error');
      }
    } finally {
      setGroupActionLoading(null);
    }
  };

  const getGroupActionLabel = (group: FirestoreGroup): string => {
    if (user && group.ownerId === user.uid) return 'Tu grupo';
    const status = getEffectiveJoinStatus(group);
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
    retryGroups: () => setGroupsReloadToken((prev) => prev + 1),
    handleGroupAction,
    getGroupActionLabel,
  };
};
