import {
  doc,
  runTransaction,
  updateDoc,
  serverTimestamp,
  type FieldValue,
} from 'firebase/firestore';
import { db } from './firebase';
import { COLLECTIONS } from '@/shared/lib/firestore/firestoreContract';

export type PostStatus = 'uploading' | 'ready' | 'failed';

export type AuthorSnapshot = {
  displayName: string;
  photoURL: string | null;
};

export type CreatePostUploadingInput = {
  postId: string;
  authorId: string;
  authorSnapshot: AuthorSnapshot;
  title?: string | null;
  text: string;
  groupId?: string | null;
  categoryId?: string | null;
};

/**
 * Create post with "uploading" status (Phase 1 of 3)
 */
export async function createPostUploading(input: CreatePostUploadingInput): Promise<void> {
  const ref = doc(db, COLLECTIONS.posts, input.postId);

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists()) {
      const data = existing.data();
      if (
        data.authorId !== input.authorId ||
        data.text !== input.text ||
        (data.title ?? null) !== (input.title ?? null) ||
        (data.groupId ?? null) !== (input.groupId ?? null) ||
        (data.categoryId ?? null) !== (input.categoryId ?? null)
      ) {
        throw new Error('La publicación pendiente no coincide con este borrador.');
      }
      return;
    }
    transaction.set(ref, {
      postId: input.postId,
      authorId: input.authorId,
      authorSnapshot: input.authorSnapshot,
      title: input.title ?? null,
      text: input.text,
      status: 'uploading' as PostStatus,

      media: [],
      likeCount: 0,
      commentCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: null,
      groupId: input.groupId ?? null,
      categoryId: input.categoryId ?? null,
    });
  });
}

/**
 * Update post (typically to set status:'ready' with media URLs)
 * Called after successful upload (Phase 3 of 3)
 */
export async function updatePost(
  postId: string,
  patch: Record<string, unknown> & { updatedAt?: FieldValue },
): Promise<void> {
  const ref = doc(db, COLLECTIONS.posts, postId);
  if (patch.status === 'ready' || patch.status === 'failed') {
    await runTransaction(db, async (transaction) => {
      const existing = await transaction.get(ref);
      if (!existing.exists()) throw new Error('No se encontró la publicación pendiente.');
      if (existing.data().status === 'ready') {
        // Ready is terminal for the upload workflow. A late failure or a lost
        // acknowledgement must not remove media or change an accepted post.
        return;
      }
      transaction.update(ref, { ...patch, updatedAt: serverTimestamp() });
    });
    return;
  }
  await updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}
