import {
  updateNotificationSettings as updateNotificationSettingsRaw,
  updatePrivacySettings as updatePrivacySettingsRaw,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate } from '@/shared/lib/validators';
import {
  notificationSettingsSchema,
  privacySettingsSchema,
  uidSchema,
  type NotificationSettings,
  type PrivacySettings,
} from '@/features/settings/api/types';

const WRITE_TIMEOUT_MS = 7000;
const WRITE_RETRYABLE_CODES = [
  'TIMEOUT',
  'NETWORK',
  'deadline-exceeded',
  'unavailable',
  'aborted',
  'resource-exhausted',
] as const;

const runWrite = async <T>(operation: string, fn: () => Promise<T>): Promise<T> => {
  try {
    return await withRetry(() => withTimeout(fn(), WRITE_TIMEOUT_MS, { operation }), {
      retries: 1,
      backoffMs: 200,
      retryableCodes: WRITE_RETRYABLE_CODES,
    });
  } catch (error) {
    throw toAppError(error, { operation });
  }
};

export const updateNotificationSettings = async (
  uid: string,
  settings: NotificationSettings,
): Promise<void> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeSettings = validate(notificationSettingsSchema, settings, { field: 'settings' });
  return runWrite('settings.updateNotificationSettings', () =>
    updateNotificationSettingsRaw(safeUid, safeSettings),
  );
};

export const updatePrivacySettings = async (
  uid: string,
  settings: PrivacySettings,
): Promise<void> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeSettings = validate(privacySettingsSchema, settings, { field: 'settings' });
  return runWrite('settings.updatePrivacySettings', () =>
    updatePrivacySettingsRaw(safeUid, safeSettings),
  );
};
