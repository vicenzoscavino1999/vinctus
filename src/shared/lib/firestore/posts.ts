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
const DEFAULT_AUTHOR_NAME = 'Usuario';
const POST_STATUS_VALUES = ['ready', 'uploading', 'failed'] as const;

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

export interface PostAuthorSnapshot {
  displayName: string;
  photoURL: string | null;
}

/**
 * Post read type (from Firestore)
 *
 * Dual schema support:
 * - New schema fields: authorSnapshot, text, status
 * - Legacy schema fields: authorName, authorUsername, authorPhoto, content
 *
 * Normalization ensures canonical fallbacks are always present for legacy consumers.
 */
export interface PostRead {
  id: string;
  postId: string;
  authorId: string;
  authorSnapshot: PostAuthorSnapshot;
  authorName: string;
  authorUsername: string;
  authorPhoto: string | null;
  title?: string | null;
  text: string;
  content: string;
  status?: (typeof POST_STATUS_VALUES)[number];
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
  authorSnapshot: PostAuthorSnapshot;
  authorName: string;
  authorUsername: string;
  authorPhoto: string | null;
  title?: string | null;
  text: string;
  content: string;
  status: 'ready';
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

const toNullableString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const toStringWithFallback = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const toNullableTimestamp = (value: unknown): Timestamp | null => {
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    const dateValue = (value as { toDate: () => unknown }).toDate();
    if (dateValue instanceof Date) return Timestamp.fromDate(dateValue);
  }
  return null;
};

const toCounter = (primary: unknown, fallback: unknown): number => {
  if (typeof primary === 'number' && Number.isFinite(primary) && primary >= 0) {
    return Math.floor(primary);
  }
  if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback >= 0) {
    return Math.floor(fallback);
  }
  return 0;
};

const toStatus = (value: unknown): PostRead['status'] => {
  if (typeof value !== 'string') return undefined;
  return (POST_STATUS_VALUES as readonly string[]).includes(value)
    ? (value as PostRead['status'])
    : undefined;
};

const toPostMediaArray = (value: unknown): PostMedia[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const record = item as Record<string, unknown>;
    const url = toNullableString(record.url);
    const path = toNullableString(record.path) ?? url;
    const type = toNullableString(record.type);
    if (!url || !path || !type || !['image', 'video', 'file'].includes(type)) return [];
    const width =
      typeof record.width === 'number' && Number.isFinite(record.width) ? record.width : undefined;
    const height =
      typeof record.height === 'number' && Number.isFinite(record.height)
        ? record.height
        : undefined;
    const size =
      typeof record.size === 'number' && Number.isFinite(record.size) ? record.size : undefined;

    return [
      {
        url,
        path,
        type: type as PostMedia['type'],
        contentType: toStringWithFallback(record.contentType),
        width,
        height,
        fileName: toNullableString(record.fileName) ?? undefined,
        size,
      } satisfies PostMedia,
    ];
  });
};

const normalizePostRead = (id: string, data: Record<string, unknown>): PostRead => {
  const rawAuthorSnapshot =
    typeof data.authorSnapshot === 'object' && data.authorSnapshot !== null
      ? (data.authorSnapshot as Record<string, unknown>)
      : null;
  const snapshotDisplayName = toNullableString(rawAuthorSnapshot?.displayName);
  const snapshotPhotoURL = toNullableString(rawAuthorSnapshot?.photoURL);

  const authorName =
    snapshotDisplayName ?? toStringWithFallback(data.authorName, DEFAULT_AUTHOR_NAME);
  const authorPhoto = snapshotPhotoURL ?? toNullableString(data.authorPhoto) ?? null;
  const authorUsername =
    toStringWithFallback(data.authorUsername) || toStringWithFallback(data.authorId);

  const text = toNullableString(data.text) ?? toStringWithFallback(data.content);
  const content = toNullableString(data.content) ?? text;

  return {
    id,
    postId: id,
    authorId: toStringWithFallback(data.authorId),
    authorSnapshot: {
      displayName: authorName,
      photoURL: authorPhoto,
    },
    authorName,
    authorUsername,
    authorPhoto,
    title: toNullableString(data.title),
    text,
    content,
    status: toStatus(data.status),
    media: toPostMediaArray(data.media),
    groupId: toNullableString(data.groupId),
    categoryId: toNullableString(data.categoryId),
    likeCount: toCounter(data.likeCount, (data as { likesCount?: unknown }).likesCount),
    commentCount: toCounter(data.commentCount, (data as { commentsCount?: unknown }).commentsCount),
    createdAt: toNullableTimestamp(data.createdAt) ?? Timestamp.now(),
    updatedAt: toNullableTimestamp(data.updatedAt),
  };
};

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
    authorSnapshot: {
      displayName: authorName,
      photoURL: authorPhoto,
    },
    authorName,
    authorUsername,
    authorPhoto,
    title,
    text: content,
    content,
    status: 'ready',
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

  const data = docSnap.data() as Record<string, unknown>;
  return normalizePostRead(docSnap.id, data);
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

  const items = docs.map((d) => normalizePostRead(d.id, d.data() as Record<string, unknown>));

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

  const items = docs.map((d) => normalizePostRead(d.id, d.data() as Record<string, unknown>));

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

  const items = docs.map((d) => normalizePostRead(d.id, d.data() as Record<string, unknown>));

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

  const items = docs.map((d) => normalizePostRead(d.id, d.data() as Record<string, unknown>));

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
    text: content,
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
