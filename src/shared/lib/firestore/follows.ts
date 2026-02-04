import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  Timestamp,
  writeBatch,
  type DocumentSnapshot,
  type FieldValue,
} from 'firebase/firestore';
import {
  doc as docLite,
  getDoc as getDocLite,
  serverTimestamp as serverTimestampLite,
  writeBatch as writeBatchLite,
} from 'firebase/firestore/lite';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { db, dbLite } from '@/shared/lib/firebase';
import { getPublicUsersByIds, type FollowUserRead } from './publicUsers';
import type { AccountVisibility } from './users';

type PaginatedResult<T> = {
  items: T[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
};

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
};

const buildFollowRequestId = (fromUid: string, toUid: string): string => `${fromUid}_${toUid}`;

export type FollowRequestStatus = 'pending' | 'accepted' | 'declined';

export interface FollowRequestRead {
  id: string;
  fromUid: string;
  toUid: string;
  status: FollowRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface FollowRequestWrite {
  fromUid: string;
  toUid: string;
  status: FollowRequestStatus;
  createdAt: FieldValue;
  updatedAt: FieldValue;
}

export type FollowStatus = 'none' | 'following' | 'pending_sent' | 'pending_received';

export async function getFollowStatus(
  currentUid: string,
  targetUid: string,
  targetVisibility?: AccountVisibility,
): Promise<{ status: FollowStatus; requestId?: string; isMutual?: boolean }> {
  try {
    trackFirestoreRead('firestore.getDoc');
    const followerDoc = await getDoc(doc(db, 'users', targetUid, 'followers', currentUid));
    if (followerDoc.exists()) {
      try {
        trackFirestoreRead('firestore.getDoc');
        const reverseDoc = await getDoc(doc(db, 'users', currentUid, 'followers', targetUid));
        return { status: 'following', isMutual: reverseDoc.exists() };
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== 'permission-denied') {
          throw error;
        }
        return { status: 'following', isMutual: false };
      }
    }
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== 'permission-denied') {
      throw error;
    }
  }

  if (targetVisibility && targetVisibility !== 'private') {
    return { status: 'none' };
  }

  const incomingId = buildFollowRequestId(targetUid, currentUid);
  try {
    trackFirestoreRead('firestore.getDoc');
    const incoming = await getDoc(doc(db, 'follow_requests', incomingId));
    if (incoming.exists()) {
      const data = incoming.data() as { status?: FollowRequestStatus };
      if (data.status === 'pending') {
        return { status: 'pending_received', requestId: incoming.id };
      }
    }
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== 'permission-denied') {
      throw error;
    }
  }

  const outgoingId = buildFollowRequestId(currentUid, targetUid);
  try {
    trackFirestoreRead('firestore.getDoc');
    const outgoing = await getDoc(doc(db, 'follow_requests', outgoingId));
    if (outgoing.exists()) {
      const data = outgoing.data() as { status?: FollowRequestStatus };
      if (data.status === 'pending') {
        return { status: 'pending_sent', requestId: outgoing.id };
      }
    }
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== 'permission-denied') {
      throw error;
    }
  }

  return { status: 'none' };
}

export async function sendFollowRequest(fromUid: string, toUid: string): Promise<string> {
  const requestId = buildFollowRequestId(fromUid, toUid);
  const requestRef = doc(db, 'follow_requests', requestId);
  let existing = null as null | DocumentSnapshot;
  try {
    trackFirestoreRead('firestore.getDoc');
    existing = await getDoc(requestRef);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== 'permission-denied') {
      throw error;
    }
  }
  if (existing?.exists()) {
    const data = existing.data() as { status?: FollowRequestStatus };
    if (data.status === 'pending') {
      trackFirestoreWrite('firestore.updateDoc');
      await updateDoc(requestRef, {
        status: 'pending',
        updatedAt: serverTimestamp(),
      });
      return requestId;
    }
    trackFirestoreWrite('firestore.updateDoc');
    await updateDoc(requestRef, {
      status: 'pending',
      updatedAt: serverTimestamp(),
    });
    return requestId;
  }

  trackFirestoreWrite('firestore.setDoc');
  await setDoc(
    requestRef,
    {
      fromUid,
      toUid,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as FollowRequestWrite,
    { merge: false },
  );
  return requestRef.id;
}

export async function cancelFollowRequest(fromUid: string, toUid: string): Promise<void> {
  const ref = doc(db, 'follow_requests', buildFollowRequestId(fromUid, toUid));
  try {
    trackFirestoreRead('firestore.getDoc');
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    trackFirestoreWrite('firestore.deleteDoc');
    await deleteDoc(ref);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== 'permission-denied') {
      throw error;
    }
  }
}

