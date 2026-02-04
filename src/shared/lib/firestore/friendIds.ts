import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';
import { getFollowerIds, getFollowingIds } from './followIds';

// Matches the legacy cap used for friends lists.
const LARGE_LIST_LIMIT = 200;

export async function getFriendIds(uid: string): Promise<string[]> {
  try {
    const indexedFriendsQ = query(
      collection(db, 'users', uid, 'friends'),
      orderBy('createdAt', 'desc'),
      limit(LARGE_LIST_LIMIT),
    );
    const indexedFriendsSnap = await getDocs(indexedFriendsQ).catch((err) => {
      const code = (err as { code?: string })?.code;
      if (code === 'permission-denied') {
        console.warn('[getFriendIds] permission-denied al leer friends index, usando fallback');
        return null;
      }
      throw err;
    });

    if (indexedFriendsSnap) {
      trackFirestoreRead('firestore.getDocs', indexedFriendsSnap.size);
    }

    if (indexedFriendsSnap && !indexedFriendsSnap.empty) {
      const friendIds = indexedFriendsSnap.docs.map((docSnap) => docSnap.id);
      console.log(
        `[getFriendIds] Cargados ${friendIds.length} amigos (friends index) para uid ${uid}`,
      );
      return friendIds;
    }

    // Backward-compatible fallback for legacy users where friends index is not backfilled yet.
    const [followingIds, followerIds] = await Promise.all([
      getFollowingIds(uid).catch((err) => {
        const code = (err as { code?: string })?.code;
        if (code === 'permission-denied') {
          console.warn('[getFriendIds] permission-denied al leer following, retornando []');
          return [];
        }
        throw err;
      }),
      getFollowerIds(uid).catch((err) => {
        const code = (err as { code?: string })?.code;
        if (code === 'permission-denied') {
          console.warn('[getFriendIds] permission-denied al leer followers, retornando []');
          return [];
        }
        throw err;
      }),
    ]);

    const followerSet = new Set(followerIds);
    const friendIds = followingIds.filter((id) => followerSet.has(id)).slice(0, LARGE_LIST_LIMIT);

    console.log(`[getFriendIds] Cargados ${friendIds.length} amigos (fallback) para uid ${uid}`);
    return friendIds;
  } catch (error) {
    console.error('[getFriendIds] Error inesperado:', error);
    return [];
  }
}
