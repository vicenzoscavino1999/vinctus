import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_PRIVACY_SETTINGS,
  getUserSettings,
} from '@/features/settings/api/queries';

vi.mock('@/shared/lib/firestore', () => ({
  DEFAULT_NOTIFICATION_SETTINGS: {
    pushEnabled: true,
    emailEnabled: false,
    mentionsOnly: false,
    weeklyDigest: true,
    productUpdates: false,
  },
  DEFAULT_PRIVACY_SETTINGS: {
    accountVisibility: 'public',
    allowDirectMessages: true,
    showOnlineStatus: true,
    showLastActive: true,
    allowFriendRequests: true,
    blockedUsers: [],
  },
  getUserSettings: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

describe('settings api queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes validated default settings constants', () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS).toMatchObject({
      pushEnabled: true,
      emailEnabled: false,
      mentionsOnly: false,
      weeklyDigest: true,
      productUpdates: false,
    });

    expect(DEFAULT_PRIVACY_SETTINGS).toMatchObject({
      accountVisibility: 'public',
      allowDirectMessages: true,
      showOnlineStatus: true,
      showLastActive: true,
      allowFriendRequests: true,
      blockedUsers: [],
    });
  });

  it('loads user settings with validated uid', async () => {
    vi.mocked(firestore.getUserSettings).mockResolvedValueOnce({
      notifications: DEFAULT_NOTIFICATION_SETTINGS,
      privacy: DEFAULT_PRIVACY_SETTINGS,
    });

    await expect(getUserSettings('user_1')).resolves.toMatchObject({
      notifications: DEFAULT_NOTIFICATION_SETTINGS,
      privacy: DEFAULT_PRIVACY_SETTINGS,
    });
    expect(firestore.getUserSettings).toHaveBeenCalledWith('user_1');
  });

  it('rejects invalid uid before querying', async () => {
    const task = getUserSettings('');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.getUserSettings).not.toHaveBeenCalled();
  });

  it('maps source errors to AppError', async () => {
    vi.mocked(firestore.getUserSettings).mockRejectedValueOnce({
      code: 'permission-denied',
      message: 'Denied',
    });

    const task = getUserSettings('user_1');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
