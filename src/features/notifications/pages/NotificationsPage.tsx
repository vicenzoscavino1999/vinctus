import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatRelativeTime } from '@/shared/lib/formatUtils';
import { useNavigate } from 'react-router-dom';
import { Check, CheckCheck, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/auth';
import {
  acceptCollaborationRequest,
  getPendingCollaborationRequests,
  rejectCollaborationRequest,
  type CollaborationRequestRead,
} from '@/features/collaborations/api';
import {
  acceptGroupJoinRequest,
  getBlockedUsers,
  getPendingGroupJoinRequests,
  rejectGroupJoinRequest,
  type GroupJoinRequestRead,
} from '@/features/groups/api';
import {
  acceptFollowRequest,
  declineFollowRequest,
  getIncomingFollowRequests,
  getOrCreateDirectConversation,
  type FollowRequestRead,
  type FollowUserRead,
} from '@/features/profile/api';
import {
  deleteNotification,
  getUserActivity,
  markAllNotificationsRead,
  markNotificationRead,
  notifyNotificationsUpdated,
  type ActivityRead,
  type PaginatedResult,
} from '@/features/notifications/api';
import { useToast } from '@/shared/ui/Toast';
import { AppError } from '@/shared/lib/errors';

type FollowRequestWithUser = FollowRequestRead & { fromUser: FollowUserRead | null };
type ActivityFilter = 'all' | 'unread' | 'post_like' | 'post_comment' | 'follow';

const MAX_BLOCKED_SKIP_PAGES = 2;

const isSafeAvatarUrl = (value: string | null | undefined): value is string => {
  if (!value) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const NotificationAvatar = ({ name, photoURL }: { name: string; photoURL?: string | null }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const candidateSrc = isSafeAvatarUrl(photoURL) ? photoURL.trim() : null;
  const safeSrc = candidateSrc && failedSrc !== candidateSrc ? candidateSrc : null;
  const initial = (name.trim() || 'U').charAt(0).toUpperCase();

  if (safeSrc) {
    return (
      <img
        src={safeSrc}
        alt={name}
        onError={() => setFailedSrc(safeSrc)}
        className="w-11 h-11 rounded-full object-cover bg-neutral-800 flex-shrink-0"
      />
    );
  }

  return (
    <div className="w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-300 flex-shrink-0">
      {initial}
    </div>
  );
};

const mergeActivityPages = (prev: ActivityRead[], next: ActivityRead[]): ActivityRead[] => {
  if (prev.length === 0) return next;
  const seen = new Set(prev.map((item) => item.id));
  const merged = [...prev];
  for (const item of next) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
};

const NotificationsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userUid = user?.uid ?? null;
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'requests' | 'activity'>('requests');
  const [requestTab, setRequestTab] = useState<'collaboration' | 'followers' | 'groups'>(
    'collaboration',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest'>('recent');
  const [requests, setRequests] = useState<CollaborationRequestRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collabActionLoading, setCollabActionLoading] = useState<string | null>(null);
  const [groupRequests, setGroupRequests] = useState<GroupJoinRequestRead[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupActionLoading, setGroupActionLoading] = useState<string | null>(null);
  const [followRequests, setFollowRequests] = useState<FollowRequestWithUser[]>([]);
  const [followLoading, setFollowLoading] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const [followActionLoading, setFollowActionLoading] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityRead[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityCursor, setActivityCursor] =
    useState<PaginatedResult<ActivityRead>['lastDoc']>(null);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [activityInitialized, setActivityInitialized] = useState(false);
  const [activityActionLoading, setActivityActionLoading] = useState<string | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const requestsSeqRef = useRef(0);
  const groupSeqRef = useRef(0);
  const followSeqRef = useRef(0);
  const activitySeqRef = useRef(0);
  const activityLoadingMoreRef = useRef(false);

  const loadRequests = useCallback(async () => {
    if (!userUid) return;
    const seq = ++requestsSeqRef.current;
    try {
      setError(null);
      setLoading(true);
      const [data, blockedUids] = await Promise.all([
        getPendingCollaborationRequests(userUid),
        getBlockedUsers(userUid).catch(() => []),
      ]);
      if (seq !== requestsSeqRef.current) return;
      const blockedSet = new Set(blockedUids);
      setRequests(data.filter((req) => !blockedSet.has(req.fromUid)));
    } catch (loadError) {
      if (seq !== requestsSeqRef.current) return;
      console.error('Error loading collaboration requests:', loadError);
      setError('No se pudieron cargar las solicitudes.');
    } finally {
      if (seq === requestsSeqRef.current) {
        setLoading(false);
      }
    }
  }, [userUid]);

  const loadGroupRequests = useCallback(async () => {
    if (!userUid) return;
    const seq = ++groupSeqRef.current;
    try {
      setGroupError(null);
      setGroupLoading(true);
      const [data, blockedUids] = await Promise.all([
        getPendingGroupJoinRequests(userUid),
        getBlockedUsers(userUid).catch(() => []),
      ]);
      if (seq !== groupSeqRef.current) return;
      const blockedSet = new Set(blockedUids);
      setGroupRequests(data.filter((req) => !blockedSet.has(req.fromUid)));
    } catch (loadError) {
      if (seq !== groupSeqRef.current) return;
      console.error('Error loading group requests:', loadError);
      setGroupError('No se pudieron cargar las solicitudes de grupos.');
    } finally {
      if (seq === groupSeqRef.current) {
        setGroupLoading(false);
      }
    }
  }, [userUid]);

  const loadFollowRequests = useCallback(async () => {
    if (!userUid) return;
    const seq = ++followSeqRef.current;
    try {
      setFollowError(null);
      setFollowLoading(true);
      const [result, blockedUids] = await Promise.all([
        getIncomingFollowRequests(userUid, 50),
        getBlockedUsers(userUid).catch(() => []),
      ]);
      if (seq !== followSeqRef.current) return;
      const blockedSet = new Set(blockedUids);
      setFollowRequests(result.items.filter((req) => !blockedSet.has(req.fromUid)));
    } catch (loadError) {
      if (seq !== followSeqRef.current) return;
      console.error('Error loading follow requests:', loadError);
      setFollowError('No se pudieron cargar las solicitudes de seguimiento.');
    } finally {
      if (seq === followSeqRef.current) {
        setFollowLoading(false);
      }
    }
  }, [userUid]);

  const loadActivity = useCallback(
    async (loadMore = false, cursor?: PaginatedResult<ActivityRead>['lastDoc']) => {
      if (!userUid) return;
      if (loadMore && (!cursor || activityLoadingMoreRef.current)) return;

      const seq = ++activitySeqRef.current;
      if (loadMore) {
        activityLoadingMoreRef.current = true;
      }

      try {
        setActivityError(null);
        if (loadMore) {
          setActivityLoadingMore(true);
        } else {
          setActivityLoading(true);
        }

        const blockedUids = await getBlockedUsers(userUid).catch(() => []);
        if (seq !== activitySeqRef.current) return;
        const blockedSet = new Set(blockedUids);

        let nextCursor = loadMore ? (cursor ?? undefined) : undefined;
        let hasMore = false;
        let collected: ActivityRead[] = [];
        let attempts = 0;

        do {
          const result = await getUserActivity(userUid, 20, nextCursor);
          if (seq !== activitySeqRef.current) return;
          const visibleBatch = result.items.filter((item) => !blockedSet.has(item.fromUid));
          collected = mergeActivityPages(collected, visibleBatch);
          nextCursor = result.lastDoc ?? undefined;
          hasMore = result.hasMore && Boolean(result.lastDoc);
          attempts += 1;
        } while (collected.length === 0 && hasMore && attempts <= MAX_BLOCKED_SKIP_PAGES);

        setActivityItems((prev) => (loadMore ? mergeActivityPages(prev, collected) : collected));
        setActivityCursor(nextCursor ?? null);
        setActivityHasMore(hasMore);
      } catch (loadError) {
        if (seq !== activitySeqRef.current) return;
        console.error('Error loading activity:', loadError);
        setActivityError('No se pudieron cargar las notificaciones.');
      } finally {
        if (loadMore) {
          activityLoadingMoreRef.current = false;
        }
        if (seq === activitySeqRef.current) {
          setActivityLoading(false);
          setActivityLoadingMore(false);
        }
      }
    },
    [userUid],
  );

  // Reset all per-account state cleanly whenever the signed-in account changes (including A -> B).
  useEffect(() => {
    requestsSeqRef.current += 1;
    groupSeqRef.current += 1;
    followSeqRef.current += 1;
    activitySeqRef.current += 1;
    activityLoadingMoreRef.current = false;

    setRequests([]);
    setGroupRequests([]);
    setFollowRequests([]);
    setError(null);
    setGroupError(null);
    setFollowError(null);
    setLoading(false);
    setGroupLoading(false);
    setFollowLoading(false);
    setCollabActionLoading(null);
    setGroupActionLoading(null);
    setFollowActionLoading(null);

    setActivityItems([]);
    setActivityCursor(null);
    setActivityHasMore(false);
    setActivityLoading(false);
    setActivityLoadingMore(false);
    setActivityError(null);
    setActivityInitialized(false);
    setActivityActionLoading(null);
    setMarkingAllRead(false);
    setSearchQuery('');
    setActivitySearchQuery('');
    setActivityFilter('all');

    if (!userUid) return;
    void loadRequests();
    void loadGroupRequests();
    void loadFollowRequests();
  }, [userUid, loadRequests, loadGroupRequests, loadFollowRequests]);

  useEffect(() => {
    if (!userUid) return;
    if (activeTab === 'activity' && !activityInitialized) {
      setActivityInitialized(true);
      void loadActivity(false);
    }
  }, [userUid, activeTab, activityInitialized, loadActivity]);

  const handleAccept = async (request: CollaborationRequestRead) => {
    if (!userUid || collabActionLoading === request.id) return;
    const seqAtStart = requestsSeqRef.current;
    setCollabActionLoading(request.id);
    try {
      await acceptCollaborationRequest(request.id);
      if (seqAtStart === requestsSeqRef.current) {
        setRequests((prev) => prev.filter((item) => item.id !== request.id));
      }
      notifyNotificationsUpdated();
      try {
        await getOrCreateDirectConversation(userUid, request.fromUid);
        showToast('Solicitud aceptada. Conversación habilitada.', 'success');
      } catch (convError) {
        console.warn('Accepted collaboration request without direct conversation:', convError);
        showToast(
          'Solicitud aceptada. Abre su perfil o síguelo para iniciar la conversación.',
          'success',
        );
      }
    } catch (acceptError) {
      console.error('Error accepting request:', acceptError);
      if (acceptError instanceof AppError && acceptError.code === 'PERMISSION_DENIED') {
        showToast(
          'No se pudo aceptar: la solicitud ya no está vigente o existe un bloqueo.',
          'error',
        );
        if (seqAtStart === requestsSeqRef.current) {
          void loadRequests();
        }
      } else {
        showToast('No se pudo aceptar la solicitud.', 'error');
      }
    } finally {
      if (seqAtStart === requestsSeqRef.current) {
        setCollabActionLoading(null);
      }
    }
  };

  const handleReject = async (requestId: string) => {
    if (!userUid || collabActionLoading === requestId) return;
    const seqAtStart = requestsSeqRef.current;
    setCollabActionLoading(requestId);
    try {
      await rejectCollaborationRequest(requestId);
      if (seqAtStart === requestsSeqRef.current) {
        setRequests((prev) => prev.filter((item) => item.id !== requestId));
      }
      notifyNotificationsUpdated();
      showToast('Solicitud rechazada.', 'info');
    } catch (rejectError) {
      console.error('Error rejecting request:', rejectError);
      showToast('No se pudo rechazar la solicitud.', 'error');
    } finally {
      if (seqAtStart === requestsSeqRef.current) {
        setCollabActionLoading(null);
      }
    }
  };

  const handleGroupAccept = async (request: GroupJoinRequestRead) => {
    if (!userUid || groupActionLoading === request.id) return;
    const seqAtStart = groupSeqRef.current;
    setGroupActionLoading(request.id);
    try {
      await acceptGroupJoinRequest(request.id);
      if (seqAtStart === groupSeqRef.current) {
        setGroupRequests((prev) => prev.filter((item) => item.id !== request.id));
      }
      notifyNotificationsUpdated();
      showToast('Solicitud de grupo aceptada.', 'success');
    } catch (acceptError) {
      console.error('Error accepting group request:', acceptError);
      if (acceptError instanceof Error && acceptError.message.includes('Grupo no encontrado')) {
        showToast('Este grupo ya no existe.', 'info');
        if (seqAtStart === groupSeqRef.current) {
          void loadGroupRequests();
        }
      } else if (acceptError instanceof AppError && acceptError.code === 'PERMISSION_DENIED') {
        showToast(
          'No se pudo aceptar: la solicitud ya no está vigente o existe un bloqueo.',
          'error',
        );
        if (seqAtStart === groupSeqRef.current) {
          void loadGroupRequests();
        }
      } else {
        showToast('No se pudo aceptar la solicitud de grupo.', 'error');
      }
    } finally {
      if (seqAtStart === groupSeqRef.current) {
        setGroupActionLoading(null);
      }
    }
  };

  const handleGroupReject = async (requestId: string) => {
    if (!userUid || groupActionLoading === requestId) return;
    const seqAtStart = groupSeqRef.current;
    setGroupActionLoading(requestId);
    try {
      await rejectGroupJoinRequest(requestId);
      if (seqAtStart === groupSeqRef.current) {
        setGroupRequests((prev) => prev.filter((item) => item.id !== requestId));
      }
      notifyNotificationsUpdated();
      showToast('Solicitud de grupo rechazada.', 'info');
    } catch (rejectError) {
      console.error('Error rejecting group request:', rejectError);
      showToast('No se pudo rechazar la solicitud de grupo.', 'error');
    } finally {
      if (seqAtStart === groupSeqRef.current) {
        setGroupActionLoading(null);
      }
    }
  };

  const handleFollowAccept = async (request: FollowRequestWithUser) => {
    if (!userUid || followActionLoading === request.id) return;
    const seqAtStart = followSeqRef.current;
    setFollowActionLoading(request.id);
    try {
      await acceptFollowRequest(request.fromUid, request.toUid);
      if (seqAtStart === followSeqRef.current) {
        setFollowRequests((prev) => prev.filter((item) => item.id !== request.id));
      }
      notifyNotificationsUpdated();
      showToast('Solicitud de seguimiento aceptada.', 'success');
    } catch (acceptError) {
      console.error('Error accepting follow request:', acceptError);
      if (acceptError instanceof AppError && acceptError.code === 'PERMISSION_DENIED') {
        showToast(
          'No se pudo aceptar: la solicitud ya no está vigente o existe un bloqueo.',
          'error',
        );
        if (seqAtStart === followSeqRef.current) {
          void loadFollowRequests();
        }
      } else {
        showToast('No se pudo aceptar la solicitud de seguimiento.', 'error');
      }
    } finally {
      if (seqAtStart === followSeqRef.current) {
        setFollowActionLoading(null);
      }
    }
  };

  const handleFollowReject = async (request: FollowRequestWithUser) => {
    if (!userUid || followActionLoading === request.id) return;
    const seqAtStart = followSeqRef.current;
    setFollowActionLoading(request.id);
    try {
      await declineFollowRequest(request.fromUid, request.toUid);
      if (seqAtStart === followSeqRef.current) {
        setFollowRequests((prev) => prev.filter((item) => item.id !== request.id));
      }
      notifyNotificationsUpdated();
      showToast('Solicitud de seguimiento rechazada.', 'info');
    } catch (rejectError) {
      console.error('Error rejecting follow request:', rejectError);
      showToast('No se pudo rechazar la solicitud de seguimiento.', 'error');
    } finally {
      if (seqAtStart === followSeqRef.current) {
        setFollowActionLoading(null);
      }
    }
  };

  const handleMarkActivityRead = async (item: ActivityRead, silent = false) => {
    if (!userUid || item.read || activityActionLoading === item.id) return;
    const seqAtStart = activitySeqRef.current;
    setActivityActionLoading(item.id);
    setActivityItems((prev) =>
      prev.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)),
    );
    try {
      await markNotificationRead(item.id, true);
      notifyNotificationsUpdated();
    } catch (markError) {
      console.error('Error marking notification as read:', markError);
      if (seqAtStart === activitySeqRef.current) {
        setActivityItems((prev) =>
          prev.map((entry) => (entry.id === item.id ? { ...entry, read: false } : entry)),
        );
      }
      if (!silent) {
        showToast('No se pudo marcar como leída.', 'error');
      }
    } finally {
      if (seqAtStart === activitySeqRef.current) {
        setActivityActionLoading(null);
      }
    }
  };

  const handleOpenActivity = (item: ActivityRead, path: string) => {
    if (!item.read) {
      void handleMarkActivityRead(item, true);
    }
    navigate(path);
  };

  const handleDeleteActivity = async (item: ActivityRead) => {
    if (!userUid || activityActionLoading === item.id) return;
    const seqAtStart = activitySeqRef.current;
    const previous = activityItems;
    setActivityActionLoading(item.id);
    setActivityItems((prev) => prev.filter((entry) => entry.id !== item.id));
    try {
      await deleteNotification(item.id);
      notifyNotificationsUpdated();
      showToast('Notificación eliminada.', 'info');
    } catch (deleteError) {
      console.error('Error deleting notification:', deleteError);
      if (seqAtStart === activitySeqRef.current) {
        setActivityItems(previous);
      }
      showToast('No se pudo eliminar la notificación.', 'error');
    } finally {
      if (seqAtStart === activitySeqRef.current) {
        setActivityActionLoading(null);
      }
    }
  };

  const handleMarkAllRead = async () => {
    if (!userUid || markingAllRead) return;
    const unreadIds = activityItems.filter((item) => !item.read).map((item) => item.id);
    if (unreadIds.length === 0) return;

    const seqAtStart = activitySeqRef.current;
    const unreadSet = new Set(unreadIds);
    setMarkingAllRead(true);
    setActivityItems((prev) => prev.map((entry) => ({ ...entry, read: true })));
    try {
      await markAllNotificationsRead(unreadIds);
      notifyNotificationsUpdated();
      showToast('Notificaciones marcadas como leídas.', 'success');
    } catch (markError) {
      console.error('Error marking all notifications read:', markError);
      if (seqAtStart === activitySeqRef.current) {
        setActivityItems((prev) =>
          prev.map((entry) => (unreadSet.has(entry.id) ? { ...entry, read: false } : entry)),
        );
      }
      showToast('No se pudieron marcar todas como leídas.', 'error');
    } finally {
      if (seqAtStart === activitySeqRef.current) {
        setMarkingAllRead(false);
      }
    }
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredCollaborationRequests = useMemo(() => {
    const query = normalizedQuery;
    const matchesQuery = (value: string) =>
      query.length === 0 || value.toLowerCase().includes(query);
    const sortByDate = (a: { createdAt: Date }, b: { createdAt: Date }) =>
      sortBy === 'recent'
        ? b.createdAt.getTime() - a.createdAt.getTime()
        : a.createdAt.getTime() - b.createdAt.getTime();
    return requests
      .filter((item) => matchesQuery(`${item.fromUserName ?? ''} ${item.collaborationTitle ?? ''}`))
      .slice()
      .sort(sortByDate);
  }, [requests, normalizedQuery, sortBy]);

  const filteredFollowRequests = useMemo(() => {
    const query = normalizedQuery;
    const matchesQuery = (value: string) =>
      query.length === 0 || value.toLowerCase().includes(query);
    const sortByDate = (a: { createdAt: Date }, b: { createdAt: Date }) =>
      sortBy === 'recent'
        ? b.createdAt.getTime() - a.createdAt.getTime()
        : a.createdAt.getTime() - b.createdAt.getTime();
    return followRequests
      .filter((item) =>
        matchesQuery(
          `${item.fromUser?.displayName ?? ''} ${item.fromUser?.username ?? ''} ${item.fromUid}`.trim(),
        ),
      )
      .slice()
      .sort(sortByDate);
  }, [followRequests, normalizedQuery, sortBy]);

  const filteredGroupRequests = useMemo(() => {
    const query = normalizedQuery;
    const matchesQuery = (value: string) =>
      query.length === 0 || value.toLowerCase().includes(query);
    const sortByDate = (a: { createdAt: Date }, b: { createdAt: Date }) =>
      sortBy === 'recent'
        ? b.createdAt.getTime() - a.createdAt.getTime()
        : a.createdAt.getTime() - b.createdAt.getTime();
    return groupRequests
      .filter((item) => matchesQuery(`${item.fromUserName ?? ''} ${item.groupName ?? ''}`))
      .slice()
      .sort(sortByDate);
  }, [groupRequests, normalizedQuery, sortBy]);

  const totalPendingRequests = requests.length + followRequests.length + groupRequests.length;
  const unreadActivityCount = useMemo(
    () => activityItems.filter((item) => !item.read).length,
    [activityItems],
  );

  const activeRequestList =
    requestTab === 'collaboration'
      ? filteredCollaborationRequests
      : requestTab === 'followers'
        ? filteredFollowRequests
        : filteredGroupRequests;

  const activeLoading =
    requestTab === 'collaboration'
      ? loading
      : requestTab === 'followers'
        ? followLoading
        : groupLoading;

  const activeError =
    requestTab === 'collaboration' ? error : requestTab === 'followers' ? followError : groupError;

  const retryActiveRequestTab = () => {
    if (requestTab === 'collaboration') {
      void loadRequests();
    } else if (requestTab === 'followers') {
      void loadFollowRequests();
    } else {
      void loadGroupRequests();
    }
  };

  const requestTabTitle =
    requestTab === 'collaboration'
      ? 'Colaboración'
      : requestTab === 'followers'
        ? 'Seguidores'
        : 'Grupos';

  const hasRequestSearch = normalizedQuery.length > 0;
  const emptyText = hasRequestSearch
    ? 'No hay solicitudes que coincidan con tu búsqueda.'
    : requestTab === 'collaboration'
      ? 'No tienes solicitudes de colaboración.'
      : requestTab === 'followers'
        ? 'No tienes solicitudes de seguimiento.'
        : 'No tienes solicitudes de grupos.';

  const filteredActivityItems = useMemo(() => {
    const query = activitySearchQuery.trim().toLowerCase();
    return activityItems.filter((item) => {
      if (activityFilter === 'unread' && item.read) return false;
      if (activityFilter !== 'all' && activityFilter !== 'unread' && item.type !== activityFilter) {
        return false;
      }
      if (!query) return true;
      const name = item.fromUserName ?? '';
      const snippet = item.postSnippet ?? '';
      const comment = item.commentText ?? '';
      return `${name} ${snippet} ${comment}`.toLowerCase().includes(query);
    });
  }, [activityItems, activitySearchQuery, activityFilter]);

  const hasActivityFilter = activityFilter !== 'all' || activitySearchQuery.trim().length > 0;

  return (
    <div className="page-profile pt-6 md:pt-10 max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-serif font-light text-white">Notificaciones</h1>
        <div className="mt-6 flex items-center justify-center gap-6 text-xs uppercase tracking-[0.3em] text-neutral-500">
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`transition-colors inline-flex items-center gap-2 ${
              activeTab === 'requests' ? 'text-brand-gold' : 'hover:text-white'
            }`}
          >
            <span>Solicitudes</span>
            {totalPendingRequests > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 tracking-normal">
                {totalPendingRequests}
              </span>
            )}
          </button>
          <span className="w-px h-4 bg-neutral-700/60" />
          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`transition-colors inline-flex items-center gap-2 ${
              activeTab === 'activity' ? 'text-brand-gold' : 'hover:text-white'
            }`}
          >
            <span>Actividad</span>
            {unreadActivityCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 tracking-normal">
                {unreadActivityCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {!user ? (
        <div className="text-neutral-500 text-sm text-center py-10">
          Inicia sesión para ver tus notificaciones.
        </div>
      ) : (
        <div className="space-y-10">
          {activeTab === 'requests' ? (
            <div className="space-y-8">
              <section>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="text-xl font-serif text-white">Centro de solicitudes</h2>
                  <button
                    type="button"
                    onClick={() => {
                      void loadRequests();
                      void loadGroupRequests();
                      void loadFollowRequests();
                    }}
                    disabled={loading || groupLoading || followLoading}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs uppercase tracking-widest border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw
                      size={13}
                      className={loading || groupLoading || followLoading ? 'animate-spin' : ''}
                    />
                    Actualizar
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    type="button"
                    onClick={() => setRequestTab('collaboration')}
                    className={`text-left p-4 rounded-xl border transition-colors ${
                      requestTab === 'collaboration'
                        ? 'border-amber-500/60 bg-amber-500/10'
                        : 'border-neutral-800/70 bg-neutral-900/30 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-neutral-300 font-medium">Colaboración</span>
                      <span className="text-brand-gold text-lg font-medium">{requests.length}</span>
                    </div>
                    <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest px-3 py-1.5 rounded-full border border-amber-500/40 text-amber-200">
                      Revisar
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestTab('followers')}
                    className={`text-left p-4 rounded-xl border transition-colors ${
                      requestTab === 'followers'
                        ? 'border-amber-500/60 bg-amber-500/10'
                        : 'border-neutral-800/70 bg-neutral-900/30 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-neutral-300 font-medium">Seguidores</span>
                      <span className="text-brand-gold text-lg font-medium">
                        {followRequests.length}
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest px-3 py-1.5 rounded-full border border-amber-500/40 text-amber-200">
                      Revisar
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestTab('groups')}
                    className={`text-left p-4 rounded-xl border transition-colors ${
                      requestTab === 'groups'
                        ? 'border-amber-500/60 bg-amber-500/10'
                        : 'border-neutral-800/70 bg-neutral-900/30 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-neutral-300 font-medium">Grupos</span>
                      <span className="text-brand-gold text-lg font-medium">
                        {groupRequests.length}
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest px-3 py-1.5 rounded-full border border-amber-500/40 text-amber-200">
                      Revisar
                    </div>
                  </button>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setRequestTab('collaboration')}
                    className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                      requestTab === 'collaboration'
                        ? 'border-amber-500/60 text-amber-200'
                        : 'border-neutral-800 text-neutral-500 hover:text-white'
                    }`}
                  >
                    Colaboración
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestTab('followers')}
                    className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                      requestTab === 'followers'
                        ? 'border-amber-500/60 text-amber-200'
                        : 'border-neutral-800 text-neutral-500 hover:text-white'
                    }`}
                  >
                    Seguidores
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestTab('groups')}
                    className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                      requestTab === 'groups'
                        ? 'border-amber-500/60 text-amber-200'
                        : 'border-neutral-800 text-neutral-500 hover:text-white'
                    }`}
                  >
                    Grupos
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-neutral-900/40 border border-neutral-800/70 rounded-full px-4 py-2 flex-1 min-w-[220px]">
                    <Search size={16} className="text-neutral-600" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Buscar por nombre..."
                      className="bg-transparent text-sm text-white placeholder:text-neutral-600 focus:outline-none w-full"
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-neutral-900/40 border border-neutral-800/70 rounded-full px-4 py-2">
                    <span className="text-xs text-neutral-500">Ordenar:</span>
                    <select
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value as 'recent' | 'oldest')}
                      className="bg-transparent text-sm text-white focus:outline-none"
                    >
                      <option value="recent">Recientes</option>
                      <option value="oldest">Antiguos</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-neutral-800/60 pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-serif text-white">{requestTabTitle}</h3>
                    <span className="text-xs uppercase tracking-widest text-neutral-500">
                      {activeRequestList.length}{' '}
                      {activeRequestList.length === 1 ? 'solicitud' : 'solicitudes'}
                    </span>
                  </div>

                  {activeLoading ? (
                    <div className="text-sm text-neutral-500 py-6 text-center">
                      Cargando solicitudes...
                    </div>
                  ) : activeError ? (
                    <div className="text-sm text-red-400 py-6 text-center space-y-3">
                      <p>{activeError}</p>
                      <button
                        type="button"
                        onClick={retryActiveRequestTab}
                        className="px-4 py-1.5 rounded-full text-xs uppercase tracking-widest border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors"
                      >
                        Reintentar
                      </button>
                    </div>
                  ) : activeRequestList.length === 0 ? (
                    <div className="text-sm text-neutral-500 py-6 text-center">{emptyText}</div>
                  ) : (
                    <div className="space-y-3">
                      {requestTab === 'collaboration' &&
                        filteredCollaborationRequests.map((request) => {
                          const isProcessing = collabActionLoading === request.id;
                          const displayName = request.fromUserName || 'Usuario';
                          return (
                            <div
                              key={request.id}
                              className="p-4 border border-neutral-800/70 rounded-xl bg-neutral-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                            >
                              <div className="flex items-start gap-3 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => navigate(`/user/${request.fromUid}`)}
                                  aria-label={`Ver perfil de ${displayName}`}
                                  className="rounded-full focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                                >
                                  <NotificationAvatar
                                    name={displayName}
                                    photoURL={request.fromUserPhoto}
                                  />
                                </button>
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/user/${request.fromUid}`)}
                                    className="text-white font-medium hover:text-amber-200 transition-colors text-left"
                                  >
                                    {displayName}
                                  </button>
                                  <p className="text-neutral-500 text-sm">
                                    Quiere colaborar en{' '}
                                    <span className="text-amber-200/80">
                                      {request.collaborationTitle}
                                    </span>
                                  </p>
                                  <p className="text-neutral-600 text-xs mt-1">
                                    {formatRelativeTime(request.createdAt)}
                                  </p>
                                  {request.message && (
                                    <p className="text-neutral-400 text-sm mt-2">
                                      {request.message}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => void handleAccept(request)}
                                  disabled={isProcessing}
                                  className="px-3 py-1.5 text-xs uppercase tracking-widest rounded-full border border-emerald-500/60 text-emerald-300 hover:text-white hover:border-emerald-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  Aceptar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleReject(request.id)}
                                  disabled={isProcessing}
                                  className="px-3 py-1.5 text-xs uppercase tracking-widest rounded-full border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  Rechazar
                                </button>
                              </div>
                            </div>
                          );
                        })}

                      {requestTab === 'followers' &&
                        filteredFollowRequests.map((request) => {
                          const isProcessing = followActionLoading === request.id;
                          const name =
                            request.fromUser?.displayName ||
                            request.fromUser?.username ||
                            'Usuario';
                          return (
                            <div
                              key={request.id}
                              className="p-4 border border-neutral-800/70 rounded-xl bg-neutral-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                            >
                              <div className="flex items-start gap-3 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => navigate(`/user/${request.fromUid}`)}
                                  aria-label={`Ver perfil de ${name}`}
                                  className="rounded-full focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                                >
                                  <NotificationAvatar
                                    name={name}
                                    photoURL={request.fromUser?.photoURL}
                                  />
                                </button>
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/user/${request.fromUid}`)}
                                    className="text-white font-medium hover:text-amber-200 transition-colors text-left"
                                  >
                                    {name}
                                  </button>
                                  {request.fromUser?.username && (
                                    <p className="text-neutral-500 text-sm">
                                      @{request.fromUser.username}
                                    </p>
                                  )}
                                  <p className="text-neutral-500 text-sm mt-1">Quiere seguirte</p>
                                  <p className="text-neutral-600 text-xs mt-1">
                                    {formatRelativeTime(request.createdAt)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => void handleFollowAccept(request)}
                                  disabled={isProcessing}
                                  className="px-3 py-1.5 text-xs uppercase tracking-widest rounded-full border border-emerald-500/60 text-emerald-300 hover:text-white hover:border-emerald-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  Aceptar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleFollowReject(request)}
                                  disabled={isProcessing}
                                  className="px-3 py-1.5 text-xs uppercase tracking-widest rounded-full border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  Rechazar
                                </button>
                              </div>
                            </div>
                          );
                        })}

                      {requestTab === 'groups' &&
                        filteredGroupRequests.map((request) => {
                          const isProcessing = groupActionLoading === request.id;
                          const displayName = request.fromUserName || 'Usuario';
                          return (
                            <div
                              key={request.id}
                              className="p-4 border border-neutral-800/70 rounded-xl bg-neutral-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                            >
                              <div className="flex items-start gap-3 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => navigate(`/user/${request.fromUid}`)}
                                  aria-label={`Ver perfil de ${displayName}`}
                                  className="rounded-full focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                                >
                                  <NotificationAvatar
                                    name={displayName}
                                    photoURL={request.fromUserPhoto}
                                  />
                                </button>
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/user/${request.fromUid}`)}
                                    className="text-white font-medium hover:text-amber-200 transition-colors text-left"
                                  >
                                    {displayName}
                                  </button>
                                  <p className="text-neutral-500 text-sm">
                                    Quiere unirse a{' '}
                                    <span className="text-amber-200/80">{request.groupName}</span>
                                  </p>
                                  <p className="text-neutral-600 text-xs mt-1">
                                    {formatRelativeTime(request.createdAt)}
                                  </p>
                                  {request.message && (
                                    <p className="text-neutral-400 text-sm mt-2">
                                      {request.message}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => void handleGroupAccept(request)}
                                  disabled={isProcessing}
                                  className="px-3 py-1.5 text-xs uppercase tracking-widest rounded-full border border-emerald-500/60 text-emerald-300 hover:text-white hover:border-emerald-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  Aceptar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleGroupReject(request.id)}
                                  disabled={isProcessing}
                                  className="px-3 py-1.5 text-xs uppercase tracking-widest rounded-full border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  Rechazar
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 bg-neutral-900/40 border border-neutral-800/70 rounded-full px-4 py-2 flex-1 min-w-[220px] max-w-md">
                  <Search size={16} className="text-neutral-600" />
                  <input
                    type="text"
                    value={activitySearchQuery}
                    onChange={(event) => setActivitySearchQuery(event.target.value)}
                    placeholder="Buscar actividad..."
                    className="bg-transparent text-sm text-white placeholder:text-neutral-600 focus:outline-none w-full"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {unreadActivityCount > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleMarkAllRead()}
                      disabled={markingAllRead}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs uppercase tracking-widest border border-amber-500/50 text-amber-200 hover:text-white hover:border-amber-400 transition-colors disabled:opacity-50"
                    >
                      <CheckCheck size={14} />
                      {markingAllRead ? 'Marcando...' : 'Marcar todo como leído'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void loadActivity(false)}
                    disabled={activityLoading}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs uppercase tracking-widest border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={activityLoading ? 'animate-spin' : ''} />
                    Actualizar
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: 'all', label: 'Todas' },
                    { id: 'unread', label: 'No leídas' },
                    { id: 'post_like', label: 'Me gusta' },
                    { id: 'post_comment', label: 'Comentarios' },
                    { id: 'follow', label: 'Seguidores' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setActivityFilter(option.id)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      activityFilter === option.id
                        ? 'border-amber-500/60 bg-amber-500/10 text-amber-200'
                        : 'border-neutral-800 text-neutral-500 hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {activityLoading ? (
                <div className="text-sm text-neutral-500 py-6 text-center">
                  Cargando actividad...
                </div>
              ) : activityError ? (
                <div className="text-sm text-red-400 py-6 text-center space-y-3">
                  <p>{activityError}</p>
                  <button
                    type="button"
                    onClick={() => void loadActivity(false)}
                    className="px-4 py-1.5 rounded-full text-xs uppercase tracking-widest border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors"
                  >
                    Reintentar
                  </button>
                </div>
              ) : filteredActivityItems.length === 0 ? (
                <div className="text-sm text-neutral-500 py-6 text-center">
                  {hasActivityFilter
                    ? 'No hay actividad que coincida con tu filtro.'
                    : 'No hay actividad todavía.'}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredActivityItems.map((item) => {
                    const name = item.fromUserName || 'Usuario';
                    const isFollow = item.type === 'follow';
                    const isBusy = activityActionLoading === item.id;
                    const title =
                      item.type === 'post_like'
                        ? `${name} le dio "Me gusta" a tu publicación`
                        : item.type === 'post_comment'
                          ? `${name} comentó en tu publicación`
                          : `${name} empezó a seguirte`;
                    const detail =
                      item.type === 'post_comment'
                        ? item.commentText
                        : item.type === 'post_like'
                          ? item.postSnippet
                          : null;
                    return (
                      <div
                        key={item.id}
                        className={`p-4 border rounded-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors ${
                          item.read
                            ? 'border-neutral-800/70 bg-neutral-900/20'
                            : 'border-amber-500/40 bg-amber-500/[0.06]'
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <NotificationAvatar name={name} photoURL={item.fromUserPhoto} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {!item.read && (
                                <span
                                  aria-label="No leída"
                                  className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"
                                />
                              )}
                              <p
                                className={`font-medium ${
                                  item.read ? 'text-neutral-300' : 'text-white'
                                }`}
                              >
                                {title}
                              </p>
                            </div>
                            <p className="text-neutral-500 text-sm mt-1">
                              {formatRelativeTime(item.createdAt)}
                            </p>
                            {detail && (
                              <p className="text-neutral-500 text-sm mt-2 line-clamp-2">{detail}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isFollow ? (
                            <button
                              type="button"
                              onClick={() => handleOpenActivity(item, `/user/${item.fromUid}`)}
                              className="px-4 py-1.5 rounded-full text-xs uppercase tracking-widest border border-amber-500/60 text-amber-200 hover:text-white hover:border-amber-400 transition-colors"
                            >
                              Ver perfil
                            </button>
                          ) : item.postId ? (
                            <button
                              type="button"
                              onClick={() => handleOpenActivity(item, `/post/${item.postId}`)}
                              className="px-4 py-1.5 rounded-full text-xs uppercase tracking-widest border border-amber-500/60 text-amber-200 hover:text-white hover:border-amber-400 transition-colors"
                            >
                              Ver
                            </button>
                          ) : null}
                          {!item.read && (
                            <button
                              type="button"
                              onClick={() => void handleMarkActivityRead(item)}
                              disabled={isBusy}
                              aria-label="Marcar como leída"
                              title="Marcar como leída"
                              className="p-2 rounded-full border border-neutral-800 text-neutral-400 hover:text-emerald-300 hover:border-emerald-500/50 transition-colors disabled:opacity-50"
                            >
                              <Check size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleDeleteActivity(item)}
                            disabled={isBusy}
                            aria-label="Eliminar notificación"
                            title="Eliminar notificación"
                            className="p-2 rounded-full border border-neutral-800 text-neutral-500 hover:text-red-300 hover:border-red-500/50 transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activityHasMore && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => void loadActivity(true, activityCursor ?? undefined)}
                    disabled={activityLoadingMore}
                    className="px-5 py-2 rounded-full text-xs uppercase tracking-widest border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {activityLoadingMore ? 'Cargando...' : 'Cargar más'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
