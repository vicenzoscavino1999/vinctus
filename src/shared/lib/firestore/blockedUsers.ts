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

  const blockedRef = doc(db, 'users', currentUid, 'blockedUsers', blockedUid);
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

  // Remove follow relationships in both directions
  batch.delete(doc(db, 'users', currentUid, 'following', blockedUid));
  batch.delete(doc(db, 'users', currentUid, 'followers', blockedUid));
  batch.delete(doc(db, 'users', blockedUid, 'following', currentUid));
  batch.delete(doc(db, 'users', blockedUid, 'followers', currentUid));

  // Remove pending follow requests in both directions
  batch.delete(doc(db, 'follow_requests', buildFollowRequestId(currentUid, blockedUid)));
  batch.delete(doc(db, 'follow_requests', buildFollowRequestId(blockedUid, currentUid)));

  // Hide direct conversation from blocker (index only)
  const conversationId = `dm_${[currentUid, blockedUid].sort().join('_')}`;
  batch.delete(doc(db, 'users', currentUid, 'directConversations', conversationId));

  await batch.commit();
}

export async function unblockUser(currentUid: string, blockedUid: string): Promise<void> {
  if (!currentUid || !blockedUid || currentUid === blockedUid) return;
  trackFirestoreWrite('firestore.deleteDoc');
  await deleteDoc(doc(db, 'users', currentUid, 'blockedUsers', blockedUid));
}

export async function isUserBlocked(currentUid: string, otherUid: string): Promise<boolean> {
  if (!currentUid || !otherUid) return false;
  trackFirestoreRead('firestore.getDoc');
  const blockedRef = doc(db, 'users', currentUid, 'blockedUsers', otherUid);
  const snap = await getDoc(blockedRef);
  return snap.exists();
}

export async function getBlockedUsers(uid: string): Promise<string[]> {
  const snapshot = await getDocs(
    query(collection(db, 'users', uid, 'blockedUsers'), limit(ID_SUBCOLLECTION_FETCH_LIMIT)),
  );
  trackFirestoreRead('firestore.getDocs', snapshot.size);
  return snapshot.docs.map((docSnap) => docSnap.id);
}
