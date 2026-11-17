import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS, SUBCOLLECTIONS } from './firestoreContract';

type RelationCountField = 'followersCount' | 'followingCount';

const isValidDocId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && !value.includes('/');

async function reconcileUserRelationCount(
  db: Firestore,
  userId: string,
  subcollection: typeof SUBCOLLECTIONS.followers | typeof SUBCOLLECTIONS.following,
  field: RelationCountField,
): Promise<void> {
  if (!isValidDocId(userId)) return;

  const userRef = db.collection(COLLECTIONS.users).doc(userId);
  const publicRef = db.collection(COLLECTIONS.usersPublic).doc(userId);
  const relationCollection = userRef.collection(subcollection);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    // Late deletion events must not recreate a deleted account profile.
    if (!userSnap.exists) return;

    const publicSnap = await tx.get(publicRef);
    const countSnap = await tx.get(relationCollection.count());
    const nextCount = Math.max(0, countSnap.data().count);

    if (userSnap.data()?.[field] !== nextCount) {
      tx.update(userRef, { [field]: nextCount });
    }
    if (publicSnap.exists && publicSnap.data()?.[field] !== nextCount) {
      tx.update(publicRef, { [field]: nextCount });
    }
  });
}

/**
 * Reconcile followersCount directly from current followers subcollection size so
 * duplicate or out-of-order Firestore triggers never drift or resurrect deleted users.
 */
export async function reconcileUserFollowersCount(db: Firestore, userId: string): Promise<void> {
  await reconcileUserRelationCount(db, userId, SUBCOLLECTIONS.followers, 'followersCount');
}

/**
 * Reconcile followingCount directly from current following subcollection size.
 */
export async function reconcileUserFollowingCount(db: Firestore, userId: string): Promise<void> {
  await reconcileUserRelationCount(db, userId, SUBCOLLECTIONS.following, 'followingCount');
}

export type FollowAcceptOutcome = 'accepted' | 'blocked' | 'missing_profile' | 'invalid';

/**
 * Create follower/following edges for an accepted follow request only if both user
 * documents still exist and neither user has blocked the other, preserving any
 * pre-existing createdAt timestamp.
 */
export async function acceptFollowRequestInTransaction(
  db: Firestore,
  fromUid: string,
  toUid: string,
): Promise<FollowAcceptOutcome> {
  if (!isValidDocId(fromUid) || !isValidDocId(toUid) || fromUid === toUid) {
    return 'invalid';
  }

  const toUserRef = db.collection(COLLECTIONS.users).doc(toUid);
  const fromUserRef = db.collection(COLLECTIONS.users).doc(fromUid);
  const blockedByTargetRef = toUserRef.collection(SUBCOLLECTIONS.blockedUsers).doc(fromUid);
  const blockedBySenderRef = fromUserRef.collection(SUBCOLLECTIONS.blockedUsers).doc(toUid);
  const followerRef = toUserRef.collection(SUBCOLLECTIONS.followers).doc(fromUid);
  const followingRef = fromUserRef.collection(SUBCOLLECTIONS.following).doc(toUid);

  return db.runTransaction(async (tx) => {
    const [
      toUserSnap,
      fromUserSnap,
      blockedByTarget,
      blockedBySender,
      followerSnap,
      followingSnap,
    ] = await Promise.all([
      tx.get(toUserRef),
      tx.get(fromUserRef),
      tx.get(blockedByTargetRef),
      tx.get(blockedBySenderRef),
      tx.get(followerRef),
      tx.get(followingRef),
    ]);

    if (!toUserSnap.exists || !fromUserSnap.exists) {
      return 'missing_profile';
    }

    if (blockedByTarget.exists || blockedBySender.exists) {
      return 'blocked';
    }

    if (!followerSnap.exists) {
      tx.set(followerRef, {
        uid: fromUid,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (!followingSnap.exists) {
      tx.set(followingRef, {
        uid: toUid,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return 'accepted';
  });
}

/**
 * Remove symmetric follow edges and any pending/stale follow requests between two
 * users when a block is created, ensuring server-side consistency even if a client
 * drops offline right after creating blockedUsers/{blockedUid}.
 */
export async function cleanupFollowStateOnBlock(
  db: Firestore,
  uid: string,
  blockedUid: string,
): Promise<void> {
  if (!isValidDocId(uid) || !isValidDocId(blockedUid) || uid === blockedUid) {
    return;
  }

  await Promise.all([
    db.doc(`${COLLECTIONS.users}/${uid}/${SUBCOLLECTIONS.followers}/${blockedUid}`).delete(),
    db.doc(`${COLLECTIONS.users}/${uid}/${SUBCOLLECTIONS.following}/${blockedUid}`).delete(),
    db.doc(`${COLLECTIONS.users}/${blockedUid}/${SUBCOLLECTIONS.followers}/${uid}`).delete(),
    db.doc(`${COLLECTIONS.users}/${blockedUid}/${SUBCOLLECTIONS.following}/${uid}`).delete(),
    db.doc(`${COLLECTIONS.followRequests}/${uid}_${blockedUid}`).delete(),
    db.doc(`${COLLECTIONS.followRequests}/${blockedUid}_${uid}`).delete(),
  ]);
}
