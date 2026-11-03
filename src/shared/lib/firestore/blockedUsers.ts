import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  writeBatch,
  type FieldValue,
} from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';
import { COLLECTIONS, SUBCOLLECTIONS } from '@/shared/lib/firestore/firestoreContract';

export type BlockedUserStatus = 'active';

export interface BlockedUserWrite {
  blockedUid: string;
  status: BlockedUserStatus;
  blockedAt: FieldValue;
}

// Matches the legacy cap used when fetching IDs from user subcollections.
const ID_SUBCOLLECTION_FETCH_LIMIT = 1000;

const buildFollowRequestId = (fromUid: string, toUid: string): string => `${fromUid}_${toUid}`;

export async function blockUser(currentUid: string, blockedUid: string): Promise<void> {
  if (!currentUid || !blockedUid || currentUid === blockedUid) return;

  const blockedRef = doc(
    db,
    COLLECTIONS.users,
    currentUid,
    SUBCOLLECTIONS.blockedUsers,
    blockedUid,
  );
  const batch = writeBatch(db);

  batch.set(
    blockedRef,
    {
      blockedUid,
      status: 'active',
      blockedAt: serverTimestamp(),
    } as BlockedUserWrite,
    { merge: false },
  );

  // Remove follow relationships the rules let the blocker delete, in both directions
  batch.delete(doc(db, COLLECTIONS.users, currentUid, SUBCOLLECTIONS.following, blockedUid));
  batch.delete(doc(db, COLLECTIONS.users, currentUid, SUBCOLLECTIONS.followers, blockedUid));
  batch.delete(doc(db, COLLECTIONS.users, blockedUid, SUBCOLLECTIONS.followers, currentUid));

  // Hide direct conversation from blocker (index only)
  const conversationId = `dm_${[currentUid, blockedUid].sort().join('_')}`;
  batch.delete(
    doc(db, COLLECTIONS.users, currentUid, SUBCOLLECTIONS.directConversations, conversationId),
  );

  await batch.commit();

  // Outside the batch so a denied cleanup can't undo the block (a batch is all-or-nothing):
  // - the blocked user's following edge needs the rule that lets the followed user remove it
  // - follow requests may only be deleted by a participant once they exist
  const requestRefs = [
    doc(db, COLLECTIONS.followRequests, buildFollowRequestId(currentUid, blockedUid)),
    doc(db, COLLECTIONS.followRequests, buildFollowRequestId(blockedUid, currentUid)),
  ];
  await Promise.allSettled([
    deleteDoc(doc(db, COLLECTIONS.users, blockedUid, SUBCOLLECTIONS.following, currentUid)),
    ...requestRefs.map(async (requestRef) => {
      if ((await getDoc(requestRef)).exists()) await deleteDoc(requestRef);
    }),
  ]);
}

export async function unblockUser(currentUid: string, blockedUid: string): Promise<void> {
  if (!currentUid || !blockedUid || currentUid === blockedUid) return;
  trackFirestoreWrite('firestore.deleteDoc');
  await deleteDoc(doc(db, COLLECTIONS.users, currentUid, SUBCOLLECTIONS.blockedUsers, blockedUid));
}

export async function isUserBlocked(currentUid: string, otherUid: string): Promise<boolean> {
  if (!currentUid || !otherUid) return false;
  trackFirestoreRead('firestore.getDoc');
  const blockedRef = doc(db, COLLECTIONS.users, currentUid, SUBCOLLECTIONS.blockedUsers, otherUid);
  const snap = await getDoc(blockedRef);
  return snap.exists();
}

export async function getBlockedUsers(uid: string): Promise<string[]> {
  const snapshot = await getDocs(
    query(
      collection(db, COLLECTIONS.users, uid, SUBCOLLECTIONS.blockedUsers),
      limit(ID_SUBCOLLECTION_FETCH_LIMIT),
    ),
  );
  trackFirestoreRead('firestore.getDocs', snapshot.size);
  return snapshot.docs.map((docSnap) => docSnap.id);
}
