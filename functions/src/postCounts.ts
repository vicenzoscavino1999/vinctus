import type { Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from './firestoreContract';

/**
 * Reconcile against current data rather than applying event deltas: Firestore
 * events can be duplicated or arrive out of order (including delete before create).
 * Missing/null status is a visible legacy post; every other non-ready status is hidden.
 */
export async function reconcileUserPostCount(db: Firestore, authorId: string): Promise<void> {
  const userRef = db.collection(COLLECTIONS.users).doc(authorId);
  const publicRef = db.collection(COLLECTIONS.usersPublic).doc(authorId);
  const posts = db.collection(COLLECTIONS.posts).where('authorId', '==', authorId);

  await db.runTransaction(async (tx) => {
    const user = await tx.get(userRef);
    // A late post deletion event must not recreate a deleted account.
    if (!user.exists) return;
    const publicUser = await tx.get(publicRef);
    const total = await tx.get(posts.count());
    // not-in intentionally excludes missing/null status, preserving legacy posts.
    const unfinished = await tx.get(posts.where('status', 'not-in', ['ready']).count());
    const postsCount = Math.max(0, total.data().count - unfinished.data().count);

    if (user.data()?.postsCount !== postsCount) tx.update(userRef, { postsCount });
    if (publicUser.exists && publicUser.data()?.postsCount !== postsCount) {
      tx.update(publicRef, { postsCount });
    }
  });
}
