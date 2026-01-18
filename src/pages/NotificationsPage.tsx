import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
    acceptCollaborationRequest,
    acceptGroupJoinRequest,
    acceptFriendRequest,
    getOrCreateDirectConversation,
    getPendingCollaborationRequests,
    getPendingGroupJoinRequests,
    getPendingFriendRequests,
    getUserActivity,
    rejectCollaborationRequest,
    rejectGroupJoinRequest,
    rejectFriendRequest,
    type ActivityRead,
    type CollaborationRequestRead,
    type FriendRequestRead,
    type GroupJoinRequestRead,
    type PaginatedResult
} from '../lib/firestore';
import { useToast } from '../components/Toast';

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

const NotificationsPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'requests' | 'activity'>('requests');
    const [requestTab, setRequestTab] = useState<'collaboration' | 'friendship' | 'groups'>('collaboration');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'recent' | 'oldest'>('recent');
    const [requests, setRequests] = useState<CollaborationRequestRead[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [groupRequests, setGroupRequests] = useState<GroupJoinRequestRead[]>([]);
    const [groupLoading, setGroupLoading] = useState(false);
    const [groupError, setGroupError] = useState<string | null>(null);
    const [groupActionLoading, setGroupActionLoading] = useState<string | null>(null);
    const [friendRequests, setFriendRequests] = useState<FriendRequestRead[]>([]);
    const [friendLoading, setFriendLoading] = useState(false);
    const [friendError, setFriendError] = useState<string | null>(null);
    const [friendActionLoading, setFriendActionLoading] = useState<string | null>(null);
    const [activityItems, setActivityItems] = useState<ActivityRead[]>([]);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityError, setActivityError] = useState<string | null>(null);
    const [activityCursor, setActivityCursor] = useState<PaginatedResult<ActivityRead>['lastDoc']>(null);
    const [activityHasMore, setActivityHasMore] = useState(false);
    const [activityLoadingMore, setActivityLoadingMore] = useState(false);
    const [activitySearchQuery, setActivitySearchQuery] = useState('');

    const loadRequests = useCallback(async () => {
        if (!user) return;
        try {
            setError(null);
            setLoading(true);
            const data = await getPendingCollaborationRequests(user.uid);
            setRequests(data);
        } catch (loadError) {
            console.error('Error loading collaboration requests:', loadError);
            setError('No se pudieron cargar las solicitudes.');
        } finally {
            setLoading(false);
        }
    }, [user]);

    const loadGroupRequests = useCallback(async () => {
        if (!user) return;
        try {
            setGroupError(null);
            setGroupLoading(true);
            const data = await getPendingGroupJoinRequests(user.uid);
            setGroupRequests(data);
        } catch (loadError) {
            console.error('Error loading group requests:', loadError);
            setGroupError('No se pudieron cargar las solicitudes de grupos.');
        } finally {
            setGroupLoading(false);
        }
    }, [user]);

    const loadFriendRequests = useCallback(async () => {
        if (!user) return;
        try {
            setFriendError(null);
            setFriendLoading(true);
            const data = await getPendingFriendRequests(user.uid);
            setFriendRequests(data);
        } catch (loadError) {
            console.error('Error loading friend requests:', loadError);
            setFriendError('No se pudieron cargar las solicitudes de amistad.');
        } finally {
            setFriendLoading(false);
        }
    }, [user]);

    const loadActivity = useCallback(async (loadMore = false) => {
        if (!user) return;
        if (loadMore && !activityCursor) return;

        try {
            setActivityError(null);
            if (loadMore) {
                setActivityLoadingMore(true);
            } else {
                setActivityLoading(true);
            }
            const result = await getUserActivity(
                user.uid,
                20,
                loadMore ? activityCursor ?? undefined : undefined
            );
            setActivityItems((prev) => (loadMore ? [...prev, ...result.items] : result.items));
            setActivityCursor(result.lastDoc);
            setActivityHasMore(result.hasMore);
        } catch (loadError) {
            console.error('Error loading activity:', loadError);
            setActivityError('No se pudieron cargar las notificaciones.');
        } finally {
            setActivityLoading(false);
            setActivityLoadingMore(false);
        }
    }, [user, activityCursor]);

    useEffect(() => {
        void loadRequests();
        void loadGroupRequests();
        void loadFriendRequests();
    }, [loadRequests, loadGroupRequests, loadFriendRequests]);

    useEffect(() => {
        if (!user) {
            setActivityItems([]);
            setActivityCursor(null);
            setActivityHasMore(false);
            setActivityLoading(false);
            setActivityLoadingMore(false);
            setActivityError(null);
            return;
        }
        if (activeTab === 'activity' && activityItems.length === 0 && !activityLoading) {
            void loadActivity(false);
        }
    }, [user, activeTab, activityItems.length, activityLoading, loadActivity]);

    const handleAccept = async (request: CollaborationRequestRead) => {
        if (!user) return;
        try {
            await acceptCollaborationRequest(request.id);
            await getOrCreateDirectConversation(user.uid, request.fromUid);
            setRequests((prev) => prev.filter((item) => item.id !== request.id));
            showToast('Solicitud aceptada. Conversacion habilitada.', 'success');
        } catch (acceptError) {
            console.error('Error accepting request:', acceptError);
            showToast('No se pudo aceptar la solicitud.', 'error');
        }
    };

    const handleReject = async (requestId: string) => {
        try {
            await rejectCollaborationRequest(requestId);
            setRequests((prev) => prev.filter((item) => item.id !== requestId));
            showToast('Solicitud rechazada.', 'info');
        } catch (rejectError) {
            console.error('Error rejecting request:', rejectError);
            showToast('No se pudo rechazar la solicitud.', 'error');
        }
    };

    const handleGroupAccept = async (request: GroupJoinRequestRead) => {
        if (!user) return;
        setGroupActionLoading(request.id);
        try {
            await acceptGroupJoinRequest(request.id);
            setGroupRequests((prev) => prev.filter((item) => item.id !== request.id));
            showToast('Solicitud de grupo aceptada.', 'success');
        } catch (acceptError) {
            console.error('Error accepting group request:', acceptError);
            showToast('No se pudo aceptar la solicitud de grupo.', 'error');
        } finally {
            setGroupActionLoading(null);
        }
    };

    const handleGroupReject = async (requestId: string) => {
        setGroupActionLoading(requestId);
        try {
            await rejectGroupJoinRequest(requestId);
            setGroupRequests((prev) => prev.filter((item) => item.id !== requestId));
            showToast('Solicitud de grupo rechazada.', 'info');
        } catch (rejectError) {
            console.error('Error rejecting group request:', rejectError);
            showToast('No se pudo rechazar la solicitud de grupo.', 'error');
        } finally {
            setGroupActionLoading(null);
        }
    };

    const handleFriendAccept = async (request: FriendRequestRead) => {
        setFriendActionLoading(request.id);
        try {
            await acceptFriendRequest(request.id);
            setFriendRequests((prev) => prev.filter((item) => item.id !== request.id));
            showToast('Solicitud de amistad aceptada.', 'success');
        } catch (acceptError) {
            console.error('Error accepting friend request:', acceptError);
            showToast('No se pudo aceptar la solicitud de amistad.', 'error');
        } finally {
            setFriendActionLoading(null);
        }
    };

    const handleFriendReject = async (requestId: string) => {
        setFriendActionLoading(requestId);
        try {
            await rejectFriendRequest(requestId);
            setFriendRequests((prev) => prev.filter((item) => item.id !== requestId));
            showToast('Solicitud de amistad rechazada.', 'info');
        } catch (rejectError) {
            console.error('Error rejecting friend request:', rejectError);
            showToast('No se pudo rechazar la solicitud de amistad.', 'error');
        } finally {
            setFriendActionLoading(null);
        }
    };

    const normalizedQuery = searchQuery.trim().toLowerCase();

    const filteredCollaborationRequests = useMemo(() => {
        const query = normalizedQuery;
        const matchesQuery = (value: string) => query.length === 0 || value.toLowerCase().includes(query);
        const sortByDate = (a: { createdAt: Date }, b: { createdAt: Date }) => (
            sortBy === 'recent'
                ? b.createdAt.getTime() - a.createdAt.getTime()
                : a.createdAt.getTime() - b.createdAt.getTime()
        );
        return requests
            .filter((item) => matchesQuery(`${item.fromUserName ?? ''} ${item.collaborationTitle ?? ''}`))
            .slice()
            .sort(sortByDate);
    }, [requests, normalizedQuery, sortBy]);

    const filteredFriendRequests = useMemo(() => {
        const query = normalizedQuery;
        const matchesQuery = (value: string) => query.length === 0 || value.toLowerCase().includes(query);
        const sortByDate = (a: { createdAt: Date }, b: { createdAt: Date }) => (
            sortBy === 'recent'
                ? b.createdAt.getTime() - a.createdAt.getTime()
                : a.createdAt.getTime() - b.createdAt.getTime()
        );
        return friendRequests
            .filter((item) => matchesQuery(item.fromUserName ?? ''))
            .slice()
            .sort(sortByDate);
    }, [friendRequests, normalizedQuery, sortBy]);

    const filteredGroupRequests = useMemo(() => {
        const query = normalizedQuery;
        const matchesQuery = (value: string) => query.length === 0 || value.toLowerCase().includes(query);
        const sortByDate = (a: { createdAt: Date }, b: { createdAt: Date }) => (
            sortBy === 'recent'
                ? b.createdAt.getTime() - a.createdAt.getTime()
                : a.createdAt.getTime() - b.createdAt.getTime()
        );
        return groupRequests
            .filter((item) => matchesQuery(`${item.fromUserName ?? ''} ${item.groupName ?? ''}`))
            .slice()
            .sort(sortByDate);
    }, [groupRequests, normalizedQuery, sortBy]);

    const activeRequestList = requestTab === 'collaboration'
        ? filteredCollaborationRequests
        : requestTab === 'friendship'
            ? filteredFriendRequests
            : filteredGroupRequests;

    const activeLoading = requestTab === 'collaboration'
        ? loading
        : requestTab === 'friendship'
            ? friendLoading
            : groupLoading;

    const activeError = requestTab === 'collaboration'
        ? error
        : requestTab === 'friendship'
            ? friendError
            : groupError;
    const requestTabTitle = requestTab === 'collaboration'
        ? 'Colaboracion'
        : requestTab === 'friendship'
            ? 'Amistad'
            : 'Grupos';
    const emptyText = requestTab === 'collaboration'
        ? 'No tienes solicitudes de colaboracion.'
        : requestTab === 'friendship'
            ? 'No tienes solicitudes de amistad.'
            : 'No tienes solicitudes de grupos.';

    const filteredActivityItems = useMemo(() => {
        const query = activitySearchQuery.trim().toLowerCase();
        if (!query) return activityItems;
        return activityItems.filter((item) => {
            const name = item.fromUserName ?? '';
            const snippet = item.postSnippet ?? '';
            const comment = item.commentText ?? '';
            return `${name} ${snippet} ${comment}`.toLowerCase().includes(query);
        });
    }, [activityItems, activitySearchQuery]);

    return (
        <div className="page-profile pt-6 md:pt-10 max-w-5xl mx-auto">
            <div className="text-center mb-10">
                <h1 className="text-3xl md:text-4xl font-serif font-light text-white">Notificaciones</h1>
                <div className="mt-6 flex items-center justify-center gap-6 text-xs uppercase tracking-[0.3em] text-neutral-500">
                    <button
                        onClick={() => setActiveTab('requests')}
                        className={`transition-colors ${activeTab === 'requests' ? 'text-brand-gold' : 'hover:text-white'}`}
                    >
                        Solicitudes
                    </button>
                    <span className="w-px h-4 bg-neutral-700/60" />
                    <button
                        onClick={() => setActiveTab('activity')}
                        className={`transition-colors ${activeTab === 'activity' ? 'text-brand-gold' : 'hover:text-white'}`}
                    >
                        Actividad
                    </button>
                </div>
            </div>

            {!user ? (
                <div className="text-neutral-500 text-sm text-center py-10">
                    Inicia sesion para ver tus notificaciones.
                </div>
            ) : (
                <div className="space-y-10">
                    {activeTab === 'requests' ? (
                        <div className="space-y-8">
                            <section>
                                <h2 className="text-xl font-serif text-white mb-4">Centro de solicitudes</h2>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <button
                                        onClick={() => setRequestTab('collaboration')}
                                        className={`text-left p-4 rounded-xl border transition-colors ${requestTab === 'collaboration'
                                            ? 'border-amber-500/60 bg-amber-500/10'
                                            : 'border-neutral-800/70 bg-neutral-900/30 hover:border-neutral-700'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-neutral-300 font-medium">Colaboracion</span>
                                            <span className="text-brand-gold text-lg font-medium">{requests.length}</span>
                                        </div>
                                        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest px-3 py-1.5 rounded-full border border-amber-500/40 text-amber-200">
                                            Revisar
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setRequestTab('friendship')}
                                        className={`text-left p-4 rounded-xl border transition-colors ${requestTab === 'friendship'
                                            ? 'border-amber-500/60 bg-amber-500/10'
                                            : 'border-neutral-800/70 bg-neutral-900/30 hover:border-neutral-700'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-neutral-300 font-medium">Amistad</span>
                                            <span className="text-brand-gold text-lg font-medium">{friendRequests.length}</span>
                                        </div>
                                        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest px-3 py-1.5 rounded-full border border-amber-500/40 text-amber-200">
                                            Revisar
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setRequestTab('groups')}
                                        className={`text-left p-4 rounded-xl border transition-colors ${requestTab === 'groups'
                                            ? 'border-amber-500/60 bg-amber-500/10'
                                            : 'border-neutral-800/70 bg-neutral-900/30 hover:border-neutral-700'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-neutral-300 font-medium">Grupos</span>
                                            <span className="text-brand-gold text-lg font-medium">{groupRequests.length}</span>
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
                                        onClick={() => setRequestTab('collaboration')}
                                        className={`px-4 py-2 rounded-full text-sm border transition-colors ${requestTab === 'collaboration'
                                            ? 'border-amber-500/60 text-amber-200'
                                            : 'border-neutral-800 text-neutral-500 hover:text-white'
                                            }`}
                                    >
                                        Colaboracion
                                    </button>
                                    <button
                                        onClick={() => setRequestTab('friendship')}
                                        className={`px-4 py-2 rounded-full text-sm border transition-colors ${requestTab === 'friendship'
                                            ? 'border-amber-500/60 text-amber-200'
                                            : 'border-neutral-800 text-neutral-500 hover:text-white'
                                            }`}
                                    >
                                        Amistad
                                    </button>
                                    <button
                                        onClick={() => setRequestTab('groups')}
                                        className={`px-4 py-2 rounded-full text-sm border transition-colors ${requestTab === 'groups'
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
                                            {activeRequestList.length} solicitudes
                                        </span>
                                    </div>

                                    {activeLoading ? (
                                        <div className="text-sm text-neutral-500 py-6 text-center">Cargando solicitudes...</div>
                                    ) : activeError ? (
                                        <div className="text-sm text-red-400 py-6 text-center">{activeError}</div>
                                    ) : activeRequestList.length === 0 ? (
                                        <div className="text-sm text-neutral-500 py-6 text-center">{emptyText}</div>
                                    ) : (
                                        <div className="space-y-3">
                                            {requestTab === 'collaboration' && filteredCollaborationRequests.map((request) => (
                                                <div
                                                    key={request.id}
                                                    className="p-4 border border-neutral-800/70 rounded-xl bg-neutral-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                                                >
                                                    <div className="flex items-start gap-3 min-w-0">
                                                        <div className="w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-300">
                                                            {(request.fromUserName || 'U').charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-white font-medium">
                                                                {request.fromUserName || 'Usuario'}
                                                            </p>
                                                            <p className="text-neutral-500 text-sm">
                                                                Quiere colaborar en <span className="text-amber-200/80">{request.collaborationTitle}</span>
                                                            </p>
                                                            {request.message && (
                                                                <p className="text-neutral-600 text-sm mt-2">{request.message}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={() => handleAccept(request)}
                                                            className="px-3 py-1.5 text-xs uppercase tracking-widest rounded-full border border-emerald-500/60 text-emerald-300 hover:text-white hover:border-emerald-300 transition-colors"
                                                        >
                                                            Aceptar
                                                        </button>
                                                        <button
                                                            onClick={() => handleReject(request.id)}
                                                            className="px-3 py-1.5 text-xs uppercase tracking-widest rounded-full border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
                                                        >
                                                            Rechazar
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                            {requestTab === 'friendship' && filteredFriendRequests.map((request) => {
                                                const isProcessing = friendActionLoading === request.id;
                                                return (
                                                    <div
                                                        key={request.id}
                                                        className="p-4 border border-neutral-800/70 rounded-xl bg-neutral-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                                                    >
                                                        <div className="flex items-start gap-3 min-w-0">
                                                            <div className="w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-300">
                                                                {(request.fromUserName || 'U').charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-white font-medium">
                                                                    {request.fromUserName || 'Usuario'}
                                                                </p>
                                                                <p className="text-neutral-500 text-sm">
                                                                    Quiere agregarte como amigo
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <button
                                                                onClick={() => handleFriendAccept(request)}
                                                                disabled={isProcessing}
                                                                className="px-3 py-1.5 text-xs uppercase tracking-widest rounded-full border border-emerald-500/60 text-emerald-300 hover:text-white hover:border-emerald-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                            >
                                                                Aceptar
                                                            </button>
                                                            <button
                                                                onClick={() => handleFriendReject(request.id)}
                                                                disabled={isProcessing}
                                                                className="px-3 py-1.5 text-xs uppercase tracking-widest rounded-full border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                            >
                                                                Rechazar
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {requestTab === 'groups' && filteredGroupRequests.map((request) => {
                                                const isProcessing = groupActionLoading === request.id;
                                                return (
                                                    <div
                                                        key={request.id}
                                                        className="p-4 border border-neutral-800/70 rounded-xl bg-neutral-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                                                    >
                                                        <div className="flex items-start gap-3 min-w-0">
                                                            <div className="w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-300">
                                                                {(request.fromUserName || 'U').charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-white font-medium">
                                                                    {request.fromUserName || 'Usuario'}
                                                                </p>
                                                                <p className="text-neutral-500 text-sm">
                                                                    Quiere unirse a <span className="text-amber-200/80">{request.groupName}</span>
                                                                </p>
                                                                {request.message && (
                                                                    <p className="text-neutral-600 text-sm mt-2">{request.message}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <button
                                                                onClick={() => handleGroupAccept(request)}
                                                                disabled={isProcessing}
                                                                className="px-3 py-1.5 text-xs uppercase tracking-widest rounded-full border border-emerald-500/60 text-emerald-300 hover:text-white hover:border-emerald-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                            >
                                                                Aceptar
                                                            </button>
                                                            <button
                                                                onClick={() => handleGroupReject(request.id)}
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
                            <div className="flex items-center gap-2 bg-neutral-900/40 border border-neutral-800/70 rounded-full px-4 py-2 max-w-md">
                                <Search size={16} className="text-neutral-600" />
                                <input
                                    type="text"
                                    value={activitySearchQuery}
                                    onChange={(event) => setActivitySearchQuery(event.target.value)}
                                    placeholder="Buscar actividad..."
                                    className="bg-transparent text-sm text-white placeholder:text-neutral-600 focus:outline-none w-full"
                                />
                            </div>

                            {activityLoading ? (
                                <div className="text-sm text-neutral-500 py-6 text-center">Cargando actividad...</div>
                            ) : activityError ? (
                                <div className="text-sm text-red-400 py-6 text-center">{activityError}</div>
                            ) : filteredActivityItems.length === 0 ? (
                                <div className="text-sm text-neutral-500 py-6 text-center">
                                    No hay actividad todavia.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredActivityItems.map((item) => {
                                        const name = item.fromUserName || 'Usuario';
                                        const title = item.type === 'post_like'
                                            ? `${name} le dio "Me gusta" a tu publicacion`
                                            : `${name} comento en tu publicacion`;
                                        const detail = item.type === 'post_comment'
                                            ? item.commentText
                                            : item.postSnippet;
                                        return (
                                            <div
                                                key={item.id}
                                                className="p-4 border border-neutral-800/70 rounded-xl bg-neutral-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-white font-medium">{title}</p>
                                                    <p className="text-neutral-600 text-sm mt-1">
                                                        {formatRelativeTime(item.createdAt)}
                                                    </p>
                                                    {detail && (
                                                        <p className="text-neutral-500 text-sm mt-2 line-clamp-2">
                                                            {detail}
                                                        </p>
                                                    )}
                                                </div>
                                                {item.postId && (
                                                    <button
                                                        onClick={() => navigate(`/post/${item.postId}`)}
                                                        className="px-4 py-1.5 rounded-full text-xs uppercase tracking-widest border border-amber-500/60 text-amber-200 hover:text-white hover:border-amber-400 transition-colors"
                                                    >
                                                        Ver
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {activityHasMore && (
                                <div className="flex justify-center">
                                    <button
                                        onClick={() => void loadActivity(true)}
                                        disabled={activityLoadingMore}
                                        className="px-5 py-2 rounded-full text-xs uppercase tracking-widest border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {activityLoadingMore ? 'Cargando...' : 'Cargar mas'}
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
