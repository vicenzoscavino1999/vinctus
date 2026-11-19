import { useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, UserCheck, Check, Clock, X, MessageCircle, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppError } from '@/shared/lib/errors';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import { getGroups, type FirestoreGroup } from '@/features/groups/api';
import {
  getBlockedUsers,
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

const normalizeSearchTerm = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const isPermissionDeniedError = (err: unknown): boolean => {
  if (err instanceof AppError) return err.code === 'PERMISSION_DENIED';
  const code = (err as { code?: unknown })?.code;
  return code === 'permission-denied' || code === 'PERMISSION_DENIED';
};

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
  const [allGroups, setAllGroups] = useState<FirestoreGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSuggested, setLoadingSuggested] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestedError, setSuggestedError] = useState<string | null>(null);
  const [suggestedReloadToken, setSuggestedReloadToken] = useState(0);
  const [searchReloadToken, setSearchReloadToken] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const currentUid = user?.uid ?? null;

  // Load groups once so search also surfaces matching groups (matching native Search tab)
  useEffect(() => {
    let isActive = true;
    const loadGroups = async () => {
      try {
        const items = await getGroups();
        if (isActive) {
          setAllGroups(items);
        }
      } catch (err) {
        console.error('Error loading groups for search:', err);
      }
    };
    void loadGroups();
    return () => {
      isActive = false;
    };
  }, []);

  // Load suggested users on mount / user change
  useEffect(() => {
    let isActive = true;

    const loadSuggested = async () => {
      setLoadingSuggested(true);
      setSuggestedError(null);
      try {
        const [users, blockedIds] = await Promise.all([
          getRecentUsers(20, currentUid ?? undefined),
          currentUid ? getBlockedUsers(currentUid).catch(() => []) : Promise.resolve<string[]>([]),
        ]);
        const blockedSet = new Set(blockedIds);
        const visibleUsers = users
          .filter((item) => item.uid !== currentUid && !blockedSet.has(item.uid))
          .slice(0, 15);

        // Get follow status for each
        const usersWithStatus: UserWithStatus[] = await Promise.all(
          visibleUsers.map(async (item) => {
            if (!currentUid) return { ...item, followStatus: 'none' as FollowStatusState };
            try {
              const status = await getFollowStatus(currentUid, item.uid, item.accountVisibility);
              let nextStatus = status.status;
              if (item.accountVisibility !== 'private' && nextStatus === 'pending_sent') {
                nextStatus = 'none';
              }
              return { ...item, followStatus: nextStatus, isMutual: status.isMutual };
            } catch {
              return { ...item, followStatus: 'none' as FollowStatusState };
            }
          }),
        );

        if (isActive) {
          setSuggestedUsers(usersWithStatus);
        }
      } catch (err) {
        console.error('Error loading suggested users:', err);
        if (isActive) {
          setSuggestedUsers([]);
          setSuggestedError('No se pudieron cargar los usuarios sugeridos.');
        }
      } finally {
        if (isActive) {
          setLoadingSuggested(false);
        }
      }
    };

    void loadSuggested();
    return () => {
      isActive = false;
    };
  }, [currentUid, suggestedReloadToken]);

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
        const [matches, blockedIds] = await Promise.all([
          searchUsersByDisplayName(trimmed, 20),
          currentUid ? getBlockedUsers(currentUid).catch(() => []) : Promise.resolve<string[]>([]),
        ]);
        const blockedSet = new Set(blockedIds);
        const filtered = matches
          .filter((item) => item.uid !== currentUid && !blockedSet.has(item.uid))
          .slice(0, 15);

        // Get follow status for each result
        const resultsWithStatus: UserWithStatus[] = await Promise.all(
          filtered.map(async (item) => {
            if (!currentUid) return { ...item, followStatus: 'none' as FollowStatusState };
            try {
              const status = await getFollowStatus(currentUid, item.uid, item.accountVisibility);
              let nextStatus = status.status;
              if (item.accountVisibility !== 'private' && nextStatus === 'pending_sent') {
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
  }, [queryText, currentUid, searchReloadToken]);

  const matchingGroups = useMemo(() => {
    const trimmed = queryText.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return [];
    const normalized = normalizeSearchTerm(trimmed);
    return allGroups
      .filter(
        (group) =>
          normalizeSearchTerm(group.name || '').includes(normalized) ||
          normalizeSearchTerm(group.description || '').includes(normalized) ||
          normalizeSearchTerm(group.categoryId || '').includes(normalized),
      )
      .slice(0, 6);
  }, [allGroups, queryText]);

  const updateUserStatus = (uid: string, updater: (item: UserWithStatus) => UserWithStatus) => {
    setResults((prev) => prev.map((item) => (item.uid == uid ? updater(item) : item)));
    setSuggestedUsers((prev) => prev.map((item) => (item.uid == uid ? updater(item) : item)));
  };

  const handleFollow = async (target: UserWithStatus) => {
    if (!user) {
      showToast('Necesitas iniciar sesión', 'error');
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
          if (isPermissionDeniedError(err)) {
            const fallbackVisibility = await getAccountVisibilityServer(target.uid);
            if (fallbackVisibility !== 'private') {
              await followPublicUser(user.uid, target.uid);
              const status = await getFollowStatus(user.uid, target.uid, fallbackVisibility);
              updateUserStatus(target.uid, (item) => ({
                ...item,
                accountVisibility: fallbackVisibility,
                followStatus: status.status,
                isMutual: status.isMutual,
              }));
              showToast('Siguiendo', 'success');
            } else {
              throw err;
            }
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
          if (isPermissionDeniedError(err)) {
            const fallbackVisibility = await getAccountVisibilityServer(target.uid);
            if (fallbackVisibility === 'private') {
              await sendFollowRequest(user.uid, target.uid);
              updateUserStatus(target.uid, (item) => ({
                ...item,
                accountVisibility: 'private',
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
      const message = isPermissionDeniedError(err)
        ? 'No se pudo seguir a este usuario en este momento.'
        : err instanceof Error
          ? err.message
          : 'Error al seguir usuario';
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
      const refreshed = await getFollowStatus(user.uid, target.uid, target.accountVisibility).catch(
        () => ({ status: 'none' as FollowStatus, isMutual: false }),
      );
      updateUserStatus(target.uid, (item) => ({
        ...item,
        followStatus: refreshed.status,
        isMutual: refreshed.isMutual,
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
        aria-label="Enviar mensaje"
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
              aria-label="Rechazar solicitud"
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

      <div className="relative bg-neutral-900/50 border border-neutral-800 rounded-full px-6 py-3 mb-3 flex items-center gap-3">
        <input
          type="text"
          aria-label="Buscar usuarios"
          placeholder="Buscar usuarios o grupos..."
          value={queryText}
          onChange={(event) => setQueryText(event.target.value)}
          className="w-full bg-transparent text-white text-center focus:outline-none placeholder:text-neutral-600 font-light text-sm"
        />
        {queryText && (
          <button
            type="button"
            onClick={() => setQueryText('')}
            aria-label="Limpiar búsqueda"
            className="text-neutral-500 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        )}
        <Search className="text-neutral-600 shrink-0" size={18} />
      </div>

      {showHint && (
        <div className="text-center text-neutral-500 text-sm mb-4">
          {trimmedQuery.length === 1
            ? 'Escribe al menos 2 caracteres para buscar.'
            : loadingSuggested
              ? 'Cargando usuarios...'
              : 'Usuarios sugeridos'}
        </div>
      )}

      <div className="space-y-2">
        {loading && <div className="p-6 text-center text-neutral-500">Buscando usuarios...</div>}
        {!loading && error && (
          <div className="p-6 text-center space-y-3">
            <p className="text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => setSearchReloadToken((prev) => prev + 1)}
              className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs uppercase tracking-wider text-neutral-200 hover:border-neutral-500 hover:text-white transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}
        {showHint && !loadingSuggested && suggestedError && (
          <div className="p-6 text-center space-y-3">
            <p className="text-red-400">{suggestedError}</p>
            <button
              type="button"
              onClick={() => setSuggestedReloadToken((prev) => prev + 1)}
              className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs uppercase tracking-wider text-neutral-200 hover:border-neutral-500 hover:text-white transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}
        {!loading &&
          !error &&
          trimmedQuery.length >= MIN_QUERY_LENGTH &&
          results.length === 0 &&
          matchingGroups.length === 0 && (
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

        {!loading &&
          !error &&
          trimmedQuery.length >= MIN_QUERY_LENGTH &&
          matchingGroups.length > 0 && (
            <section className="pt-6 space-y-2" aria-label="Grupos encontrados">
              <h2 className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-2">Grupos</h2>
              {matchingGroups.map((group) => (
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
                  className="flex items-center gap-4 bg-neutral-900/20 border border-neutral-800/50 rounded-lg p-4 cursor-pointer hover:border-neutral-700 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center overflow-hidden shrink-0">
                    {group.iconUrl ? (
                      <img
                        src={group.iconUrl}
                        alt={group.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Users size={18} className="text-neutral-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{group.name}</div>
                    <div className="text-neutral-500 text-xs truncate">
                      {group.description || 'Grupo en Vinctus'}
                    </div>
                  </div>
                  <span className="text-xs text-neutral-500 shrink-0">
                    {(group.memberCount ?? 0).toLocaleString('es-ES')} miembros
                  </span>
                </div>
              ))}
            </section>
          )}

        {/* Empty state for suggested users */}
        {showHint && !loadingSuggested && !suggestedError && suggestedUsers.length === 0 && (
          <div className="p-6 text-center text-neutral-500">No hay usuarios registrados aún.</div>
        )}
      </div>
    </div>
  );
}
