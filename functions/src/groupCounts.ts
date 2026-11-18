import type { Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS, SUBCOLLECTIONS } from './firestoreContract';

const CLEANUP_BATCH_LIMIT = 200;

const isValidDocId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && !value.includes('/');

/**
 * Reconcile group.memberCount directly from the current members subcollection
 * size so duplicate, concurrent, or out-of-order Firestore triggers never drift
 * or resurrect a deleted group.
 */
export async function reconcileGroupMemberCount(db: Firestore, groupId: string): Promise<void> {
  if (!isValidDocId(groupId)) return;

  const groupRef = db.collection(COLLECTIONS.groups).doc(groupId);
  const membersCollection = groupRef.collection(SUBCOLLECTIONS.members);

  await db.runTransaction(async (tx) => {
    const groupSnap = await tx.get(groupRef);
    // Late member events must not recreate a deleted group document.
    if (!groupSnap.exists) return;

    const countSnap = await tx.get(membersCollection.count());
    const nextCount = Math.max(0, countSnap.data().count);

    if (groupSnap.data()?.memberCount !== nextCount) {
      tx.update(groupRef, { memberCount: nextCount });
    }
  });
}

/**
 * Delete all members under groups/{groupId}/members along with their matching
 * users/{uid}/memberships/{groupId} index docs, plus the owner's membership doc
 * if the owner doc was missing from members.
 */
export async function cleanupDeletedGroupMembersAndMemberships(
  db: Firestore,
  groupId: string,
  ownerId?: unknown,
): Promise<number> {
  if (!isValidDocId(groupId)) return 0;

  let membersDeleted = 0;
  let ownerMembershipCleared = false;
  const membersCollection = db.collection(
    `${COLLECTIONS.groups}/${groupId}/${SUBCOLLECTIONS.members}`,
  );

  while (true) {
    const snapshot = await membersCollection.limit(CLEANUP_BATCH_LIMIT).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    for (const memberDoc of snapshot.docs) {
      batch.delete(memberDoc.ref);
      const uid = memberDoc.id;
      if (isValidDocId(uid)) {
        if (uid === ownerId) ownerMembershipCleared = true;
        batch.delete(
          db.doc(`${COLLECTIONS.users}/${uid}/${SUBCOLLECTIONS.memberships}/${groupId}`),
        );
      }
    }
    await batch.commit();
    membersDeleted += snapshot.size;

    if (snapshot.size < CLEANUP_BATCH_LIMIT) break;
  }

  if (isValidDocId(ownerId) && !ownerMembershipCleared) {
    await db
      .doc(`${COLLECTIONS.users}/${ownerId}/${SUBCOLLECTIONS.memberships}/${groupId}`)
      .delete()
      .catch(() => undefined);
  }

  return membersDeleted;
}

/**
 * Delete all join requests targeting a deleted group.
 */
export async function cleanupDeletedGroupJoinRequests(
  db: Firestore,
  groupId: string,
): Promise<number> {
  if (!isValidDocId(groupId)) return 0;

  let deleted = 0;
  const requestsCollection = db.collection(COLLECTIONS.groupRequests);

  while (true) {
    const snapshot = await requestsCollection
      .where('groupId', '==', groupId)
      .limit(CLEANUP_BATCH_LIMIT)
      .get();
    if (snapshot.empty) break;

    const batch = db.batch();
    for (const reqDoc of snapshot.docs) {
      batch.delete(reqDoc.ref);
    }
    await batch.commit();
    deleted += snapshot.size;

    if (snapshot.size < CLEANUP_BATCH_LIMIT) break;
  }

  return deleted;
}
