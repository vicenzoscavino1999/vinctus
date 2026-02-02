import { doc, setDoc, updateDoc, serverTimestamp, type FieldValue } from 'firebase/firestore';
import { db } from './firebase';

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
 * DUAL-WRITE: Writes both new schema (text/authorSnapshot/status) AND legacy schema (content/authorName/etc)
 */
export async function createPostUploading(input: CreatePostUploadingInput): Promise<void> {
  const ref = doc(db, 'posts', input.postId);

  await setDoc(ref, {
    // ===== NEW SCHEMA =====
    postId: input.postId,
    authorId: input.authorId,
    authorSnapshot: input.authorSnapshot,
    title: input.title ?? null,
    text: input.text,
    status: 'uploading' as PostStatus,

    // ===== LEGACY SCHEMA (compatibility) =====
    content: input.text, // Duplicate text as content
    authorName: input.authorSnapshot.displayName,
    authorUsername: input.authorId, // Fallback to userId if no username
    authorPhoto: input.authorSnapshot.photoURL,

    // ===== COMMON FIELDS =====
    media: [],
    likeCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: null,
    groupId: input.groupId ?? null,
    categoryId: input.categoryId ?? null,
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
  const ref = doc(db, 'posts', postId);
  await updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}
