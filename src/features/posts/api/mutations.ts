import {
  addPostComment as addPostCommentRaw,
  createStory as createStoryRaw,
  getNewPostId as getNewPostIdRaw,
  likePostWithSync as likePostWithSyncRaw,
  savePostWithSync as savePostWithSyncRaw,
  unlikePostWithSync as unlikePostWithSyncRaw,
  unsavePostWithSync as unsavePostWithSyncRaw,
} from '@/shared/lib/firestore';
import {
  createPostUploading as createPostUploadingRaw,
  updatePost as updatePostRaw,
  type CreatePostUploadingInput,
} from '@/shared/lib/firestore-post-upload';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate } from '@/shared/lib/validators';
import {
  authorSnapshotSchema,
  commentTextSchema,
  createPostUploadingInputSchema,
  createStoryInputSchema,
  postIdSchema,
  updatePostPatchSchema,
  userIdSchema,
  type CreateStoryInput,
} from '@/features/posts/api/types';

const WRITE_TIMEOUT_MS = 7000;
const WRITE_RETRYABLE_CODES = [
  'TIMEOUT',
  'NETWORK',
  'deadline-exceeded',
  'unavailable',
  'aborted',
  'resource-exhausted',
] as const;

const runWrite = async <T>(operation: string, fn: () => Promise<T>): Promise<T> => {
  try {
    return await withRetry(() => withTimeout(fn(), WRITE_TIMEOUT_MS, { operation }), {
      retries: 1,
      backoffMs: 200,
      retryableCodes: WRITE_RETRYABLE_CODES,
    });
  } catch (error) {
    throw toAppError(error, { operation });
  }
};

export const getNewPostId = (): string => {
  try {
    return validate(postIdSchema, getNewPostIdRaw(), { field: 'postId' });
  } catch (error) {
    throw toAppError(error, { operation: 'posts.getNewPostId' });
  }
};

export const addPostComment = async (
  postId: string,
  authorId: string,
  authorSnapshot: { displayName: string; photoURL: string | null },
  text: string,
): Promise<string> => {
  const safePostId = validate(postIdSchema, postId, { field: 'postId' });
  const safeAuthorId = validate(userIdSchema, authorId, { field: 'authorId' });
  const safeAuthorSnapshot = validate(authorSnapshotSchema, authorSnapshot, {
    field: 'authorSnapshot',
  });
  const safeText = validate(commentTextSchema, text, { field: 'text' });

  return runWrite('posts.addPostComment', () =>
    addPostCommentRaw(safePostId, safeAuthorId, safeAuthorSnapshot, safeText),
  );
};

export const createStory = async (input: CreateStoryInput): Promise<string> => {
  const safeInput = validate(createStoryInputSchema, input, { field: 'input' });
  return runWrite('posts.createStory', () => createStoryRaw(safeInput));
};

export const createPostUploading = async (input: CreatePostUploadingInput): Promise<void> => {
  const safeInput = validate(createPostUploadingInputSchema, input, { field: 'input' });
  return runWrite('posts.createPostUploading', () => createPostUploadingRaw(safeInput));
};

export const updatePost = async (postId: string, patch: Record<string, unknown>): Promise<void> => {
  const safePostId = validate(postIdSchema, postId, { field: 'postId' });
  const safePatch = validate(updatePostPatchSchema, patch, { field: 'patch' });
  return runWrite('posts.updatePost', () => updatePostRaw(safePostId, safePatch));
};

export const likePostWithSync = async (postId: string, uid: string): Promise<void> => {
  const safePostId = validate(postIdSchema, postId, { field: 'postId' });
  const safeUid = validate(userIdSchema, uid, { field: 'uid' });
  return runWrite('posts.likePostWithSync', () => likePostWithSyncRaw(safePostId, safeUid));
};

export const unlikePostWithSync = async (postId: string, uid: string): Promise<void> => {
  const safePostId = validate(postIdSchema, postId, { field: 'postId' });
  const safeUid = validate(userIdSchema, uid, { field: 'uid' });
  return runWrite('posts.unlikePostWithSync', () => unlikePostWithSyncRaw(safePostId, safeUid));
};

export const savePostWithSync = async (postId: string, uid: string): Promise<void> => {
  const safePostId = validate(postIdSchema, postId, { field: 'postId' });
  const safeUid = validate(userIdSchema, uid, { field: 'uid' });
  return runWrite('posts.savePostWithSync', () => savePostWithSyncRaw(safePostId, safeUid));
};

export const unsavePostWithSync = async (postId: string, uid: string): Promise<void> => {
  const safePostId = validate(postIdSchema, postId, { field: 'postId' });
  const safeUid = validate(userIdSchema, uid, { field: 'uid' });
  return runWrite('posts.unsavePostWithSync', () => unsavePostWithSyncRaw(safePostId, safeUid));
};
