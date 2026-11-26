import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppError } from '@/shared/lib/errors';
import { CATEGORIES } from '@/shared/constants';
import { useToast } from '@/shared/ui/Toast';
import { getGroups, type FirestoreGroup } from '@/features/groups/api';
import {
  acceptFollowRequest,
  cancelFollowRequest,
  declineFollowRequest,
  followPublicUser,
  getAccountVisibilityServer,
  getBlockedUsers,
  getFollowStatus,
  getOrCreateDirectConversation,
  getRecentUsers,
  isUserBlocked,
  searchUsersByDisplayName,
  sendFollowRequest,
  unfollowUser,
  type FollowStatus,
  type PublicUserRead,
} from '@/features/profile/api';

export const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

export type PersonResult = PublicUserRead & {
  followStatus: FollowStatus | 'loading';
  isMutual?: boolean;
};

const normalize = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const isPermissionDenied = (error: unknown): boolean => {
  if (error instanceof AppError) return error.code === 'PERMISSION_DENIED';
  const code = (error as { code?: unknown })?.code;
  return code === 'permission-denied' || code === 'PERMISSION_DENIED';
};

/**
 * Search: suggested people, people matching the query, matching groups, and the follow /
 * request / message actions. The blocked list is asked once per account, not on every search.
 */
