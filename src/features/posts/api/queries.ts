import type { DocumentSnapshot } from 'firebase/firestore';
import {
  getBlockedUsers as getBlockedUsersRaw,
  getFriendIds as getFriendIdsRaw,
  getFollowingIds as getFollowingIdsRaw,
  getGlobalFeed as getGlobalFeedRaw,
  getPost as getPostRaw,
  getPostCommentCount as getPostCommentCountRaw,
  getPostComments as getPostCommentsRaw,
  getPostLikeCount as getPostLikeCountRaw,
  getPostsByUser as getPostsByUserRaw,
  getStoriesForOwners as getStoriesForOwnersRaw,
  isPostLiked as isPostLikedRaw,
  isPostSaved as isPostSavedRaw,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { safeLimit, validate } from '@/shared/lib/validators';
import {
  OWNER_IDS_READ_CHUNK_SIZE,
  ownerIdsSchema,
  paginationLimitSchema,
  postIdSchema,
  userIdSchema,
  type PaginatedResult,
  type PostCommentRead,
  type PostRead,
  type StoryRead,
} from '@/features/posts/api/types';

const READ_TIMEOUT_MS = 5000;
const READ_RETRYABLE_CODES = [
  'TIMEOUT',
  'NETWORK',
  'deadline-exceeded',
  'unavailable',
  'aborted',
] as const;

const runRead = async <T>(operation: string, fn: () => Promise<T>): Promise<T> => {
  try {
    return await withRetry(() => withTimeout(fn(), READ_TIMEOUT_MS, { operation }), {
      retries: 2,
      backoffMs: 150,
      retryableCodes: READ_RETRYABLE_CODES,
    });
  } catch (error) {
    throw toAppError(error, { operation });
  }
};

export const getBlockedUsers = async (uid: string): Promise<string[]> => {
  const safeUid = validate(userIdSchema, uid, { field: 'uid' });
  return runRead('posts.getBlockedUsers', () => getBlockedUsersRaw(safeUid));
};

export const getFriendIds = async (uid: string): Promise<string[]> => {
  const safeUid = validate(userIdSchema, uid, { field: 'uid' });
  return runRead('posts.getFriendIds', () => getFriendIdsRaw(safeUid));
};

export const getFollowingIds = async (uid: string): Promise<string[]> => {
  const safeUid = validate(userIdSchema, uid, { field: 'uid' });
  return runRead('posts.getFollowingIds', () => getFollowingIdsRaw(safeUid));
};

export const getPost = async (postId: string): Promise<PostRead | null> => {
  const safePostId = validate(postIdSchema, postId, { field: 'postId' });
  return runRead('posts.getPost', () => getPostRaw(safePostId));
};

export const getPostComments = async (
  postId: string,
  limitCount: number = 30,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResult<PostCommentRead>> => {
  const safePostId = validate(postIdSchema, postId, { field: 'postId' });
  const safePageSize = safeLimit(limitCount, 30);
  return runRead('posts.getPostComments', () =>
    getPostCommentsRaw(safePostId, safePageSize, lastDoc),
  );
};

export const getPostCommentCount = async (postId: string): Promise<number> => {
  const safePostId = validate(postIdSchema, postId, { field: 'postId' });
  return runRead('posts.getPostCommentCount', () => getPostCommentCountRaw(safePostId));
};

export const getPostLikeCount = async (postId: string): Promise<number> => {
  const safePostId = validate(postIdSchema, postId, { field: 'postId' });
  return runRead('posts.getPostLikeCount', () => getPostLikeCountRaw(safePostId));
};

export const getPostsByUser = async (
  userId: string,
  pageSize: number = 30,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResult<PostRead>> => {
  const safeUserId = validate(userIdSchema, userId, { field: 'userId' });
  const safePageSize = validate(paginationLimitSchema, safeLimit(pageSize, 30), {
    field: 'pageSize',
  });
  return runRead('posts.getPostsByUser', () =>
    getPostsByUserRaw(safeUserId, safePageSize, lastDoc),
  );
};

export const getGlobalFeed = async (
  pageSize: number = 30,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResult<PostRead>> => {
  const safePageSize = validate(paginationLimitSchema, safeLimit(pageSize, 30), {
    field: 'pageSize',
  });
  return runRead('posts.getGlobalFeed', () => getGlobalFeedRaw(safePageSize, lastDoc));
};

export const getStoriesForOwners = async (ownerIds: string[]): Promise<StoryRead[]> => {
  const uniqueOwnerIds = Array.from(new Set(ownerIds.filter(Boolean)));

  if (uniqueOwnerIds.length === 0) {
    validate(ownerIdsSchema, uniqueOwnerIds, { field: 'ownerIds' });
  }

  if (uniqueOwnerIds.length <= OWNER_IDS_READ_CHUNK_SIZE) {
    const safeOwnerIds = validate(ownerIdsSchema, uniqueOwnerIds, { field: 'ownerIds' });
    return runRead('posts.getStoriesForOwners', () => getStoriesForOwnersRaw(safeOwnerIds));
  }

  const chunks: string[][] = [];
  for (let index = 0; index < uniqueOwnerIds.length; index += OWNER_IDS_READ_CHUNK_SIZE) {
    chunks.push(uniqueOwnerIds.slice(index, index + OWNER_IDS_READ_CHUNK_SIZE));
  }

  const chunkResults = await Promise.allSettled(
    chunks.map((chunk, index) => {
      const safeChunk = validate(ownerIdsSchema, chunk, { field: `ownerIds[chunk:${index}]` });
      return runRead(`posts.getStoriesForOwners.chunk:${index}`, () =>
        getStoriesForOwnersRaw(safeChunk),
      );
    }),
  );

  const merged = new Map<string, StoryRead>();
  let firstError: unknown = null;

  for (const result of chunkResults) {
    if (result.status === 'fulfilled') {
      result.value.forEach((story) => merged.set(story.id, story));
      continue;
    }
    if (!firstError) firstError = result.reason;
  }

  if (merged.size === 0 && firstError) {
    throw firstError;
  }

  return Array.from(merged.values()).sort((a, b) => {
    const aTime = a.createdAt?.getTime?.() ?? 0;
    const bTime = b.createdAt?.getTime?.() ?? 0;
    return bTime - aTime;
  });
};

export const isPostLiked = async (postId: string, uid: string): Promise<boolean> => {
  const safePostId = validate(postIdSchema, postId, { field: 'postId' });
  const safeUid = validate(userIdSchema, uid, { field: 'uid' });
  return runRead('posts.isPostLiked', () => isPostLikedRaw(safePostId, safeUid));
};

export const isPostSaved = async (postId: string, uid: string): Promise<boolean> => {
  const safePostId = validate(postIdSchema, postId, { field: 'postId' });
  const safeUid = validate(userIdSchema, uid, { field: 'uid' });
  return runRead('posts.isPostSaved', () => isPostSavedRaw(safePostId, safeUid));
};
