import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type FieldValue,
} from 'firebase/firestore';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';
import { COLLECTIONS, SUBCOLLECTIONS } from '@/shared/lib/firestore/firestoreContract';

interface ArenaLikeWrite {
  uid: string;
  debateId: string;
  createdAt: FieldValue;
}

interface UserArenaLikeWrite {
  debateId: string;
  createdAt: FieldValue;
}

/**
 * Like an Arena debate idempotently (preserves immutable createdAt on retries).
 * Source of truth: arenaDebates/{debateId}/likes/{uid}
 * User index: users/{uid}/likedArenaDebates/{debateId}
 */
export const likeArenaDebateWithSync = async (debateId: string, uid: string): Promise<void> => {
  const likeRef = doc(db, COLLECTIONS.arenaDebates, debateId, SUBCOLLECTIONS.likes, uid);
  const userLikeRef = doc(db, COLLECTIONS.users, uid, SUBCOLLECTIONS.likedArenaDebates, debateId);

  await runTransaction(db, async (tx) => {
    const [likeSnap, userLikeSnap] = await Promise.all([tx.get(likeRef), tx.get(userLikeRef)]);

    if (!likeSnap.exists()) {
      tx.set(likeRef, {
        uid,
        debateId,
        createdAt: serverTimestamp(),
      } as ArenaLikeWrite);
    }

    if (!userLikeSnap.exists()) {
      tx.set(userLikeRef, {
        debateId,
        createdAt: serverTimestamp(),
      } as UserArenaLikeWrite);
    }
  });
};

/**
 * Unlike an Arena debate.
 */
export const unlikeArenaDebateWithSync = async (debateId: string, uid: string): Promise<void> => {
  const likeRef = doc(db, COLLECTIONS.arenaDebates, debateId, SUBCOLLECTIONS.likes, uid);
  const userLikeRef = doc(db, COLLECTIONS.users, uid, SUBCOLLECTIONS.likedArenaDebates, debateId);

  const batch = writeBatch(db);
  batch.delete(likeRef);
  batch.delete(userLikeRef);
  await batch.commit();
};

/**
 * Check whether a user already liked an Arena debate.
 */
export const isArenaDebateLiked = async (debateId: string, uid: string): Promise<boolean> => {
  trackFirestoreRead('firestore.getDoc');
  const docSnap = await getDoc(
    doc(db, COLLECTIONS.arenaDebates, debateId, SUBCOLLECTIONS.likes, uid),
  );
  return docSnap.exists();
};
