import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import {
  getCollaborations,
  getPendingCollaborationRequests,
  getSentCollaborationRequestIds,
} from '@/features/collaborations/api/queries';

vi.mock('@/shared/lib/firestore', () => ({
  getCollaborations: vi.fn(),
  getPendingCollaborationRequests: vi.fn(),
  getSentCollaborationRequestIds: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

describe('collaborations api queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sanitizes limits before loading collaborations', async () => {
    vi.mocked(firestore.getCollaborations).mockResolvedValueOnce([]);
    vi.mocked(firestore.getPendingCollaborationRequests).mockResolvedValueOnce([]);
    vi.mocked(firestore.getSentCollaborationRequestIds).mockResolvedValueOnce(['collab_1']);

    await expect(getCollaborations(999)).resolves.toEqual([]);
    await expect(getPendingCollaborationRequests('user_1', 0)).resolves.toEqual([]);
    await expect(getSentCollaborationRequestIds('user_1', 999)).resolves.toEqual(['collab_1']);

    expect(firestore.getCollaborations).toHaveBeenCalledWith(50);
    expect(firestore.getPendingCollaborationRequests).toHaveBeenCalledWith('user_1', 1);
    expect(firestore.getSentCollaborationRequestIds).toHaveBeenCalledWith('user_1', 50);
  });

  it('validates uid before loading pending or sent requests', async () => {
    const task = getPendingCollaborationRequests('');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.getPendingCollaborationRequests).not.toHaveBeenCalled();

    const sentTask = getSentCollaborationRequestIds('');
    await expect(sentTask).rejects.toBeInstanceOf(AppError);
    await expect(sentTask).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.getSentCollaborationRequestIds).not.toHaveBeenCalled();
  });

  it('maps source errors to AppError', async () => {
    vi.mocked(firestore.getCollaborations).mockRejectedValueOnce({
      code: 'permission-denied',
      message: 'Denied',
    });

    const task = getCollaborations();
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
