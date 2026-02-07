import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ContributionRead,
  FollowRequestWithUser,
  FollowUserRead,
  PaginatedResult,
  PublicUserRead,
} from '@/features/profile/api/types';
import { AppError } from '@/shared/lib/errors';
import {
  getAccountVisibilityServer,
  getContributionsByCategory,
  getFollowList,
  getFollowStatus,
  getIncomingFollowRequests,
  getRecentUsers,
  getUserContributions,
  getUserProfile,
  isUserBlocked,
  searchUsersByDisplayName,
  subscribeToUserProfile,
} from '@/features/profile/api/queries';

vi.mock('@/shared/lib/firestore', () => ({
  getAccountVisibilityServer: vi.fn(),
  getContributionsByCategory: vi.fn(),
  getFollowList: vi.fn(),
  getFollowStatus: vi.fn(),
  getIncomingFollowRequests: vi.fn(),
  getRecentUsers: vi.fn(),
  getUserContributions: vi.fn(),
  getUserProfile: vi.fn(),
  isUserBlocked: vi.fn(),
  searchUsersByDisplayName: vi.fn(),
  subscribeToUserProfile: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

const emptyFollowListPage: PaginatedResult<FollowUserRead> = {
  items: [],
  lastDoc: null,
  hasMore: false,
};

const emptyIncomingPage: PaginatedResult<FollowRequestWithUser> = {
  items: [],
  lastDoc: null,
  hasMore: false,
};

const sampleContribution: ContributionRead = {
  id: 'contrib_1',
  userId: 'user_1',
  type: 'project',
  title: 'Project',
  description: null,
  categoryId: 'science',
  link: null,
  fileUrl: null,
  filePath: null,
  fileName: null,
  fileSize: null,
  fileType: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const sampleUser: PublicUserRead = {
  uid: 'user_2',
  displayName: 'User Two',
  photoURL: null,
  accountVisibility: 'public',
};

describe('profile api queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sanitizes limits for follow list, incoming requests and recent users', async () => {
    vi.mocked(firestore.getFollowList).mockResolvedValueOnce(emptyFollowListPage);
    vi.mocked(firestore.getIncomingFollowRequests).mockResolvedValueOnce(emptyIncomingPage);
    vi.mocked(firestore.getRecentUsers).mockResolvedValueOnce([sampleUser]);

    await expect(getFollowList('user_1', 'followers', 999)).resolves.toEqual(emptyFollowListPage);
    await expect(getIncomingFollowRequests('user_1', 0)).resolves.toEqual(emptyIncomingPage);
    await expect(getRecentUsers(999, 'user_1')).resolves.toEqual([sampleUser]);

    expect(firestore.getFollowList).toHaveBeenCalledWith('user_1', 'followers', 50, undefined);
    expect(firestore.getIncomingFollowRequests).toHaveBeenCalledWith('user_1', 1, undefined);
    expect(firestore.getRecentUsers).toHaveBeenCalledWith(50, 'user_1');
  });

  it('validates follow list kind and ids before querying', async () => {
    const task = getFollowList('user_1', 'friends' as 'followers', 20);
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.getFollowList).not.toHaveBeenCalled();
  });

  it('validates and trims search input', async () => {
    vi.mocked(firestore.searchUsersByDisplayName).mockResolvedValueOnce([sampleUser]);

    await expect(searchUsersByDisplayName('  user two  ', 999)).resolves.toEqual([sampleUser]);
    expect(firestore.searchUsersByDisplayName).toHaveBeenCalledWith('user two', 50);

    await expect(searchUsersByDisplayName('   ')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('loads contribution and profile reads with validated inputs', async () => {
    vi.mocked(firestore.getUserContributions).mockResolvedValueOnce([sampleContribution]);
    vi.mocked(firestore.getContributionsByCategory).mockResolvedValueOnce([sampleContribution]);
    vi.mocked(firestore.getUserProfile).mockResolvedValueOnce({ uid: 'user_1' } as never);

    await expect(getUserContributions('user_1')).resolves.toEqual([sampleContribution]);
    await expect(getContributionsByCategory('science', 16)).resolves.toEqual([sampleContribution]);
    await expect(getUserProfile('user_1')).resolves.toMatchObject({ uid: 'user_1' });
  });

  it('loads follow status, blocked state and account visibility', async () => {
    vi.mocked(firestore.getFollowStatus).mockResolvedValueOnce({
      status: 'following',
      isMutual: true,
    });
    vi.mocked(firestore.isUserBlocked).mockResolvedValueOnce(true);
    vi.mocked(firestore.getAccountVisibilityServer).mockResolvedValueOnce('private');

    await expect(getFollowStatus('user_1', 'user_2', 'public')).resolves.toMatchObject({
      status: 'following',
      isMutual: true,
    });
    await expect(isUserBlocked('user_1', 'user_2')).resolves.toBe(true);
    await expect(getAccountVisibilityServer('user_2')).resolves.toBe('private');
  });

  it('handles optional visibility and excludeUid when omitted', async () => {
    vi.mocked(firestore.getFollowStatus).mockResolvedValueOnce({
      status: 'none',
      isMutual: false,
    });
    vi.mocked(firestore.getRecentUsers).mockResolvedValueOnce([sampleUser]);

    await expect(getFollowStatus('user_1', 'user_2')).resolves.toMatchObject({
      status: 'none',
      isMutual: false,
    });
    await expect(getRecentUsers(8)).resolves.toEqual([sampleUser]);

    expect(firestore.getFollowStatus).toHaveBeenCalledWith('user_1', 'user_2', undefined);
    expect(firestore.getRecentUsers).toHaveBeenCalledWith(8, undefined);
  });

  it('wraps profile subscription and keeps unsubscribe idempotent', () => {
    const rawUnsubscribe = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();

    vi.mocked(firestore.subscribeToUserProfile).mockImplementationOnce((_uid, callback) => {
      callback?.({ uid: 'user_1' } as never);
      return rawUnsubscribe;
    });

    const unsubscribe = subscribeToUserProfile('user_1', onData, onError);
    expect(onData).toHaveBeenCalledTimes(1);

    unsubscribe();
    unsubscribe();
    expect(rawUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('supports subscription without onError callback', () => {
    const rawUnsubscribe = vi.fn();
    const onData = vi.fn();

    vi.mocked(firestore.subscribeToUserProfile).mockImplementationOnce((_uid, callback) => {
      callback?.({ uid: 'user_3' } as never);
      return rawUnsubscribe;
    });

    const unsubscribe = subscribeToUserProfile('user_3', onData);
    expect(onData).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(rawUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('maps source permission errors to AppError', async () => {
    vi.mocked(firestore.getUserProfile).mockRejectedValueOnce({
      code: 'permission-denied',
      message: 'Denied',
    });

    const task = getUserProfile('user_1');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
