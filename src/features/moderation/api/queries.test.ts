import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getModerationQueue, isCurrentUserAppAdmin } from '@/features/moderation/api/queries';

vi.mock('@/shared/lib/firestore', () => ({
  getModerationQueue: vi.fn(),
  isAppAdmin: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

describe('moderation api queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads app admin access for valid uid', async () => {
    vi.mocked(firestore.isAppAdmin).mockResolvedValueOnce(true);
    await expect(isCurrentUserAppAdmin('user_1')).resolves.toBe(true);
    expect(firestore.isAppAdmin).toHaveBeenCalledWith('user_1');
  });

  it('rejects invalid uid for app admin access', async () => {
    await expect(isCurrentUserAppAdmin('')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.isAppAdmin).not.toHaveBeenCalled();
  });

  it('loads moderation queue with sanitized limit', async () => {
    vi.mocked(firestore.getModerationQueue).mockResolvedValueOnce({
      items: [],
      lastDoc: null,
      hasMore: false,
    });

    await expect(getModerationQueue(20)).resolves.toMatchObject({
      items: [],
      hasMore: false,
    });
    expect(firestore.getModerationQueue).toHaveBeenCalledWith(20, undefined);
  });
});
