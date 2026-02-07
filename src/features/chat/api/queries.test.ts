import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import {
  getBlockedUsers,
  getConversationMember,
  getGroup,
  getGroupMemberCount,
  getGroupPostsWeekCount,
  getUserProfile,
  isUserBlocked,
} from '@/features/chat/api/queries';

vi.mock('@/shared/lib/firestore', () => ({
  getBlockedUsers: vi.fn(),
  getConversationMember: vi.fn(),
  getGroup: vi.fn(),
  getGroupMemberCount: vi.fn(),
  getGroupPostsWeekCount: vi.fn(),
  getUserProfile: vi.fn(),
  isUserBlocked: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

describe('chat api queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns group data with validated group id', async () => {
    vi.mocked(firestore.getGroup).mockResolvedValueOnce({ id: 'group_1', name: 'A' } as never);
    await expect(getGroup('group_1')).resolves.toMatchObject({ id: 'group_1' });
    expect(firestore.getGroup).toHaveBeenCalledWith('group_1');
  });

  it('loads counters and profile', async () => {
    vi.mocked(firestore.getGroupMemberCount).mockResolvedValueOnce(12);
    vi.mocked(firestore.getGroupPostsWeekCount).mockResolvedValueOnce(3);
    vi.mocked(firestore.getUserProfile).mockResolvedValueOnce({ uid: 'user_1' } as never);

    await expect(getGroupMemberCount('group_1')).resolves.toBe(12);
    await expect(getGroupPostsWeekCount('group_1')).resolves.toBe(3);
    await expect(getUserProfile('user_1')).resolves.toMatchObject({ uid: 'user_1' });
  });

  it('loads blocked state and blocked users list', async () => {
    vi.mocked(firestore.isUserBlocked).mockResolvedValueOnce(true);
    vi.mocked(firestore.getBlockedUsers).mockResolvedValueOnce(['user_2']);

    await expect(isUserBlocked('user_1', 'user_2')).resolves.toBe(true);
    await expect(getBlockedUsers('user_1')).resolves.toEqual(['user_2']);
  });

  it('throws validation error for invalid conversation id', async () => {
    const task = getConversationMember('invalid', 'user_1');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.getConversationMember).not.toHaveBeenCalled();
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
