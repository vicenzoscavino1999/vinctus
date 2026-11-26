import { useState } from 'react';
import { getBlockedUsers } from '@/features/groups/api';

/** The signed-in person's blocked accounts, asked once and shared by activity and requests. */
export type BlockedUsers = {
  get: () => Promise<Set<string>>;
  /** Asks again, for "Actualizar". */
  refresh: () => Promise<Set<string>>;
};

export function useBlockedUsers(uid: string): BlockedUsers {
  const [blocked] = useState<BlockedUsers>(() => {
    let pending: Promise<Set<string>> | null = null;
    // A failure only means nobody is hidden; the lists still load.
    const fetchBlocked = () =>
      getBlockedUsers(uid)
        .then((ids) => new Set(ids))
        .catch(() => new Set<string>());
    return {
      get: () => (pending ??= fetchBlocked()),
      refresh: () => (pending = fetchBlocked()),
    };
  });
  return blocked;
}
