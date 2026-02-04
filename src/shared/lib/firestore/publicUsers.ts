import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';

export interface FollowUserRead {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  username: string | null;
}

export const getPublicUsersByIds = async (uids: string[]): Promise<Map<string, FollowUserRead>> => {
  const unique = Array.from(new Set(uids.filter(Boolean)));
  const result = new Map<string, FollowUserRead>();
  if (unique.length === 0) return result;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 10) {
    chunks.push(unique.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const q = query(collection(db, 'users_public'), where(documentId(), 'in', chunk));
    const snapshot = await getDocs(q);
    trackFirestoreRead('firestore.getDocs', snapshot.size);
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data() as {
        displayName?: string | null;
        photoURL?: string | null;
        username?: string | null;
      };
      result.set(docSnap.id, {
        uid: docSnap.id,
        displayName: data.displayName ?? null,
        photoURL: data.photoURL ?? null,
        username: data.username ?? null,
      });
    });
  }

  return result;
};
