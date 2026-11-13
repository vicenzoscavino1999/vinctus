import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  orderBy,
  limit,
  startAfter,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { COLLECTIONS, SUBCOLLECTIONS } from '@/shared/lib/firestore/firestoreContract';
import { normalizePostRead } from '@/shared/lib/firestore/posts';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import type { PaginatedResult, PostRead } from './types';

export async function getSavedPostsRaw(
  uid: string,
  pageSize: number = 12,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResult<PostRead>> {
  let q = query(
    collection(db, COLLECTIONS.users, uid, SUBCOLLECTIONS.savedPosts),
    orderBy('createdAt', 'desc'),
    limit(pageSize + 1),
  );
  if (lastDoc) q = query(q, startAfter(lastDoc));
  const snapshot = await getDocsFromServer(q);
  trackFirestoreRead('firestore.getDocsFromServer', Math.max(1, snapshot.size));
  const docs = snapshot.docs.slice(0, pageSize);
  const items = await Promise.all(
    docs.map(async (saved) => {
      trackFirestoreRead('firestore.getDocFromServer');
      const post = await getDocFromServer(doc(db, COLLECTIONS.posts, saved.id));
      if (!post.exists()) return null;
      const data = post.data();
      if (data.status && data.status !== 'ready') return null;
      return normalizePostRead(post.id, data);
    }),
  );
  return {
    items: items.filter((post): post is PostRead => post !== null),
    lastDoc: docs[docs.length - 1] ?? null,
    hasMore: snapshot.docs.length > pageSize,
  };
}
