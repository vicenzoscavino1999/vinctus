import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyModerationAction,
  updateModerationQueueStatus,
} from '@/features/moderation/api/mutations';

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

vi.mock('@/shared/lib/firebase', () => ({
  functions: { app: 'test-app' },
}));

vi.mock('@/shared/lib/firestore', () => ({
  updateModerationQueueItem: vi.fn(),
}));

const firebaseFunctions = await import('firebase/functions');
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

  it('applies an enforcement action through the moderation callable', async () => {
    const callable = vi.fn().mockResolvedValueOnce({
      data: { status: 'resolved', reviewAction: 'user_suspended' },
    });
    vi.mocked(firebaseFunctions.httpsCallable).mockReturnValueOnce(callable as never);

    await expect(
      applyModerationAction({ itemId: 'item_1', action: 'suspend_user', reviewNote: ' Acoso ' }),
    ).resolves.toEqual({ status: 'resolved', reviewAction: 'user_suspended' });

    expect(firebaseFunctions.httpsCallable).toHaveBeenCalledWith(
      { app: 'test-app' },
      'moderationTakeAction',
    );
    expect(callable).toHaveBeenCalledWith({
      itemId: 'item_1',
      action: 'suspend_user',
      note: 'Acoso',
    });
  });

  it('rejects unknown enforcement actions before calling the server', async () => {
    await expect(
      applyModerationAction({ itemId: 'item_1', action: 'ban_forever' as never }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(firebaseFunctions.httpsCallable).not.toHaveBeenCalled();
  });

  it('wraps callable failures with the server message', async () => {
    const callable = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error('Solo administradores de moderacion.'), {
        code: 'functions/permission-denied',
      }),
    );
    vi.mocked(firebaseFunctions.httpsCallable).mockReturnValueOnce(callable as never);

    await expect(
      applyModerationAction({ itemId: 'item_1', action: 'remove_content' }),
    ).rejects.toMatchObject({ message: 'Solo administradores de moderacion.' });
  });
});