export function usePeopleSearch(currentUid: string | null, initialQuery: string) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const toast = useRef(showToast);
  useEffect(() => {
    toast.current = showToast;
  });

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<PersonResult[]>([]);
  const [suggested, setSuggested] = useState<PersonResult[]>([]);
  const [groups, setGroups] = useState<FirestoreGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingSuggested, setLoadingSuggested] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [suggestedError, setSuggestedError] = useState<string | null>(null);
  const [suggestedReload, setSuggestedReload] = useState(0);
  const [searchReload, setSearchReload] = useState(0);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const blocked = useRef<{ uid: string; ids: Promise<Set<string>> } | null>(null);
  const blockedSet = useCallback((): Promise<Set<string>> => {
    if (!currentUid) return Promise.resolve(new Set());
    if (blocked.current?.uid !== currentUid) {
      blocked.current = {
        uid: currentUid,
        ids: getBlockedUsers(currentUid)
          .then((ids) => new Set(ids))
          .catch(() => new Set<string>()),
      };
    }
    return blocked.current.ids;
  }, [currentUid]);

  /** Visible people with their follow status (a failure just shows "Seguir"). */
  const withStatus = useCallback(
    async (people: PublicUserRead[]): Promise<PersonResult[]> => {
      const hidden = await blockedSet();
      const visible = people
        .filter((person) => person.uid !== currentUid && !hidden.has(person.uid))
        .slice(0, 15);
      return Promise.all(
        visible.map(async (person): Promise<PersonResult> => {
          if (!currentUid) return { ...person, followStatus: 'none' };
          try {
            const status = await getFollowStatus(currentUid, person.uid, person.accountVisibility);
            const followStatus =
              person.accountVisibility !== 'private' && status.status === 'pending_sent'
                ? 'none'
                : status.status;
            return { ...person, followStatus, isMutual: status.isMutual };
          } catch {
            return { ...person, followStatus: 'none' };
          }
        }),
      );
    },
    [blockedSet, currentUid],
  );

  useEffect(() => {
    let active = true;
    getGroups()
      .then((items) => {
        if (active) setGroups(items);
      })
      .catch((error) => console.error('Error loading groups for search:', error));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingSuggested(true);
    setSuggestedError(null);
    getRecentUsers(20, currentUid ?? undefined)
      .then(withStatus)
      .then((people) => {
        if (active) setSuggested(people);
      })
      .catch((error) => {
        console.error('Error loading suggested users:', error);
        if (!active) return;
        setSuggested([]);
        setSuggestedError('No se pudieron cargar los usuarios sugeridos.');
      })
      .finally(() => {
        if (active) setLoadingSuggested(false);
      });
    return () => {
      active = false;
    };
  }, [currentUid, withStatus, suggestedReload]);

  const trimmed = query.trim();
  const isSearching = trimmed.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!isSearching) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const people = await withStatus(await searchUsersByDisplayName(trimmed, 20));
        if (active) setResults(people);
      } catch (error) {
        console.error('Error searching users:', error);
        if (!active) return;
        setResults([]);
        setSearchError('No se pudo buscar usuarios.');
      } finally {
        if (active) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isSearching, trimmed, withStatus, searchReload]);

  const matchingGroups = useMemo(() => {
    if (!isSearching) return [];
    const needle = normalize(trimmed);
    return groups
      .filter((group) => {
        const categoryLabel = group.categoryId
          ? (CATEGORIES.find((category) => category.id === group.categoryId)?.label ?? '')
          : '';
        return [group.name, group.description, group.categoryId, categoryLabel].some((value) =>
          normalize(value || '').includes(needle),
        );
      })
      .slice(0, 6);
  }, [groups, isSearching, trimmed]);

  const update = (uid: string, change: (person: PersonResult) => PersonResult) => {
    setResults((previous) => previous.map((item) => (item.uid === uid ? change(item) : item)));
    setSuggested((previous) => previous.map((item) => (item.uid === uid ? change(item) : item)));
  };

  const run = async (uid: string, action: () => Promise<void>) => {
    setBusyUid(uid);
    try {
      await action();
    } finally {
      setBusyUid(null);
    }
  };

  const follow = (target: PersonResult) => {
    if (!currentUid) {
      toast.current('Necesitas iniciar sesión', 'error');
      return;
    }
    const me = currentUid;
    const asRequest = async () => {
      await sendFollowRequest(me, target.uid);
      update(target.uid, (item) => ({
        ...item,
        accountVisibility: 'private',
        followStatus: 'pending_sent',
        isMutual: false,
      }));
      toast.current('Solicitud enviada', 'success');
    };
    const asFollow = async (visibility: PublicUserRead['accountVisibility']) => {
      await followPublicUser(me, target.uid);
      const status = await getFollowStatus(me, target.uid, visibility);
      update(target.uid, (item) => ({
        ...item,
        accountVisibility: visibility,
        followStatus: status.status,
        isMutual: status.isMutual,
      }));
      toast.current('Siguiendo', 'success');
    };

    return run(target.uid, async () => {
      try {
        if (await isUserBlocked(me, target.uid)) {
          toast.current('Desbloquea a este usuario para poder seguirlo', 'info');
          return;
        }
      } catch (error) {
        console.error('Error checking block status:', error);
      }
      try {
        // The server says whether the account is private now; the list may be outdated.
        const visibility = await getAccountVisibilityServer(target.uid);
        if (visibility !== target.accountVisibility) {
          update(target.uid, (item) => ({ ...item, accountVisibility: visibility }));
        }
        try {
          if (visibility === 'private') {
            await asRequest();
          } else {
            await Promise.allSettled([cancelFollowRequest(me, target.uid)]);
            await asFollow(visibility);
          }
        } catch (error) {
          // The account changed its privacy meanwhile: try the other way once.
          if (!isPermissionDenied(error)) throw error;
          const latest = await getAccountVisibilityServer(target.uid);
          if (latest === visibility) throw error;
          if (latest === 'private') await asRequest();
          else await asFollow(latest);
        }
      } catch (error) {
        toast.current(
          isPermissionDenied(error)
            ? 'No se pudo seguir a este usuario en este momento.'
            : error instanceof Error
              ? error.message
              : 'Error al seguir usuario',
          'error',
        );
      }
    });
  };

  const simple =
    (
      action: (me: string, target: PersonResult) => Promise<void>,
      success: [string, 'success' | 'info'],
      failure: string,
      next: (me: string, target: PersonResult) => Promise<Partial<PersonResult>>,
    ) =>
    (target: PersonResult) => {
      if (!currentUid) return;
      const me = currentUid;
      return run(target.uid, async () => {
        try {
          await action(me, target);
          const change = await next(me, target);
          update(target.uid, (item) => ({ ...item, ...change }));
          toast.current(success[0], success[1]);
        } catch (error) {
          console.error(error);
          toast.current(failure, 'error');
        }
      });
    };

  const reset = async () => ({ followStatus: 'none' as const, isMutual: false });

  const acceptRequest = simple(
    (me, target) => acceptFollowRequest(target.uid, me),
    ['Solicitud aceptada', 'success'],
    'Error al aceptar solicitud',
    async (me, target) => {
      const refreshed = await getFollowStatus(me, target.uid, target.accountVisibility).catch(
        () => ({ status: 'none' as FollowStatus, isMutual: false }),
      );
      return { followStatus: refreshed.status, isMutual: refreshed.isMutual };
    },
  );
  const declineRequest = simple(
    (me, target) => declineFollowRequest(target.uid, me),
    ['Solicitud rechazada', 'info'],
    'Error al rechazar solicitud',
    reset,
  );
  const cancelRequest = simple(
    (me, target) => cancelFollowRequest(me, target.uid),
    ['Solicitud cancelada', 'info'],
    'Error al cancelar solicitud',
    reset,
  );
  const unfollow = simple(
    (me, target) => unfollowUser(me, target.uid),
    ['Dejaste de seguir', 'info'],
    'Error al dejar de seguir',
    reset,
  );

  const message = (target: PersonResult) => {
    if (!currentUid) {
      toast.current('Necesitas iniciar sesión', 'error');
      return;
    }
    const me = currentUid;
    return run(target.uid, async () => {
      try {
        const conversationId = await getOrCreateDirectConversation(me, target.uid);
        navigate(`/messages?conversation=${conversationId}`);
      } catch (error) {
        console.error('Error creating conversation:', error);
        toast.current('Error al crear conversación', 'error');
      }
    });
  };

  return {
    query,
    setQuery,
    isSearching,
    results,
    suggested,
    matchingGroups,
    searching,
    loadingSuggested,
    searchError,
    suggestedError,
    retrySearch: () => setSearchReload((value) => value + 1),
    retrySuggested: () => setSuggestedReload((value) => value + 1),
    busyUid,
    actions: { follow, acceptRequest, declineRequest, cancelRequest, unfollow, message },
  };
}
