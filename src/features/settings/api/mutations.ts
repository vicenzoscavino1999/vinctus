import { doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';

import { trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { toAppError } from '@/shared/lib/errors';
import { db } from '@/shared/lib/firebase';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { idSchema, validate, z } from '@/shared/lib/validators';

import type { NotificationSettings, PrivacySettings } from './types';

const WRITE_TIMEOUT_MS = 5000;

const notificationSettingsSchema = z.object({
  pushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  mentionsOnly: z.boolean(),
  weeklyDigest: z.boolean(),
  productUpdates: z.boolean(),
});

const privacySettingsSchema = z.object({
  accountVisibility: z.enum(['public', 'private']),
  allowDirectMessages: z.boolean(),
  showOnlineStatus: z.boolean(),
  showLastActive: z.boolean(),
  allowFriendRequests: z.boolean(),
  blockedUsers: z.array(idSchema).max(500),
});

export const updateNotificationSettings = async (
  uid: string,
  settings: NotificationSettings,
): Promise<void> => {
  const safeUid = validate(idSchema, uid, { context: { uid } });
  const safeSettings = validate(notificationSettingsSchema, settings, {
    context: { uid: safeUid },
  });

  try {
    await withTimeout(
      withRetry(
        () =>
          updateDoc(doc(db, 'users', safeUid), {
            'settings.notifications': safeSettings,
          }),
        { context: { op: 'settings.updateNotificationSettings', uid: safeUid } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'settings.updateNotificationSettings', uid: safeUid } },
    );

    trackFirestoreWrite('settings.updateNotificationSettings');
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'settings.updateNotificationSettings', uid: safeUid },
    });
  }
};

export const updatePrivacySettings = async (
  uid: string,
  settings: PrivacySettings,
): Promise<void> => {
  const safeUid = validate(idSchema, uid, { context: { uid } });
  const safeSettings = validate(privacySettingsSchema, settings, { context: { uid: safeUid } });

  try {
    await withTimeout(
      withRetry(
        async () => {
          const batch = writeBatch(db);
          batch.update(doc(db, 'users', safeUid), {
            'settings.privacy': safeSettings,
          });
          batch.set(
            doc(db, 'users_public', safeUid),
            {
              accountVisibility: safeSettings.accountVisibility,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
          await batch.commit();
        },
        { context: { op: 'settings.updatePrivacySettings', uid: safeUid } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'settings.updatePrivacySettings', uid: safeUid } },
    );

    trackFirestoreWrite('settings.updatePrivacySettings', 2);
  } catch (error) {
    throw toAppError(error, { context: { op: 'settings.updatePrivacySettings', uid: safeUid } });
  }
};
