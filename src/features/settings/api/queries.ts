import {
  DEFAULT_NOTIFICATION_SETTINGS as DEFAULT_NOTIFICATION_SETTINGS_RAW,
  DEFAULT_PRIVACY_SETTINGS as DEFAULT_PRIVACY_SETTINGS_RAW,
  getUserSettings as getUserSettingsRaw,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate } from '@/shared/lib/validators';
import {
  notificationSettingsSchema,
  privacySettingsSchema,
  uidSchema,
  userSettingsReadSchema,
  type NotificationSettings,
  type PrivacySettings,
  type UserSettingsRead,
} from '@/features/settings/api/types';

const READ_TIMEOUT_MS = 5000;
const READ_RETRYABLE_CODES = [
  'TIMEOUT',
  'NETWORK',
  'deadline-exceeded',
  'unavailable',
  'aborted',
] as const;

const runRead = async <T>(operation: string, fn: () => Promise<T>): Promise<T> => {
  try {
    return await withRetry(() => withTimeout(fn(), READ_TIMEOUT_MS, { operation }), {
      retries: 2,
      backoffMs: 150,
      retryableCodes: READ_RETRYABLE_CODES,
    });
  } catch (error) {
    throw toAppError(error, { operation });
  }
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = validate(
  notificationSettingsSchema,
  DEFAULT_NOTIFICATION_SETTINGS_RAW,
  { field: 'DEFAULT_NOTIFICATION_SETTINGS' },
);

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = validate(
  privacySettingsSchema,
  DEFAULT_PRIVACY_SETTINGS_RAW,
  { field: 'DEFAULT_PRIVACY_SETTINGS' },
);

export const getUserSettings = async (uid: string): Promise<UserSettingsRead> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runRead('settings.getUserSettings', async () => {
    const settings = await getUserSettingsRaw(safeUid);
    return validate(userSettingsReadSchema, settings, { field: 'settings' });
  });
};
