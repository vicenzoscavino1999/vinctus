import { collection, endAt, getDocs, limit, orderBy, query, startAt } from 'firebase/firestore';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';
import type { AccountVisibility, PublicUserRead } from './users';

export const searchUsersByDisplayName = async (
  queryText: string,
  limitCount = 10,
): Promise<PublicUserRead[]> => {
  const normalized = queryText.trim().toLowerCase();
  if (!normalized) return [];

  const q = query(
    collection(db, 'users_public'),
    orderBy('displayNameLowercase'),
    startAt(normalized),
    endAt(`${normalized}\uf8ff`),
    limit(limitCount),
  );

  const snapshot = await getDocs(q);
  trackFirestoreRead('firestore.getDocs', snapshot.size);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as {
      displayName?: string | null;
      photoURL?: string | null;
      accountVisibility?: AccountVisibility;
    };
    const accountVisibility: AccountVisibility =
      data.accountVisibility === 'private' ? 'private' : 'public';
    return {
      uid: docSnap.id,
      displayName: data.displayName ?? null,
      photoURL: data.photoURL ?? null,
      accountVisibility,
    };
  });
};

/**
 * Get recent/suggested users (for initial display on search page)
 * Returns users ordered by most recently updated
 */
export const getRecentUsers = async (
  limitCount = 15,
  excludeUid?: string,
): Promise<PublicUserRead[]> => {
  const q = query(
    collection(db, 'users_public'),
    orderBy('updatedAt', 'desc'),
    limit(limitCount + 1), // Fetch one extra in case we need to exclude current user
  );

  const snapshot = await getDocs(q);
  trackFirestoreRead('firestore.getDocs', snapshot.size);

  const users = snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as {
      displayName?: string | null;
      photoURL?: string | null;
      accountVisibility?: AccountVisibility;
    };
    const accountVisibility: AccountVisibility =
      data.accountVisibility === 'private' ? 'private' : 'public';
    return {
      uid: docSnap.id,
      displayName: data.displayName ?? null,
      photoURL: data.photoURL ?? null,
      accountVisibility,
    };
  });

  // Filter out current user and limit
  return users.filter((u) => u.uid !== excludeUid).slice(0, limitCount);
};
