import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateModerationQueueStatus } from '@/features/moderation/api/mutations';

vi.mock('@/shared/lib/firestore', () => ({
  updateModerationQueueItem: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

describe('moderation api mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates moderation queue item with validated payload', async () => {
    vi.mocked(firestore.updateModerationQueueItem).mockResolvedValueOnce();

    await expect(
      updateModerationQueueStatus({
        itemId: 'item_1',
        status: 'resolved',
        reviewAction: 'removed_content',
        reviewNote: 'Contenido removido tras revision.',
        reviewedBy: 'admin_1',
      }),
    ).resolves.toBeUndefined();

    expect(firestore.updateModerationQueueItem).toHaveBeenCalledWith('item_1', {
      status: 'resolved',
      reviewAction: 'removed_content',
      reviewNote: 'Contenido removido tras revision.',
      reviewedBy: 'admin_1',
    });
  });

  it('rejects invalid moderation update payload', async () => {
    await expect(
      updateModerationQueueStatus({
        itemId: '',
        status: 'resolved',
        reviewAction: 'removed_content',
        reviewedBy: 'admin_1',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(firestore.updateModerationQueueItem).not.toHaveBeenCalled();
  });
});
