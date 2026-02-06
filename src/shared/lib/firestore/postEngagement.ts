import {
  collection,
  doc,
  getCountFromServer as _getCountFromServer,
  getDoc as _getDoc,
  getDocs as _getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc as _setDoc,
  startAfter,
  Timestamp,
  where,
  writeBatch,
  type DocumentSnapshot,
  type FieldValue,
} from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';
import { getPost } from '@/shared/lib/firestore/posts';
import { getUserProfile } from '@/shared/lib/firestore/profile';

const DEFAULT_LIMIT = 30;
const ACTIVITY_SNIPPET_LIMIT = 160;

type ActivityTypeModel = 'post_like' | 'post_comment' | 'follow';

interface ActivityReadModel {
  id: string;
  type: ActivityTypeModel;
  toUid: string;
  fromUid: string;
  fromUserName: string | null;
  fromUserPhoto: string | null;
  postId: string | null;
  postSnippet: string | null;
  commentText: string | null;
  createdAt: Date;
  read: boolean;
}

interface ActivityWriteModel {
  type: ActivityTypeModel;
  toUid: string;
  fromUid: string;
  fromUserName: string | null;
  fromUserPhoto: string | null;
  postId: string | null;
  postSnippet: string | null;
  commentText: string | null;
  createdAt: FieldValue;
  read: boolean;
}

interface PostLikeWriteModel {
  uid: string;
  postId: string;
  createdAt: FieldValue;
}

interface UserLikeWriteModel {
  postId: string;
  createdAt: FieldValue;
}

