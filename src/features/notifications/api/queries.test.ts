import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityRead, PaginatedResult } from '@/features/notifications/api/types';
import { AppError } from '@/shared/lib/errors';
import { getUserActivity } from '@/features/notifications/api/queries';

vi.mock('@/shared/lib/firestore', () => ({
  getUserActivity: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

const emptyActivityPage: PaginatedResult<ActivityRead> = {
  items: [],
  lastDoc: null,
  hasMore: false,
};

describe('notifications api queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sanitizes page size when reading activity', async () => {
    vi.mocked(firestore.getUserActivity).mockResolvedValueOnce(emptyActivityPage);

    await expect(getUserActivity('user_1', 999)).resolves.toEqual(emptyActivityPage);
    expect(firestore.getUserActivity).toHaveBeenCalledWith('user_1', 50, undefined);
  });

  it('rejects invalid uid before querying', async () => {
    const task = getUserActivity('', 20);
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.getUserActivity).not.toHaveBeenCalled();
  });

  it('maps source permission errors to AppError', async () => {
    vi.mocked(firestore.getUserActivity).mockRejectedValueOnce({
      code: 'permission-denied',
      message: 'Denied',
    });

    const task = getUserActivity('user_1', 20);
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
