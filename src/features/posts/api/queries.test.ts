import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PaginatedResult,
  PostCommentRead,
  PostRead,
  StoryRead,
} from '@/features/posts/api/types';
import { AppError } from '@/shared/lib/errors';
import {
  getBlockedUsers,
  getFriendIds,
  getPost,
  getPostCommentCount,
  getPostComments,
  getPostLikeCount,
  getPostsByUser,
  getStoriesForOwners,
  isPostLiked,
  isPostSaved,
} from '@/features/posts/api/queries';

vi.mock('@/shared/lib/firestore', () => ({
  getBlockedUsers: vi.fn(),
  getFriendIds: vi.fn(),
  getPost: vi.fn(),
  getPostCommentCount: vi.fn(),
  getPostComments: vi.fn(),
  getPostLikeCount: vi.fn(),
  getPostsByUser: vi.fn(),
  getStoriesForOwners: vi.fn(),
  isPostLiked: vi.fn(),
  isPostSaved: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

const emptyPostsPage: PaginatedResult<PostRead> = {
  items: [],
  lastDoc: null,
  hasMore: false,
};

const emptyCommentsPage: PaginatedResult<PostCommentRead> = {
  items: [],
  lastDoc: null,
  hasMore: false,
};

describe('posts api queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sanitizes page size for getPostsByUser', async () => {
    vi.mocked(firestore.getPostsByUser).mockResolvedValueOnce(emptyPostsPage);

    await expect(getPostsByUser('user_1', 999)).resolves.toEqual(emptyPostsPage);

    expect(firestore.getPostsByUser).toHaveBeenCalledWith('user_1', 50, undefined);
  });

  it('sanitizes page size for getPostComments', async () => {
    vi.mocked(firestore.getPostComments).mockResolvedValueOnce(emptyCommentsPage);

    await expect(getPostComments('post_1', 0)).resolves.toEqual(emptyCommentsPage);

    expect(firestore.getPostComments).toHaveBeenCalledWith('post_1', 1, undefined);
  });

  it('deduplicates owner ids for getStoriesForOwners', async () => {
    const stories: StoryRead[] = [];
    vi.mocked(firestore.getStoriesForOwners).mockResolvedValueOnce(stories);

    await expect(getStoriesForOwners(['u1', 'u2', 'u1'])).resolves.toEqual(stories);
    expect(firestore.getStoriesForOwners).toHaveBeenCalledWith(['u1', 'u2']);
  });

  it('loads blocked users with validated uid', async () => {
    vi.mocked(firestore.getBlockedUsers).mockResolvedValueOnce(['user_2']);
    await expect(getBlockedUsers('user_1')).resolves.toEqual(['user_2']);
    expect(firestore.getBlockedUsers).toHaveBeenCalledWith('user_1');
  });

  it('loads friend ids with validated uid', async () => {
    vi.mocked(firestore.getFriendIds).mockResolvedValueOnce(['user_3']);
    await expect(getFriendIds('user_1')).resolves.toEqual(['user_3']);
    expect(firestore.getFriendIds).toHaveBeenCalledWith('user_1');
  });

  it('reads post counters and saved state', async () => {
    vi.mocked(firestore.getPostCommentCount).mockResolvedValueOnce(4);
    vi.mocked(firestore.getPostLikeCount).mockResolvedValueOnce(9);
    vi.mocked(firestore.isPostSaved).mockResolvedValueOnce(true);

    await expect(getPostCommentCount('post_1')).resolves.toBe(4);
    await expect(getPostLikeCount('post_1')).resolves.toBe(9);
    await expect(isPostSaved('post_1', 'user_1')).resolves.toBe(true);
  });

  it('throws validation error for invalid isPostLiked input', async () => {
    const task = isPostLiked('', '');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.isPostLiked).not.toHaveBeenCalled();
  });

  it('throws validation error for empty owner list', async () => {
    await expect(getStoriesForOwners([])).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.getStoriesForOwners).not.toHaveBeenCalled();
  });

  it('maps source errors to AppError', async () => {
    vi.mocked(firestore.getPost).mockRejectedValueOnce({
      code: 'permission-denied',
      message: 'Denied',
    });

    const task = getPost('post_1');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