interface PaginatedResultModel<T> {
  items: T[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

export interface PostCommentRead {
  id: string;
  postId: string;
  authorId: string;
  authorSnapshot: {
    displayName: string;
    photoURL: string | null;
  };
  text: string;
  createdAt: Date;
}

const notificationsCollection = collection(db, 'notifications');

const trimText = (
  value: string | null | undefined,
  limit = ACTIVITY_SNIPPET_LIMIT,
): string | null => {
  if (!value) return null;
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trim()}...`;
};

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
};

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

const getCountFromServer = ((...args: unknown[]) => {
  trackFirestoreRead('firestore.getCountFromServer');
  return (_getCountFromServer as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _getCountFromServer;

const setDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.setDoc');
  return (_setDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _setDoc;

/**
 * Like a post - offline-first with writeBatch
 * Cloud Function should handle likesCount increment on onCreate
 *
 * Source of truth: posts/{postId}/likes/{uid}
 * User index: users/{uid}/likes/{postId}
 */
export const likePostWithSync = async (postId: string, uid: string): Promise<void> => {
  const likeRef = doc(db, 'posts', postId, 'likes', uid);
  const userLikeRef = doc(db, 'users', uid, 'likes', postId);

  const batch = writeBatch(db);

  // Source of truth (for counting/triggers)
  batch.set(
    likeRef,
    {
      uid,
      postId,
      createdAt: serverTimestamp(),
    } as PostLikeWriteModel,
    { merge: false },
  );

  // User index (for quick "my likes" queries)
  batch.set(
    userLikeRef,
    {
      postId,
      createdAt: serverTimestamp(),
    } as UserLikeWriteModel,
    { merge: false },
  );

  await batch.commit();

  try {
    const post = await getPost(postId);
    if (!post) return;
    if (post.authorId === uid) return;
    const profile = await getUserProfile(uid);
    await createPostLikeActivity({
      postId,
      postAuthorId: post.authorId,
      postContent: post.content,
      fromUid: uid,
      fromUserName: profile?.displayName ?? null,
      fromUserPhoto: profile?.photoURL ?? null,
    });
  } catch (error) {
    console.error('Error creating like activity:', error);
  }
};

/**
 * Unlike a post - offline-first delete
 * Cloud Function should handle likesCount decrement on onDelete
 */
export const unlikePostWithSync = async (postId: string, uid: string): Promise<void> => {
  const likeRef = doc(db, 'posts', postId, 'likes', uid);
  const userLikeRef = doc(db, 'users', uid, 'likes', postId);

  const batch = writeBatch(db);
  batch.delete(likeRef);
  batch.delete(userLikeRef);
  await batch.commit();
};

/**
 * Check if user liked a post
 */
export const isPostLiked = async (postId: string, uid: string): Promise<boolean> => {
  const docSnap = await getDoc(doc(db, 'posts', postId, 'likes', uid));
  return docSnap.exists();
};

export async function addPostComment(
  postId: string,
  authorId: string,
  authorSnapshot: { displayName: string; photoURL: string | null },
  text: string,
): Promise<string> {
  const commentRef = doc(collection(db, 'posts', postId, 'comments'));
  await setDoc(commentRef, {
    postId,
    authorId,
    authorSnapshot,
    text,
    createdAt: serverTimestamp(),
  });
  try {
    const post = await getPost(postId);
    if (post) {
      await createPostCommentActivity({
        postId,
        postAuthorId: post.authorId,
        postContent: post.content,
        commentText: text,
        fromUid: authorId,
        fromUserName: authorSnapshot.displayName,
        fromUserPhoto: authorSnapshot.photoURL,
      });
    }
  } catch (error) {
    console.error('Error creating comment activity:', error);
  }
  return commentRef.id;
}

export async function getPostComments(
  postId: string,
  limitCount: number = 50,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResultModel<PostCommentRead>> {
  let q = query(
    collection(db, 'posts', postId, 'comments'),
    orderBy('createdAt', 'desc'),
    limit(limitCount + 1),
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  const hasMore = snapshot.docs.length > limitCount;
  const docs = hasMore ? snapshot.docs.slice(0, limitCount) : snapshot.docs;

  const items = docs.map((docSnap) => {
    const data = docSnap.data();
    const createdAt = toDate(data.createdAt) || new Date();
    return {
      id: docSnap.id,
      postId: data.postId || postId,
      authorId: data.authorId || '',
      authorSnapshot: {
        displayName: data.authorSnapshot?.displayName || 'Usuario',
        photoURL: data.authorSnapshot?.photoURL || null,
      },
      text: data.text || '',
      createdAt,
    } as PostCommentRead;
  });

  return {
    items,
    lastDoc: docs[docs.length - 1] || null,
    hasMore,
  };
}

export async function getPostCommentCount(postId: string): Promise<number> {
  const snapshot = await getCountFromServer(collection(db, 'posts', postId, 'comments'));
  return snapshot.data().count;
}

export async function getPostLikeCount(postId: string): Promise<number> {
  const snapshot = await getCountFromServer(collection(db, 'posts', postId, 'likes'));
  return snapshot.data().count;
}

export async function getUserActivity(
  uid: string,
  pageSize: number = DEFAULT_LIMIT,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResultModel<ActivityReadModel>> {
  let q = query(
    notificationsCollection,
    where('toUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(pageSize + 1),
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

  const items = docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      type: data.type as ActivityTypeModel,
      toUid: data.toUid,
      fromUid: data.fromUid,
      fromUserName: data.fromUserName ?? null,
      fromUserPhoto: data.fromUserPhoto ?? null,
      postId: data.postId ?? null,
      postSnippet: data.postSnippet ?? null,
      commentText: data.commentText ?? null,
      createdAt: toDate(data.createdAt) || new Date(),
      read: data.read === true,
    } as ActivityReadModel;
  });

  return {
    items,
    lastDoc: docs[docs.length - 1] || null,
    hasMore,
  };
}

export async function createPostLikeActivity(input: {
  postId: string;
  postAuthorId: string;
  postContent: string | null;
  fromUid: string;
  fromUserName: string | null;
  fromUserPhoto: string | null;
}): Promise<void> {
  if (input.postAuthorId === input.fromUid) return;
  const docId = `like_${input.postId}_${input.fromUid}`;
  await setDoc(
    doc(notificationsCollection, docId),
    {
      type: 'post_like',
      toUid: input.postAuthorId,
      fromUid: input.fromUid,
      fromUserName: input.fromUserName ?? null,
      fromUserPhoto: input.fromUserPhoto ?? null,
      postId: input.postId,
      postSnippet: trimText(input.postContent),
      commentText: null,
      createdAt: serverTimestamp(),
      read: false,
    } as ActivityWriteModel,
    { merge: true },
  );
}

export async function createPostCommentActivity(input: {
  postId: string;
  postAuthorId: string;
  postContent: string | null;
  commentText: string;
  fromUid: string;
  fromUserName: string | null;
  fromUserPhoto: string | null;
}): Promise<string | null> {
  if (input.postAuthorId === input.fromUid) return null;
  const ref = doc(notificationsCollection);
  await setDoc(ref, {
    type: 'post_comment',
    toUid: input.postAuthorId,
    fromUid: input.fromUid,
    fromUserName: input.fromUserName ?? null,
    fromUserPhoto: input.fromUserPhoto ?? null,
    postId: input.postId,
    postSnippet: trimText(input.postContent),
    commentText: trimText(input.commentText, 220),
    createdAt: serverTimestamp(),
    read: false,
  } as ActivityWriteModel);
  return ref.id;
}
