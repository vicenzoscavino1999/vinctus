import { useEffect, useState } from 'react';
import { Search, UserPlus, UserCheck, Check, Clock, X, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import {
  getOrCreateDirectConversation,
  searchUsersByDisplayName,
  getRecentUsers,
  getFollowStatus,
  getAccountVisibilityServer,
  sendFollowRequest,
  acceptFollowRequest,
  declineFollowRequest,
  cancelFollowRequest,
  followPublicUser,
  unfollowUser,
  isUserBlocked,
  type FollowStatus,
  type PublicUserRead,
} from '@/features/profile/api';

const MIN_QUERY_LENGTH = 2;

type FollowStatusState = FollowStatus | 'loading';

interface UserWithStatus extends PublicUserRead {
  followStatus: FollowStatusState;
  isMutual?: boolean;
}

export default function UserSearchPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<UserWithStatus[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<UserWithStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSuggested, setLoadingSuggested] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Load suggested users on mount
  useEffect(() => {
    const loadSuggested = async () => {
      setLoadingSuggested(true);
      try {
        const users = await getRecentUsers(15, user?.uid);

        // Get follow status for each
        const usersWithStatus: UserWithStatus[] = await Promise.all(
          users.map(async (item) => {
            if (!user) return { ...item, followStatus: 'none' as FollowStatusState };
            try {
              const status = await getFollowStatus(user.uid, item.uid, item.accountVisibility);
              let nextStatus = status.status;
              if (
                item.accountVisibility !== 'private' &&
                (nextStatus === 'pending_sent' || nextStatus === 'pending_received')
              ) {
                nextStatus = 'none';
              }
              return { ...item, followStatus: nextStatus, isMutual: status.isMutual };
            } catch {
              return { ...item, followStatus: 'none' as FollowStatusState };
            }
          }),
        );

        setSuggestedUsers(usersWithStatus);
      } catch (err) {
        console.error('Error loading suggested users:', err);
      } finally {
        setLoadingSuggested(false);
      }
    };

    void loadSuggested();
  }, [user]);

  useEffect(() => {
    const trimmed = queryText.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    let isActive = true;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const matches = await searchUsersByDisplayName(trimmed);
        const filtered = user ? matches.filter((item) => item.uid !== user.uid) : matches;

        // Get follow status for each result
        const resultsWithStatus: UserWithStatus[] = await Promise.all(
          filtered.map(async (item) => {
            if (!user) return { ...item, followStatus: 'none' as FollowStatusState };
            try {
              const status = await getFollowStatus(user.uid, item.uid, item.accountVisibility);
              let nextStatus = status.status;
              if (
                item.accountVisibility !== 'private' &&
                (nextStatus === 'pending_sent' || nextStatus === 'pending_received')
              ) {
                nextStatus = 'none';
              }
              return { ...item, followStatus: nextStatus, isMutual: status.isMutual };
            } catch {
              return { ...item, followStatus: 'none' as FollowStatusState };
            }
          }),
        );

        if (isActive) {
          setResults(resultsWithStatus);
        }
      } catch (searchError) {
        console.error('Error searching users:', searchError);
        if (isActive) {
          setResults([]);
          setError('No se pudo buscar usuarios.');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      isActive = false;
      clearTimeout(handle);
    };
  }, [queryText, user]);

  const updateUserStatus = (uid: string, updater: (item: UserWithStatus) => UserWithStatus) => {
    setResults((prev) => prev.map((item) => (item.uid == uid ? updater(item) : item)));
    setSuggestedUsers((prev) => prev.map((item) => (item.uid == uid ? updater(item) : item)));
  };

  const handleFollow = async (target: UserWithStatus) => {
    if (!user) {
      showToast('Necesitas iniciar sesi??n', 'error');
      return;
    }

    try {
      const blocked = await isUserBlocked(user.uid, target.uid);
      if (blocked) {
        showToast('Desbloquea a este usuario para poder seguirlo', 'info');
        return;
      }
    } catch (err) {
      console.error('Error checking block status:', err);
    }

    setActionLoading(target.uid);
    try {
      const visibility = await getAccountVisibilityServer(target.uid);
      if (visibility !== target.accountVisibility) {
        updateUserStatus(target.uid, (item) => ({
          ...item,
          accountVisibility: visibility,
        }));
      }
      if (visibility === 'private') {
        try {
          await sendFollowRequest(user.uid, target.uid);
          updateUserStatus(target.uid, (item) => ({
            ...item,
            followStatus: 'pending_sent' as FollowStatusState,
            isMutual: false,
          }));
          showToast('Solicitud enviada', 'success');
        } catch (err) {
          const code = (err as { code?: string })?.code;
          if (code === 'permission-denied') {
            await followPublicUser(user.uid, target.uid);
            const status = await getFollowStatus(user.uid, target.uid, 'public');
            updateUserStatus(target.uid, (item) => ({
              ...item,
              followStatus: status.status,
              isMutual: status.isMutual,
            }));
            showToast('Siguiendo', 'success');
          } else {
            throw err;
          }
        }
      } else {
        try {
          await Promise.allSettled([cancelFollowRequest(user.uid, target.uid)]);
          await followPublicUser(user.uid, target.uid);
          const status = await getFollowStatus(user.uid, target.uid, visibility);
          updateUserStatus(target.uid, (item) => ({
            ...item,
            followStatus: status.status,
            isMutual: status.isMutual,
          }));
          showToast('Siguiendo', 'success');
        } catch (err) {
          const code = (err as { code?: string })?.code;
          if (code === 'permission-denied') {
            const fallbackVisibility = await getAccountVisibilityServer(target.uid);
            if (fallbackVisibility === 'private') {
              await sendFollowRequest(user.uid, target.uid);
              updateUserStatus(target.uid, (item) => ({
                ...item,
                followStatus: 'pending_sent' as FollowStatusState,
                isMutual: false,
              }));
              showToast('Solicitud enviada', 'success');
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al seguir usuario';
      showToast(message, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAcceptRequest = async (target: UserWithStatus) => {
    if (!user) return;

    setActionLoading(target.uid);
    try {
      await acceptFollowRequest(target.uid, user.uid);
      updateUserStatus(target.uid, (item) => ({
        ...item,
        followStatus: 'none' as FollowStatusState,
        isMutual: false,
      }));
      showToast('Solicitud aceptada', 'success');
    } catch (err) {
      showToast('Error al aceptar solicitud', 'error');
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeclineRequest = async (target: UserWithStatus) => {
    if (!user) return;

    setActionLoading(target.uid);
    try {
      await declineFollowRequest(target.uid, user.uid);
      updateUserStatus(target.uid, (item) => ({
        ...item,
        followStatus: 'none' as FollowStatusState,
        isMutual: false,
      }));
      showToast('Solicitud rechazada', 'info');
    } catch (err) {
      showToast('Error al rechazar solicitud', 'error');
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelRequest = async (target: UserWithStatus) => {
    if (!user) return;

    setActionLoading(target.uid);
    try {
      await cancelFollowRequest(user.uid, target.uid);
      updateUserStatus(target.uid, (item) => ({
        ...item,
        followStatus: 'none' as FollowStatusState,
        isMutual: false,
      }));
      showToast('Solicitud cancelada', 'info');
    } catch (err) {
      showToast('Error al cancelar solicitud', 'error');
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnfollow = async (target: UserWithStatus) => {
    if (!user) return;

    setActionLoading(target.uid);
    try {
      await unfollowUser(user.uid, target.uid);
      updateUserStatus(target.uid, (item) => ({
        ...item,
        followStatus: 'none' as FollowStatusState,
        isMutual: false,
      }));
      showToast('Dejaste de seguir', 'info');
    } catch (err) {
      showToast('Error al dejar de seguir', 'error');
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartChat = async (target: PublicUserRead) => {
    if (!user) {
      showToast('Necesitas iniciar sesión', 'error');
      return;
    }

    setActionLoading(target.uid);
    try {
      const conversationId = await getOrCreateDirectConversation(user.uid, target.uid);
      navigate(`/messages?conversation=${conversationId}`);
    } catch (err) {
      console.error('Error creating conversation:', err);
      showToast('Error al crear conversación', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const trimmedQuery = queryText.trim();
  const showHint = trimmedQuery.length < MIN_QUERY_LENGTH;

  const renderActionButton = (result: UserWithStatus) => {
    const isLoading = actionLoading === result.uid;
    const messageButton = result.isMutual ? (
      <button
        type="button"
        onClick={() => handleStartChat(result)}
        disabled={isLoading}
        className="p-2 rounded-full border border-neutral-700 text-white hover:bg-neutral-900 disabled:opacity-50"
      >
        <MessageCircle size={18} />
      </button>
    ) : null;

    switch (result.followStatus) {
      case 'following':
        return (
          <div className="flex gap-2">
            {messageButton}
            <button
              type="button"
              onClick={() => handleUnfollow(result)}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-neutral-700 text-white text-sm hover:bg-neutral-900 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-neutral-400/30 border-t-neutral-200 rounded-full animate-spin" />
              ) : (
                <>
                  <UserCheck size={16} />
                  Siguiendo
                </>
              )}
            </button>
          </div>
        );
      case 'pending_sent':
        return (
          <button
            type="button"
            onClick={() => handleCancelRequest(result)}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-amber-500/50 text-amber-400 text-sm hover:bg-amber-500/10 disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
            ) : (
              <>
                <Clock size={16} />
                Pendiente
              </>
            )}
          </button>
        );
      case 'pending_received':
        return (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleAcceptRequest(result)}
              disabled={isLoading}
              className="flex items-center gap-1 px-3 py-2 rounded-full bg-green-500/20 border border-green-500/50 text-green-400 text-sm hover:bg-green-500/30 disabled:opacity-50"
            >
              <Check size={16} />
              Aceptar
            </button>
            <button
              type="button"
              onClick={() => handleDeclineRequest(result)}
              disabled={isLoading}
              className="p-2 rounded-full border border-neutral-700 text-neutral-400 hover:text-red-400 hover:border-red-500/50 disabled:opacity-50"
            >
              <X size={16} />
            </button>
          </div>
        );
      default:
        return (
          <button
            type="button"
            onClick={() => handleFollow(result)}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-black text-sm font-medium hover:from-amber-400 hover:to-amber-500 disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : (
              <>
                <UserPlus size={16} />
                Seguir
              </>
            )}
          </button>
        );
    }
  };

  return (
    <div className="page-feed pt-10 max-w-5xl mx-auto">
      <h1 className="text-3xl font-serif font-light text-white mb-6">Buscar usuarios</h1>

      <div className="relative bg-neutral-900/50 border border-neutral-800 rounded-full px-6 py-3 mb-3">
        <input
          type="text"
          aria-label="Buscar usuarios"
          placeholder="Buscar usuarios..."
          value={queryText}
          onChange={(event) => setQueryText(event.target.value)}
          className="w-full bg-transparent text-white text-center focus:outline-none placeholder:text-neutral-600 font-light text-sm"
        />
        <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-neutral-600" size={18} />
      </div>

      {showHint && (
        <div className="text-center text-neutral-500 text-sm mb-4">
          {loadingSuggested ? 'Cargando usuarios...' : 'Usuarios sugeridos'}
        </div>
      )}

      <div className="space-y-2">
        {loading && <div className="p-6 text-center text-neutral-500">Buscando usuarios...</div>}
        {!loading && error && <div className="p-6 text-center text-red-400">{error}</div>}
        {!loading && !error && trimmedQuery.length >= MIN_QUERY_LENGTH && results.length === 0 && (
          <div className="p-6 text-center text-neutral-500">No hay resultados.</div>
        )}

        {/* Show search results or suggested users */}
        {!loading &&
          !error &&
          (trimmedQuery.length >= MIN_QUERY_LENGTH ? results : suggestedUsers).map((result) => {
            const initial = result.displayName ? result.displayName.charAt(0).toUpperCase() : '?';
            return (
              <div
                key={result.uid}
                className="flex items-center gap-4 bg-neutral-900/20 border border-neutral-800/50 rounded-lg p-4"
              >
                <div
                  className="w-12 h-12 rounded-full bg-neutral-800/80 flex items-center justify-center text-lg font-medium text-neutral-300 cursor-pointer hover:ring-2 hover:ring-amber-500/50 transition-all overflow-hidden"
                  onClick={() => navigate(`/user/${result.uid}`)}
                >
                  {result.photoURL ? (
                    <img
                      src={result.photoURL}
                      alt={result.displayName ?? 'Usuario'}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    initial
                  )}
                </div>
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => navigate(`/user/${result.uid}`)}
                >
                  <div className="text-white font-medium truncate hover:text-amber-400 transition-colors">
                    {result.displayName ?? 'Usuario sin nombre'}
                  </div>
                  <div className="text-neutral-600 text-xs truncate">Toca para ver perfil</div>
                </div>
                {renderActionButton(result)}
              </div>
            );
          })}

        {/* Empty state for suggested users */}
        {showHint && !loadingSuggested && suggestedUsers.length === 0 && (
          <div className="p-6 text-center text-neutral-500">No hay usuarios registrados aún.</div>
        )}
      </div>
    </div>
  );
}
