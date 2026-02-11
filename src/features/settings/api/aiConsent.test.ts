import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import { getServerAIConsent, updateServerAIConsent } from '@/features/settings/api/aiConsent';

vi.mock('@/shared/lib/firestore', () => ({
  getServerAIConsent: vi.fn(),
  setServerAIConsent: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

describe('settings api aiConsent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads server consent with validated uid', async () => {
    vi.mocked(firestore.getServerAIConsent).mockResolvedValueOnce({
      granted: true,
      recorded: true,
      source: 'settings',
      updatedAt: new Date('2026-02-11T12:00:00.000Z'),
    });

    await expect(getServerAIConsent('user_1')).resolves.toMatchObject({
      granted: true,
      recorded: true,
      source: 'settings',
    });
    expect(firestore.getServerAIConsent).toHaveBeenCalledWith('user_1');
  });

  it('rejects invalid uid before reading server consent', async () => {
    const task = getServerAIConsent('');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.getServerAIConsent).not.toHaveBeenCalled();
  });

  it('persists consent with default source', async () => {
    vi.mocked(firestore.setServerAIConsent).mockResolvedValueOnce();

    await expect(updateServerAIConsent('user_1', true)).resolves.toBeUndefined();
    expect(firestore.setServerAIConsent).toHaveBeenCalledWith('user_1', {
      granted: true,
      source: 'settings',
    });
  });

  it('persists consent with explicit source', async () => {
    vi.mocked(firestore.setServerAIConsent).mockResolvedValueOnce();

    await expect(updateServerAIConsent('user_1', false, 'ai_chat')).resolves.toBeUndefined();
    expect(firestore.setServerAIConsent).toHaveBeenCalledWith('user_1', {
      granted: false,
      source: 'ai_chat',
    });
  });

  it('maps source errors to AppError', async () => {
    vi.mocked(firestore.setServerAIConsent).mockRejectedValueOnce({
      code: 'permission-denied',
      message: 'Denied',
    });

    const task = updateServerAIConsent('user_1', true);
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
