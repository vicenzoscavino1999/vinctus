import { doc, getDoc } from 'firebase/firestore';

import { DEFAULT_NOTIFICATION_SETTINGS, DEFAULT_PRIVACY_SETTINGS } from '@/shared/lib/firestore';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import { toAppError } from '@/shared/lib/errors';
import { db } from '@/shared/lib/firebase';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { idSchema, validate } from '@/shared/lib/validators';

import type { NotificationSettings, PrivacySettings, UserSettingsRead } from './types';

const READ_TIMEOUT_MS = 5000;

const normalizeNotificationSettings = (value: unknown): NotificationSettings => {
  const data = (value ?? {}) as Partial<NotificationSettings>;
  return {
    pushEnabled:
      typeof data.pushEnabled === 'boolean'
        ? data.pushEnabled
        : DEFAULT_NOTIFICATION_SETTINGS.pushEnabled,
    emailEnabled:
      typeof data.emailEnabled === 'boolean'
        ? data.emailEnabled
        : DEFAULT_NOTIFICATION_SETTINGS.emailEnabled,
    mentionsOnly:
      typeof data.mentionsOnly === 'boolean'
        ? data.mentionsOnly
        : DEFAULT_NOTIFICATION_SETTINGS.mentionsOnly,
    weeklyDigest:
      typeof data.weeklyDigest === 'boolean'
        ? data.weeklyDigest
        : DEFAULT_NOTIFICATION_SETTINGS.weeklyDigest,
    productUpdates:
      typeof data.productUpdates === 'boolean'
        ? data.productUpdates
        : DEFAULT_NOTIFICATION_SETTINGS.productUpdates,
  };
};

const normalizePrivacySettings = (value: unknown): PrivacySettings => {
  const data = (value ?? {}) as Partial<PrivacySettings>;
  const visibility =
    data.accountVisibility === 'private' || data.accountVisibility === 'public'
      ? data.accountVisibility
      : DEFAULT_PRIVACY_SETTINGS.accountVisibility;

  return {
    accountVisibility: visibility,
    allowDirectMessages:
      typeof data.allowDirectMessages === 'boolean'
        ? data.allowDirectMessages
        : DEFAULT_PRIVACY_SETTINGS.allowDirectMessages,
    showOnlineStatus:
      typeof data.showOnlineStatus === 'boolean'
        ? data.showOnlineStatus
        : DEFAULT_PRIVACY_SETTINGS.showOnlineStatus,
    showLastActive:
      typeof data.showLastActive === 'boolean'
        ? data.showLastActive
        : DEFAULT_PRIVACY_SETTINGS.showLastActive,
    allowFriendRequests:
      typeof data.allowFriendRequests === 'boolean'
        ? data.allowFriendRequests
        : DEFAULT_PRIVACY_SETTINGS.allowFriendRequests,
    blockedUsers: Array.isArray(data.blockedUsers)
      ? data.blockedUsers.filter((uid) => typeof uid === 'string')
      : [],
  };
};

export const getUserSettings = async (uid: string): Promise<UserSettingsRead> => {
  const safeUid = validate(idSchema, uid, { context: { uid } });

  try {
    const snap = await withTimeout(
      withRetry(() => getDoc(doc(db, 'users', safeUid)), {
        context: { op: 'settings.getUserSettings', uid: safeUid },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'settings.getUserSettings', uid: safeUid } },
    );

    trackFirestoreRead('settings.getUserSettings');

    if (!snap.exists()) {
      return {
        notifications: DEFAULT_NOTIFICATION_SETTINGS,
        privacy: DEFAULT_PRIVACY_SETTINGS,
      };
    }

    const data = snap.data() as Record<string, unknown>;
    const rawSettings = data.settings;
    const settings: Record<string, unknown> =
      typeof rawSettings === 'object' && rawSettings !== null
        ? (rawSettings as Record<string, unknown>)
        : {};

    return {
      notifications: normalizeNotificationSettings(settings.notifications),
      privacy: normalizePrivacySettings(settings.privacy),
    };
  } catch (error) {
    throw toAppError(error, { context: { op: 'settings.getUserSettings', uid: safeUid } });
  }
};

export { DEFAULT_NOTIFICATION_SETTINGS, DEFAULT_PRIVACY_SETTINGS };
