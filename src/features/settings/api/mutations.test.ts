import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import {
  updateNotificationSettings,
  updatePrivacySettings,
} from '@/features/settings/api/mutations';

vi.mock('@/shared/lib/firestore', () => ({
  updateNotificationSettings: vi.fn(),
  updatePrivacySettings: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

const validNotificationSettings = {
  pushEnabled: true,
  emailEnabled: false,
  mentionsOnly: false,
  weeklyDigest: true,
  productUpdates: false,
};

const validPrivacySettings = {
  accountVisibility: 'private' as const,
  allowDirectMessages: true,
  showOnlineStatus: false,
  showLastActive: false,
  allowFriendRequests: true,
  blockedUsers: ['user_2'],
};

describe('settings api mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates and forwards notification settings write', async () => {
    vi.mocked(firestore.updateNotificationSettings).mockResolvedValueOnce();

    await expect(
      updateNotificationSettings('user_1', validNotificationSettings),
    ).resolves.toBeUndefined();
    expect(firestore.updateNotificationSettings).toHaveBeenCalledWith(
      'user_1',
      validNotificationSettings,
    );
  });

  it('retries transient notification write errors', async () => {
    vi.mocked(firestore.updateNotificationSettings)
      .mockRejectedValueOnce({ code: 'network-request-failed', message: 'offline' })
      .mockResolvedValueOnce();

    await expect(
      updateNotificationSettings('user_1', validNotificationSettings),
    ).resolves.toBeUndefined();
    expect(firestore.updateNotificationSettings).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid notification settings payload', async () => {
    const task = updateNotificationSettings('user_1', {
      ...validNotificationSettings,
      pushEnabled: 'yes' as unknown as boolean,
    });
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.updateNotificationSettings).not.toHaveBeenCalled();
  });

  it('validates and forwards privacy settings write', async () => {
    vi.mocked(firestore.updatePrivacySettings).mockResolvedValueOnce();

    await expect(updatePrivacySettings('user_1', validPrivacySettings)).resolves.toBeUndefined();
    expect(firestore.updatePrivacySettings).toHaveBeenCalledWith('user_1', validPrivacySettings);
  });

  it('rejects invalid privacy settings payload', async () => {
    const task = updatePrivacySettings('user_1', {
      ...validPrivacySettings,
      accountVisibility: 'friends' as unknown as 'public' | 'private',
    });
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.updatePrivacySettings).not.toHaveBeenCalled();
  });
});
