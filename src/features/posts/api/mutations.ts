import {
  addPostComment as addPostCommentRaw,
  createPostCommentReport as createPostCommentReportRaw,
  createPostReport as createPostReportRaw,
  createStory as createStoryRaw,
  getNewStoryId as getNewStoryIdRaw,
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
import { moderateUserText } from '@/shared/lib/contentModeration';
import { AppError, toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate } from '@/shared/lib/validators';
import {
  authorSnapshotSchema,
  commentTextSchema,
  createPostCommentReportInputSchema,
  createPostReportInputSchema,
  createPostUploadingInputSchema,
  createStoryInputSchema,
  postIdSchema,
  storyIdSchema,
  updatePostPatchSchema,
  userIdSchema,
  type CreateStoryInput,
  type UserReportReason,
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

export const getNewStoryId = (): string => {
  try {
    return validate(storyIdSchema, getNewStoryIdRaw(), { field: 'storyId' });
  } catch (error) {
    throw toAppError(error, { operation: 'posts.getNewStoryId' });
  }
};

const ensureModeratedContent = (
  operation: string,
  inputs: Array<string | null | undefined>,
): void => {
  const moderation = moderateUserText(inputs);
  if (!moderation.blocked) {
    return;
  }

  throw new AppError(
    'Tu contenido incluye terminos no permitidos por la comunidad.',
    'VALIDATION_FAILED',
    {
      operation,
      matchedTerms: moderation.matchedTerms,
    },
  );
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
  ensureModeratedContent('posts.addPostComment', [safeText]);

  return runWrite('posts.addPostComment', () =>
    addPostCommentRaw(safePostId, safeAuthorId, safeAuthorSnapshot, safeText),
  );
};

export const createPostReport = async (input: {
  reporterUid: string;
  postId: string;
  postAuthorId?: string | null;
  reason: UserReportReason;
  details?: string | null;
}): Promise<string> => {
  const safeInput = validate(createPostReportInputSchema, input, { field: 'input' });
  return runWrite('posts.createPostReport', () => createPostReportRaw(safeInput));
};

export const createPostCommentReport = async (input: {
  reporterUid: string;
  postId: string;
  commentId: string;
  commentAuthorId?: string | null;
  reason: UserReportReason;
  details?: string | null;
}): Promise<string> => {
  const safeInput = validate(createPostCommentReportInputSchema, input, { field: 'input' });
  return runWrite('posts.createPostCommentReport', () => createPostCommentReportRaw(safeInput));
};

export const createStory = async (input: CreateStoryInput): Promise<string> => {
  const safeInput = validate(createStoryInputSchema, input, { field: 'input' });
  return runWrite('posts.createStory', () => createStoryRaw(safeInput));
};

export const createPostUploading = async (input: CreatePostUploadingInput): Promise<void> => {
  const safeInput = validate(createPostUploadingInputSchema, input, { field: 'input' });
  ensureModeratedContent('posts.createPostUploading', [safeInput.title ?? null, safeInput.text]);
  return runWrite('posts.createPostUploading', () => createPostUploadingRaw(safeInput));
};

export const updatePost = async (postId: string, patch: Record<string, unknown>): Promise<void> => {
  const safePostId = validate(postIdSchema, postId, { field: 'postId' });
  const safePatch = validate(updatePostPatchSchema, patch, { field: 'patch' });
  const text = typeof safePatch.text === 'string' ? safePatch.text : null;
  const content = typeof safePatch.content === 'string' ? safePatch.content : null;
  const title = typeof safePatch.title === 'string' ? safePatch.title : null;
  ensureModeratedContent('posts.updatePost', [title, text, content]);
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
