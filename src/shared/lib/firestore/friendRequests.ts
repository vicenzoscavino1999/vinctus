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
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';
import type { PublicUserRead } from './users';

const DEFAULT_LIMIT = 30;
const SMALL_LIST_LIMIT = 50;

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
};

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface FriendRequestRead {
  id: string;
  fromUid: string;
  toUid: string;
  status: FriendRequestStatus;
  fromUserName: string | null;
  fromUserPhoto: string | null;
  toUserName: string | null;
  toUserPhoto: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Send a friend request
 */
export async function sendFriendRequest(
  fromUid: string,
  toUid: string,
  fromUserName: string | null,
  fromUserPhoto: string | null,
): Promise<string> {
  // Check if request already exists
  const existingQuery = query(
    collection(db, 'friend_requests'),
    where('fromUid', '==', fromUid),
    where('toUid', '==', toUid),
    limit(1),
  );
  const existing = await getDocs(existingQuery);
  trackFirestoreRead('firestore.getDocs', existing.size);

  if (!existing.empty) {
    const existingDoc = existing.docs[0];
    const data = existingDoc.data();
    if (data.status === 'pending') {
      throw new Error('Ya enviaste una solicitud a este usuario');
    }
    if (data.status === 'accepted') {
      throw new Error('Ya son amigos');
    }
    // If rejected, allow re-sending
    trackFirestoreWrite('firestore.updateDoc');
    await updateDoc(doc(db, 'friend_requests', existingDoc.id), {
      status: 'pending',
      updatedAt: serverTimestamp(),
    });
    return existingDoc.id;
  }

  // Check if there's a reverse request (they sent one to us)
  const reverseQuery = query(
    collection(db, 'friend_requests'),
    where('fromUid', '==', toUid),
    where('toUid', '==', fromUid),
    limit(1),
  );
  const reverse = await getDocs(reverseQuery);
  trackFirestoreRead('firestore.getDocs', reverse.size);

  if (!reverse.empty) {
    const reverseDoc = reverse.docs[0];
    const data = reverseDoc.data();
    if (data.status === 'pending') {
      // Auto-accept: they already sent us a request
      trackFirestoreWrite('firestore.updateDoc');
      await updateDoc(doc(db, 'friend_requests', reverseDoc.id), {
        status: 'accepted',
        updatedAt: serverTimestamp(),
      });
      return reverseDoc.id;
    }
    if (data.status === 'accepted') {
      throw new Error('Ya son amigos');
    }
  }

  // Get target user info
  trackFirestoreRead('firestore.getDoc');
  const toUserDoc = await getDoc(doc(db, 'users_public', toUid));
  const toUserData = toUserDoc.exists() ? toUserDoc.data() : {};

  // Create new request
  const requestRef = doc(collection(db, 'friend_requests'));
  trackFirestoreWrite('firestore.setDoc');
  await setDoc(requestRef, {
    fromUid,
    toUid,
    status: 'pending',
    fromUserName,
    fromUserPhoto,
    toUserName: toUserData.displayName || null,
    toUserPhoto: toUserData.photoURL || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return requestRef.id;
}

/**
 * Accept a friend request
 */
export async function acceptFriendRequest(requestId: string): Promise<void> {
  trackFirestoreWrite('firestore.updateDoc');
  await updateDoc(doc(db, 'friend_requests', requestId), {
    status: 'accepted',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Reject a friend request
 */
export async function rejectFriendRequest(requestId: string): Promise<void> {
  trackFirestoreWrite('firestore.updateDoc');
  await updateDoc(doc(db, 'friend_requests', requestId), {
    status: 'rejected',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Cancel a sent friend request
 */
export async function cancelFriendRequest(requestId: string): Promise<void> {
  trackFirestoreWrite('firestore.deleteDoc');
  await deleteDoc(doc(db, 'friend_requests', requestId));
}

/**
 * Get pending friend requests received by a user
 */
export async function getPendingFriendRequests(uid: string): Promise<FriendRequestRead[]> {
  const q = query(
    collection(db, 'friend_requests'),
    where('toUid', '==', uid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(SMALL_LIST_LIMIT),
  );

  const snapshot = await getDocs(q);
  trackFirestoreRead('firestore.getDocs', snapshot.size);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      fromUid: data.fromUid,
      toUid: data.toUid,
      status: data.status,
      fromUserName: data.fromUserName || null,
      fromUserPhoto: data.fromUserPhoto || null,
      toUserName: data.toUserName || null,
      toUserPhoto: data.toUserPhoto || null,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
    };
  });
}

/**
 * Get sent friend requests by a user
 */
export async function getSentFriendRequests(uid: string): Promise<FriendRequestRead[]> {
  const q = query(
    collection(db, 'friend_requests'),
    where('fromUid', '==', uid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(SMALL_LIST_LIMIT),
  );

  const snapshot = await getDocs(q);
  trackFirestoreRead('firestore.getDocs', snapshot.size);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      fromUid: data.fromUid,
      toUid: data.toUid,
      status: data.status,
      fromUserName: data.fromUserName || null,
      fromUserPhoto: data.fromUserPhoto || null,
      toUserName: data.toUserName || null,
      toUserPhoto: data.toUserPhoto || null,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
    };
  });
}

/**
 * Get friends (accepted requests in both directions)
 */
export async function getFriends(
  uid: string,
  limitCount: number = DEFAULT_LIMIT * 4,
): Promise<PublicUserRead[]> {
  // Get accepted requests where user is sender
  const sentQ = query(
    collection(db, 'friend_requests'),
    where('fromUid', '==', uid),
    where('status', '==', 'accepted'),
    limit(limitCount),
  );

  // Get accepted requests where user is receiver
  const receivedQ = query(
    collection(db, 'friend_requests'),
    where('toUid', '==', uid),
    where('status', '==', 'accepted'),
    limit(limitCount),
  );

  const [sentSnap, receivedSnap] = await Promise.all([getDocs(sentQ), getDocs(receivedQ)]);
  trackFirestoreRead('firestore.getDocs', sentSnap.size);
  trackFirestoreRead('firestore.getDocs', receivedSnap.size);

  const friendUids = new Set<string>();

  sentSnap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    friendUids.add(data.toUid);
  });

  receivedSnap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    friendUids.add(data.fromUid);
  });

  // Fetch friend profiles
  const friends: PublicUserRead[] = [];
  for (const friendUid of friendUids) {
    trackFirestoreRead('firestore.getDoc');
    const userDoc = await getDoc(doc(db, 'users_public', friendUid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      friends.push({
        uid: friendUid,
        displayName: data.displayName || null,
        photoURL: data.photoURL || null,
      });
    }
  }

  return friends;
}

/**
 * Get friendship status between two users
 */
export async function getFriendshipStatus(
  currentUid: string,
  targetUid: string,
): Promise<{
  status: 'none' | 'friends' | 'pending_sent' | 'pending_received';
  requestId?: string;
}> {
  // Check if we sent a request
  const sentQ = query(
    collection(db, 'friend_requests'),
    where('fromUid', '==', currentUid),
    where('toUid', '==', targetUid),
    limit(1),
  );
  const sentSnap = await getDocs(sentQ);
  trackFirestoreRead('firestore.getDocs', sentSnap.size);

  if (!sentSnap.empty) {
    const data = sentSnap.docs[0].data();
    if (data.status === 'accepted') {
      return { status: 'friends', requestId: sentSnap.docs[0].id };
    }
    if (data.status === 'pending') {
      return { status: 'pending_sent', requestId: sentSnap.docs[0].id };
    }
  }

  // Check if they sent us a request
  const receivedQ = query(
    collection(db, 'friend_requests'),
    where('fromUid', '==', targetUid),
    where('toUid', '==', currentUid),
    limit(1),
  );
  const receivedSnap = await getDocs(receivedQ);
  trackFirestoreRead('firestore.getDocs', receivedSnap.size);

  if (!receivedSnap.empty) {
    const data = receivedSnap.docs[0].data();
    if (data.status === 'accepted') {
      return { status: 'friends', requestId: receivedSnap.docs[0].id };
    }
    if (data.status === 'pending') {
      return { status: 'pending_received', requestId: receivedSnap.docs[0].id };
    }
  }

  return { status: 'none' };
}
