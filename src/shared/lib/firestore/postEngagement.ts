import {
  collection,
  doc,
  getDocFromServer,
  getDocs as _getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
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
import { readPostRecords, type PostPage } from '@/shared/lib/post-reads-client';
import { getPost } from '@/shared/lib/firestore/posts';
import { getUserProfile } from '@/shared/lib/firestore/profile';
import { COLLECTIONS, SUBCOLLECTIONS } from '@/shared/lib/firestore/firestoreContract';

const DEFAULT_LIMIT = 30;

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

const notificationsCollection = collection(db, COLLECTIONS.notifications);

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
};

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

/**
 * Set the desired state without rewriting a previously confirmed like.
 * Cloud Function should handle likesCount increment on onCreate
 *
 * Source of truth: posts/{postId}/likes/{uid}
 * User index: users/{uid}/likes/{postId}
 */
export const likePostWithSync = async (postId: string, uid: string): Promise<void> => {
  const likeRef = doc(db, COLLECTIONS.posts, postId, SUBCOLLECTIONS.likes, uid);
  const userLikeRef = doc(db, COLLECTIONS.users, uid, SUBCOLLECTIONS.likes, postId);

  const created = await runTransaction(db, async (tx) => {
    const [post, like, index] = await Promise.all([
      tx.get(doc(db, COLLECTIONS.posts, postId)),
      tx.get(likeRef),
      tx.get(userLikeRef),
    ]);
    if (!post.exists() || (post.data().status && post.data().status !== 'ready')) {
      throw new Error('La publicación ya no está disponible.');
    }
    if (!like.exists())
      tx.set(likeRef, { uid, postId, createdAt: serverTimestamp() } as PostLikeWriteModel);
    if (!index.exists())
      tx.set(userLikeRef, { postId, createdAt: serverTimestamp() } as UserLikeWriteModel);
    return !like.exists();
  });

  try {
    const post = created ? await getPost(postId) : null;
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
  const likeRef = doc(db, COLLECTIONS.posts, postId, SUBCOLLECTIONS.likes, uid);
  const userLikeRef = doc(db, COLLECTIONS.users, uid, SUBCOLLECTIONS.likes, postId);

  const batch = writeBatch(db);
  batch.delete(likeRef);
  batch.delete(userLikeRef);
  await batch.commit();
};

/**
 * Check if user liked a post
 */
export const isPostLiked = async (postId: string, uid: string): Promise<boolean> => {
  trackFirestoreRead('firestore.getDocFromServer');
  const docSnap = await getDocFromServer(
    doc(db, COLLECTIONS.posts, postId, SUBCOLLECTIONS.likes, uid),
  );
  return docSnap.exists();
};

export async function addPostComment(
  postId: string,
  authorId: string,
  authorSnapshot: { displayName: string; photoURL: string | null },
  text: string,
  commentId?: string,
): Promise<string> {
  const comments = collection(db, COLLECTIONS.posts, postId, SUBCOLLECTIONS.comments);
  const commentRef = commentId ? doc(comments, commentId) : doc(comments);
  // A timeout can happen after the server accepted the write. Reuse the same
  // document, without updating immutable comments or firing the counter twice.
  const created = await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(commentRef);
    if (existing.exists()) {
      const data = existing.data();
      if (data.authorId !== authorId || data.postId !== postId || data.text !== text) {
        throw new Error('El comentario pendiente no coincide con este borrador.');
      }
      return false;
    }
    transaction.set(commentRef, {
      postId,
      authorId,
      authorSnapshot,
      text,
      createdAt: serverTimestamp(),
    });
    return true;
  });
  try {
    const post = created ? await getPost(postId) : null;
    if (post) {
      await createPostCommentActivity({
        postId,
        postAuthorId: post.authorId,
        postContent: post.content,
        commentText: text,
        fromUid: authorId,
        fromUserName: authorSnapshot.displayName,
        fromUserPhoto: authorSnapshot.photoURL,
        commentId: commentRef.id,
      });
    }
  } catch (error) {
    console.error('Error creating comment activity:', error);
  }
  return commentRef.id;
}

export async function getPostComments(
  postId: string,
  limitCount = 30,
  lastDoc?: string,
): Promise<PostPage<PostCommentRead>> {
  const page = await readPostRecords({
    view: 'comments',
    id: postId,
    limit: limitCount,
    ...(lastDoc ? { cursor: lastDoc } : {}),
  });
  const items = page.items.map((data): PostCommentRead => {
    const author = data.authorSnapshot as { displayName?: string; photoURL?: string | null } | null;
    return {
      id: String(data.id),
      postId,
      authorId: typeof data.authorId === 'string' ? data.authorId : '',
      authorSnapshot: {
        displayName: author?.displayName || 'Usuario',
        photoURL: author?.photoURL || null,
      },
      text: typeof data.text === 'string' ? data.text : '',
      createdAt: toDate(data.createdAt) || new Date(),
    };
  });
  return { items, lastDoc: page.lastDoc, hasMore: page.hasMore };
}

export async function getPostCommentCount(postId: string): Promise<number> {
  return (await getPost(postId))?.commentCount ?? 0;
}

export async function getPostLikeCount(postId: string): Promise<number> {
  return (await getPost(postId))?.likeCount ?? 0;
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
      postSnippet: null,
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
  commentId?: string;
}): Promise<string | null> {
  if (input.postAuthorId === input.fromUid) return null;
  const ref = input.commentId
    ? doc(notificationsCollection, `comment_${input.postId}_${input.commentId}`)
    : doc(notificationsCollection);
  const payload = {
    type: 'post_comment',
    toUid: input.postAuthorId,
    fromUid: input.fromUid,
    fromUserName: input.fromUserName ?? null,
    fromUserPhoto: input.fromUserPhoto ?? null,
    postId: input.postId,
    postSnippet: null,
    commentText: null,
    createdAt: serverTimestamp(),
    read: false,
  } as ActivityWriteModel;
  await setDoc(ref, payload);
  return ref.id;
}
