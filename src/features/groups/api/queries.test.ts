import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GroupJoinRequestRead,
  GroupMemberRead,
  PaginatedResult,
  PostRead,
} from '@/features/groups/api/types';
import { AppError } from '@/shared/lib/errors';
import {
  getFollowing,
  getGroup,
  getGroupJoinStatus,
  getGroupMemberCount,
  getGroupMembers,
  getGroupMembersPage,
  getGroupPostsWeekCount,
  getGroups,
  getGroupsByCategory,
  getPendingGroupJoinRequests,
  getPostsByGroup,
  getUserProfile,
} from '@/features/groups/api/queries';

vi.mock('@/shared/lib/firestore', () => ({
  getFollowing: vi.fn(),
  getGroup: vi.fn(),
  getGroupJoinStatus: vi.fn(),
  getGroupMemberCount: vi.fn(),
  getGroupMembers: vi.fn(),
  getGroupMembersPage: vi.fn(),
  getGroupPostsWeekCount: vi.fn(),
  getGroups: vi.fn(),
  getGroupsByCategory: vi.fn(),
  getPendingGroupJoinRequests: vi.fn(),
  getPostsByGroup: vi.fn(),
  getUserProfile: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

const emptyMembersPage: PaginatedResult<GroupMemberRead> = {
  items: [],
  lastDoc: null,
  hasMore: false,
};

const emptyPostsPage: PaginatedResult<PostRead> = {
  items: [],
  lastDoc: null,
  hasMore: false,
};

const emptyGroupRequests: GroupJoinRequestRead[] = [];

describe('groups api queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sanitizes page limits for members, posts and requests', async () => {
    vi.mocked(firestore.getGroupMembers).mockResolvedValueOnce([]);
    vi.mocked(firestore.getGroupMembersPage).mockResolvedValueOnce(emptyMembersPage);
    vi.mocked(firestore.getPostsByGroup).mockResolvedValueOnce(emptyPostsPage);
    vi.mocked(firestore.getPendingGroupJoinRequests).mockResolvedValueOnce(emptyGroupRequests);

    await expect(getGroupMembers('group_1', 999)).resolves.toEqual([]);
    await expect(getGroupMembersPage('group_1', 0)).resolves.toEqual(emptyMembersPage);
    await expect(getPostsByGroup('group_1', 500)).resolves.toEqual(emptyPostsPage);
    await expect(getPendingGroupJoinRequests('owner_1', 0)).resolves.toEqual(emptyGroupRequests);

    expect(firestore.getGroupMembers).toHaveBeenCalledWith('group_1', 50);
    expect(firestore.getGroupMembersPage).toHaveBeenCalledWith('group_1', 1, undefined);
    expect(firestore.getPostsByGroup).toHaveBeenCalledWith('group_1', 50, undefined);
    expect(firestore.getPendingGroupJoinRequests).toHaveBeenCalledWith('owner_1', 1);
  });

  it('validates required category input', async () => {
    const task = getGroupsByCategory('');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.getGroupsByCategory).not.toHaveBeenCalled();
  });

  it('loads core group reads', async () => {
    vi.mocked(firestore.getGroups).mockResolvedValueOnce([{ id: 'group_1', name: 'A' }] as never);
    vi.mocked(firestore.getGroup).mockResolvedValueOnce({ id: 'group_1', name: 'A' } as never);
    vi.mocked(firestore.getGroupJoinStatus).mockResolvedValueOnce('member');
    vi.mocked(firestore.getGroupMemberCount).mockResolvedValueOnce(12);
    vi.mocked(firestore.getGroupPostsWeekCount).mockResolvedValueOnce(4);

    await expect(getGroups()).resolves.toHaveLength(1);
    await expect(getGroup('group_1')).resolves.toMatchObject({ id: 'group_1' });
    await expect(getGroupJoinStatus('group_1', 'user_1')).resolves.toBe('member');
    await expect(getGroupMemberCount('group_1')).resolves.toBe(12);
    await expect(getGroupPostsWeekCount('group_1')).resolves.toBe(4);
  });

  it('loads following and profile by uid', async () => {
    vi.mocked(firestore.getFollowing).mockResolvedValueOnce([{ uid: 'user_2' }] as never);
    vi.mocked(firestore.getUserProfile).mockResolvedValueOnce({ uid: 'user_1' } as never);

    await expect(getFollowing('user_1')).resolves.toMatchObject([{ uid: 'user_2' }]);
    await expect(getUserProfile('user_1')).resolves.toMatchObject({ uid: 'user_1' });
    expect(firestore.getFollowing).toHaveBeenCalledWith('user_1');
    expect(firestore.getUserProfile).toHaveBeenCalledWith('user_1');
  });

  it('rejects invalid ids before querying firestore', async () => {
    await expect(getGroupJoinStatus('', 'user_1')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(getPendingGroupJoinRequests('', 20)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(firestore.getGroupJoinStatus).not.toHaveBeenCalled();
    expect(firestore.getPendingGroupJoinRequests).not.toHaveBeenCalled();
  });

  it('maps source permission errors to AppError', async () => {
    vi.mocked(firestore.getGroup).mockRejectedValueOnce({
      code: 'permission-denied',
      message: 'Denied',
    });

    const task = getGroup('group_1');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
