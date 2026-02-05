import { collection, doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { idSchema, validate, z } from '@/shared/lib/validators';

import {
  createPostCommentActivity,
  createPostLikeActivity,
  getPost,
  getUserProfile,
} from '@/shared/lib/firestore';

export { createStory, getNewPostId } from '@/shared/lib/firestore';
export { createPostUploading, updatePost } from '@/shared/lib/firestore-post-upload';

const WRITE_TIMEOUT_MS = 5000;

const commentTextSchema = z.string().trim().min(1).max(1000);

const normalizeDisplayName = (value: unknown): string => {
  if (typeof value !== 'string') return 'Usuario';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'Usuario';
};

const normalizeNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const likePostWithSync = async (postId: string, uid: string): Promise<void> => {
  const safePostId = validate(idSchema, postId, { context: { postId } });
  const safeUid = validate(idSchema, uid, { context: { uid } });

  const likeRef = doc(db, 'posts', safePostId, 'likes', safeUid);
  const userLikeRef = doc(db, 'users', safeUid, 'likes', safePostId);

  try {
    await withTimeout(
      withRetry(
        async () => {
          const batch = writeBatch(db);
          batch.set(
            likeRef,
            {
              uid: safeUid,
              postId: safePostId,
              createdAt: serverTimestamp(),
            },
            { merge: false },
          );
          batch.set(
            userLikeRef,
            {
              postId: safePostId,
              createdAt: serverTimestamp(),
            },
            { merge: false },
          );
          await batch.commit();
        },
        { context: { op: 'posts.likePostWithSync', postId: safePostId, uid: safeUid } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'posts.likePostWithSync', postId: safePostId, uid: safeUid } },
    );

    trackFirestoreWrite('posts.likePostWithSync', 2);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'posts.likePostWithSync', postId: safePostId, uid: safeUid },
    });
  }

  try {
    const post = await getPost(safePostId);
    if (!post) return;
    if (post.authorId === safeUid) return;
    const profile = await getUserProfile(safeUid);
    await createPostLikeActivity({
      postId: safePostId,
      postAuthorId: post.authorId,
      postContent: post.content,
      fromUid: safeUid,
      fromUserName: profile?.displayName ?? null,
      fromUserPhoto: profile?.photoURL ?? null,
    });
  } catch (error) {
    console.error('Error creating like activity:', error);
  }
};

export const unlikePostWithSync = async (postId: string, uid: string): Promise<void> => {
  const safePostId = validate(idSchema, postId, { context: { postId } });
  const safeUid = validate(idSchema, uid, { context: { uid } });

  const likeRef = doc(db, 'posts', safePostId, 'likes', safeUid);
  const userLikeRef = doc(db, 'users', safeUid, 'likes', safePostId);

  try {
    await withTimeout(
      withRetry(
        async () => {
          const batch = writeBatch(db);
          batch.delete(likeRef);
          batch.delete(userLikeRef);
          await batch.commit();
        },
        { context: { op: 'posts.unlikePostWithSync', postId: safePostId, uid: safeUid } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'posts.unlikePostWithSync', postId: safePostId, uid: safeUid } },
    );

    trackFirestoreWrite('posts.unlikePostWithSync', 2);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'posts.unlikePostWithSync', postId: safePostId, uid: safeUid },
    });
  }
};

export const savePostWithSync = async (postId: string, uid: string): Promise<void> => {
  const safePostId = validate(idSchema, postId, { context: { postId } });
  const safeUid = validate(idSchema, uid, { context: { uid } });

  const savedRef = doc(db, 'users', safeUid, 'savedPosts', safePostId);

  try {
    await withTimeout(
      withRetry(
        async () => {
          const batch = writeBatch(db);
          batch.set(
            savedRef,
            {
              postId: safePostId,
              createdAt: serverTimestamp(),
            },
            { merge: false },
          );
          await batch.commit();
        },
        { context: { op: 'posts.savePostWithSync', postId: safePostId, uid: safeUid } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'posts.savePostWithSync', postId: safePostId, uid: safeUid } },
    );

    trackFirestoreWrite('posts.savePostWithSync', 1);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'posts.savePostWithSync', postId: safePostId, uid: safeUid },
    });
  }
};

export const unsavePostWithSync = async (postId: string, uid: string): Promise<void> => {
  const safePostId = validate(idSchema, postId, { context: { postId } });
  const safeUid = validate(idSchema, uid, { context: { uid } });

  const savedRef = doc(db, 'users', safeUid, 'savedPosts', safePostId);

  try {
    await withTimeout(
      withRetry(
        async () => {
          const batch = writeBatch(db);
          batch.delete(savedRef);
          await batch.commit();
        },
        { context: { op: 'posts.unsavePostWithSync', postId: safePostId, uid: safeUid } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'posts.unsavePostWithSync', postId: safePostId, uid: safeUid } },
    );

    trackFirestoreWrite('posts.unsavePostWithSync', 1);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'posts.unsavePostWithSync', postId: safePostId, uid: safeUid },
    });
  }
};

export const addPostComment = async (
  postId: string,
  authorId: string,
  authorSnapshot: { displayName: string; photoURL: string | null },
  text: string,
): Promise<string> => {
  const safePostId = validate(idSchema, postId, { context: { postId } });
  const safeAuthorId = validate(idSchema, authorId, { context: { authorId } });
  const safeText = validate(commentTextSchema, text, { context: { postId: safePostId } });

  const snapshot = {
    displayName: normalizeDisplayName(authorSnapshot?.displayName),
    photoURL: normalizeNullableString(authorSnapshot?.photoURL),
  };

  const commentRef = doc(collection(db, 'posts', safePostId, 'comments'));
  const commentId = commentRef.id;

  try {
    await withTimeout(
      withRetry(
        () =>
          setDoc(
            commentRef,
            {
              postId: safePostId,
              authorId: safeAuthorId,
              authorSnapshot: snapshot,
              text: safeText,
              createdAt: serverTimestamp(),
            },
            { merge: false },
          ),
        {
          context: {
            op: 'posts.addPostComment',
            postId: safePostId,
            authorId: safeAuthorId,
            commentId,
          },
        },
      ),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'posts.addPostComment',
          postId: safePostId,
          authorId: safeAuthorId,
          commentId,
        },
      },
    );

    trackFirestoreWrite('posts.addPostComment', 1);
  } catch (error) {
    throw toAppError(error, {
      context: {
        op: 'posts.addPostComment',
        postId: safePostId,
        authorId: safeAuthorId,
        commentId,
      },
    });
  }

  try {
    const post = await getPost(safePostId);
    if (post) {
      await createPostCommentActivity({
        postId: safePostId,
        postAuthorId: post.authorId,
        postContent: post.content,
        commentText: safeText,
        fromUid: safeAuthorId,
        fromUserName: snapshot.displayName,
        fromUserPhoto: snapshot.photoURL,
      });
    }
  } catch (error) {
    console.error('Error creating comment activity:', error);
  }

  return commentId;
};