export async function acceptFollowRequest(fromUid: string, toUid: string): Promise<void> {
  trackFirestoreWrite('firestore.updateDoc');
  await updateDoc(doc(db, 'follow_requests', buildFollowRequestId(fromUid, toUid)), {
    status: 'accepted',
    updatedAt: serverTimestamp(),
  });
}

export async function declineFollowRequest(fromUid: string, toUid: string): Promise<void> {
  trackFirestoreWrite('firestore.updateDoc');
  await updateDoc(doc(db, 'follow_requests', buildFollowRequestId(fromUid, toUid)), {
    status: 'declined',
    updatedAt: serverTimestamp(),
  });
}

export async function followPublicUser(followerUid: string, targetUid: string): Promise<void> {
  const followerRef = docLite(dbLite, 'users', targetUid, 'followers', followerUid);
  const followingRef = docLite(dbLite, 'users', followerUid, 'following', targetUid);
  const [followerSnap, followingSnap] = await Promise.all([
    getDocLite(followerRef),
    getDocLite(followingRef),
  ]);

  let hasWrites = false;
  const batch = writeBatchLite(dbLite);
  if (!followerSnap.exists()) {
    batch.set(
      followerRef,
      {
        uid: followerUid,
        createdAt: serverTimestampLite(),
      },
      { merge: false },
    );
    hasWrites = true;
  }
  if (!followingSnap.exists()) {
    batch.set(
      followingRef,
      {
        uid: targetUid,
        createdAt: serverTimestampLite(),
      },
      { merge: false },
    );
    hasWrites = true;
  }
  if (!hasWrites) {
    return;
  }
  await batch.commit();
}

export async function unfollowUser(followerUid: string, targetUid: string): Promise<void> {
  const followerRef = doc(db, 'users', targetUid, 'followers', followerUid);
  const followingRef = doc(db, 'users', followerUid, 'following', targetUid);
  const batch = writeBatch(db);
  batch.delete(followerRef);
  batch.delete(followingRef);
  await batch.commit();
}

export async function getFollowList(
  uid: string,
  list: 'followers' | 'following',
  pageSize = 20,
  cursor?: PaginatedResult<FollowUserRead>['lastDoc'],
): Promise<PaginatedResult<FollowUserRead>> {
  const baseRef = collection(db, 'users', uid, list);
  const constraints = [orderBy('createdAt', 'desc'), limit(pageSize)];
  const q = cursor
    ? query(baseRef, ...constraints, startAfter(cursor))
    : query(baseRef, ...constraints);

  const snapshot = await getDocs(q);
  trackFirestoreRead('firestore.getDocs', snapshot.size);
  const ids = snapshot.docs.map((docSnap) => docSnap.id);
  const usersMap = await getPublicUsersByIds(ids);

  const items = ids.map(
    (id) =>
      usersMap.get(id) ?? {
        uid: id,
        displayName: null,
        photoURL: null,
        username: null,
      },
  );

  return {
    items,
    lastDoc: snapshot.docs[snapshot.docs.length - 1] ?? null,
    hasMore: snapshot.docs.length === pageSize,
  };
}

export async function getIncomingFollowRequests(
  uid: string,
  pageSize = 20,
  cursor?: PaginatedResult<FollowRequestRead>['lastDoc'],
): Promise<PaginatedResult<FollowRequestRead & { fromUser: FollowUserRead | null }>> {
  const baseRef = collection(db, 'follow_requests');
  const constraints = [
    where('toUid', '==', uid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(pageSize),
  ];
  const q = cursor
    ? query(baseRef, ...constraints, startAfter(cursor))
    : query(baseRef, ...constraints);

  const snapshot = await getDocs(q);
  trackFirestoreRead('firestore.getDocs', snapshot.size);
  const raw = snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as {
      fromUid: string;
      toUid: string;
      status: FollowRequestStatus;
      createdAt?: Timestamp;
      updatedAt?: Timestamp;
    };
    return {
      id: docSnap.id,
      fromUid: data.fromUid,
      toUid: data.toUid,
      status: data.status,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
    };
  });

  const userMap = await getPublicUsersByIds(raw.map((item) => item.fromUid));
  const items = raw.map((item) => ({
    ...item,
    fromUser: userMap.get(item.fromUid) ?? null,
  }));

  return {
    items,
    lastDoc: snapshot.docs[snapshot.docs.length - 1] ?? null,
    hasMore: snapshot.docs.length === pageSize,
  };
}
