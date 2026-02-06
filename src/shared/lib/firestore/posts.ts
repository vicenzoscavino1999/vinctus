import {
  collection,
  deleteDoc as _deleteDoc,
  doc,
  getDoc as _getDoc,
  getDocs as _getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc as _setDoc,
  startAfter,
  Timestamp,
  updateDoc as _updateDoc,
  where,
  type DocumentSnapshot,
  type FieldValue,
} from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';

const DEFAULT_LIMIT = 30;

interface PaginatedResult<T> {
  items: T[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

/**
 * Media attachment for posts
 */
export interface PostMedia {
  url: string;
  path: string; // Storage path: posts/{authorId}/{postId}/(images|videos|files)/{filename}
  type: 'image' | 'video' | 'file';
  contentType: string;
  width?: number; // For CLS prevention
  height?: number; // For CLS prevention
  fileName?: string;
  size?: number;
}

/**
 * Post read type (from Firestore)
 */
export interface PostRead {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorPhoto: string | null;
  title?: string | null;
  content: string;
  media: PostMedia[];
  groupId: string | null;
  categoryId: string | null;
  likeCount: number;
  commentCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
}

interface PostWrite {
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorPhoto: string | null;
  title?: string | null;
  content: string;
  media: PostMedia[];
  groupId: string | null;
  categoryId: string | null;
  likeCount: number;
  commentCount: number;
  createdAt: FieldValue;
  updatedAt: FieldValue | null;
}

const getDoc = ((...args: unknown[]) => {
  trackFirestoreRead('firestore.getDoc');
  return (_getDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _getDoc;

const getDocs = ((...args: unknown[]) => {
  const result = (_getDocs as (...innerArgs: unknown[]) => unknown)(...args);

  if (
    typeof result === 'object' &&
    result !== null &&
    'then' in result &&
    typeof (result as Promise<unknown>).then === 'function'
  ) {
    return (result as Promise<unknown>).then((snapshot) => {
      const size = (snapshot as { size?: unknown }).size;
      const safeSize =
        typeof size === 'number' && Number.isFinite(size) && size >= 0 ? Math.floor(size) : 1;
      trackFirestoreRead('firestore.getDocs', Math.max(1, safeSize));
      return snapshot;
    });
  }

  const size = (result as { size?: unknown }).size;
  const safeSize =
    typeof size === 'number' && Number.isFinite(size) && size >= 0 ? Math.floor(size) : 1;
  trackFirestoreRead('firestore.getDocs', Math.max(1, safeSize));
  return result;
}) as typeof _getDocs;

const setDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.setDoc');
  return (_setDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _setDoc;

const updateDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.updateDoc');
  return (_updateDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _updateDoc;

const deleteDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.deleteDoc');
  return (_deleteDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _deleteDoc;

const postsCollection = collection(db, 'posts');

/**
 * Generate a new post ID BEFORE uploading media.
 *
 * Flow:
 * 1. postId = getNewPostId()
 * 2. Upload media to posts/{userId}/{postId}/...
 * 3. createPost(postId, ...) with media URLs
 */
export function getNewPostId(): string {
  return doc(postsCollection).id;
}

/**
 * Create a new post with a pre-generated ID.
 * Author info is validated server-side against users_public/{uid}.
 */
export async function createPost(
  postId: string,
  authorId: string,
  authorName: string,
  authorUsername: string,
  authorPhoto: string | null,
  content: string,
  media: PostMedia[],
  groupId: string | null = null,
  categoryId: string | null = null,
  title: string | null = null,
): Promise<void> {
  const postData: PostWrite = {
    authorId,
    authorName,
    authorUsername,
    authorPhoto,
    title,
    content,
    media,
    groupId,
    categoryId,
    likeCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: null,
  };

  await setDoc(doc(postsCollection, postId), postData);
}

/**
 * Get a single post by ID
 */
export async function getPost(postId: string): Promise<PostRead | null> {
  const docSnap = await getDoc(doc(postsCollection, postId));
  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  return {
    id: docSnap.id,
    authorId: data.authorId,
    authorName: data.authorName,
    authorUsername: data.authorUsername,
    authorPhoto: data.authorPhoto,
    title: typeof data.title === 'string' ? data.title : null,
    content: data.content,
    media: data.media || [],
    groupId: data.groupId,
    categoryId: data.categoryId,
    likeCount: data.likeCount || 0,
    commentCount: data.commentCount || 0,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

/**
 * Get posts by group (paginated)
 */
export async function getPostsByGroup(
  groupId: string,
  pageSize: number = DEFAULT_LIMIT,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResult<PostRead>> {
  let q = query(
    postsCollection,
    where('groupId', '==', groupId),
    orderBy('createdAt', 'desc'),
    limit(pageSize + 1),
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

  const items = docs.map(
    (d) =>
      ({
        id: d.id,
        ...d.data(),
      }) as PostRead,
  );

  return {
    items,
    lastDoc: docs[docs.length - 1] || null,
    hasMore,
  };
}

/**
 * Get posts by user (paginated)
 */
export async function getPostsByUser(
  userId: string,
  pageSize: number = DEFAULT_LIMIT,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResult<PostRead>> {
  let q = query(
    postsCollection,
    where('authorId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(pageSize + 1),
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

  const items = docs.map(
    (d) =>
      ({
        id: d.id,
        ...d.data(),
      }) as PostRead,
  );

  return {
    items,
    lastDoc: docs[docs.length - 1] || null,
    hasMore,
  };
}

/**
 * Get posts by category (paginated)
 */
export async function getPostsByCategory(
  categoryId: string,
  pageSize: number = DEFAULT_LIMIT,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResult<PostRead>> {
  let q = query(
    postsCollection,
    where('categoryId', '==', categoryId),
    orderBy('createdAt', 'desc'),
    limit(pageSize + 1),
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

  const items = docs.map(
    (d) =>
      ({
        id: d.id,
        ...d.data(),
      }) as PostRead,
  );

  return {
    items,
    lastDoc: docs[docs.length - 1] || null,
    hasMore,
  };
}

/**
 * Get global feed (paginated) - posts from all groups
 */
export async function getGlobalFeed(
  pageSize: number = DEFAULT_LIMIT,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResult<PostRead>> {
  let q = query(postsCollection, orderBy('createdAt', 'desc'), limit(pageSize + 1));

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

  const items = docs.map(
    (d) =>
      ({
        id: d.id,
        ...d.data(),
      }) as PostRead,
  );

  return {
    items,
    lastDoc: docs[docs.length - 1] || null,
    hasMore,
  };
}

/**
 * Update a post (only content and media can be edited)
 */
export async function updatePost(
  postId: string,
  content: string,
  media: PostMedia[],
): Promise<void> {
  await updateDoc(doc(postsCollection, postId), {
    content,
    media,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a post
 * Note: Cloud Function onPostDeleted handles cleanup of media + subcollections
 */
export async function deletePost(postId: string): Promise<void> {
  await deleteDoc(doc(postsCollection, postId));
}
