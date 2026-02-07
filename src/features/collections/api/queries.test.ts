import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import {
  getCollectionItems,
  getRecentCollectionItems,
  getUserCollections,
} from '@/features/collections/api/queries';

vi.mock('@/shared/lib/firestore', () => ({
  getCollectionItems: vi.fn(),
  getRecentCollectionItems: vi.fn(),
  getUserCollections: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

describe('collections api queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sanitizes limits before querying collections', async () => {
    vi.mocked(firestore.getUserCollections).mockResolvedValueOnce([]);
    vi.mocked(firestore.getRecentCollectionItems).mockResolvedValueOnce([]);

    await expect(getUserCollections('user_1', 999)).resolves.toEqual([]);
    await expect(getRecentCollectionItems('user_1', 0)).resolves.toEqual([]);

    expect(firestore.getUserCollections).toHaveBeenCalledWith('user_1', 50);
    expect(firestore.getRecentCollectionItems).toHaveBeenCalledWith('user_1', 1);
  });

  it('validates ids before loading collection items', async () => {
    const task = getCollectionItems('', 'collection_1', 20);
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.getCollectionItems).not.toHaveBeenCalled();
  });

  it('forwards validated collection query', async () => {
    vi.mocked(firestore.getCollectionItems).mockResolvedValueOnce([]);

    await expect(getCollectionItems('user_1', 'collection_1', 20)).resolves.toEqual([]);
    expect(firestore.getCollectionItems).toHaveBeenCalledWith('user_1', 'collection_1', 20);
  });

  it('maps source errors to AppError', async () => {
    vi.mocked(firestore.getUserCollections).mockRejectedValueOnce({
      code: 'permission-denied',
      message: 'Denied',
    });

    const task = getUserCollections('user_1');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
