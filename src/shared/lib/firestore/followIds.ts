import { collection, getDocs, limit, query } from 'firebase/firestore';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';

// Matches the legacy cap used when fetching IDs from user subcollections.
const ID_SUBCOLLECTION_FETCH_LIMIT = 1000;

export async function getFollowingIds(uid: string): Promise<string[]> {
  const snapshot = await getDocs(
    query(collection(db, 'users', uid, 'following'), limit(ID_SUBCOLLECTION_FETCH_LIMIT)),
  );
  trackFirestoreRead('firestore.getDocs', snapshot.size);
  return snapshot.docs.map((docSnap) => docSnap.id);
}

export async function getFollowerIds(uid: string): Promise<string[]> {
  const snapshot = await getDocs(
    query(collection(db, 'users', uid, 'followers'), limit(ID_SUBCOLLECTION_FETCH_LIMIT)),
  );
  trackFirestoreRead('firestore.getDocs', snapshot.size);
  return snapshot.docs.map((docSnap) => docSnap.id);
}
