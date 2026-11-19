import type { Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS, SUBCOLLECTIONS } from './firestoreContract';

const isValidDocId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && !value.includes('/');

/**
 * Reconcile arenaDebates/{debateId}.likesCount directly from the likes
 * subcollection count so duplicate, concurrent, or out-of-order Firestore
 * triggers never drift or resurrect a deleted debate.
 */
export async function reconcileArenaDebateLikeCount(
  db: Firestore,
  debateId: string,
): Promise<void> {
  if (!isValidDocId(debateId)) return;

  const debateRef = db.collection(COLLECTIONS.arenaDebates).doc(debateId);
  const likesCollection = debateRef.collection(SUBCOLLECTIONS.likes);

  await db.runTransaction(async (tx) => {
    const debateSnap = await tx.get(debateRef);
    if (!debateSnap.exists) return;

    const countSnap = await tx.get(likesCollection.count());
    const nextLikes = Math.max(0, countSnap.data().count);

    if (debateSnap.data()?.likesCount !== nextLikes) {
      tx.update(debateRef, { likesCount: nextLikes });
    }
  });
}
