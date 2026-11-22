import { deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { toAppError } from '@/shared/lib/errors';
import { db } from '@/shared/lib/firebase';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { COLLECTIONS } from '@/shared/lib/firestore/firestoreContract';
import { validate } from '@/shared/lib/validators';
import { notificationIdSchema } from '@/features/notifications/api/types';

export const NOTIFICATIONS_UPDATED_EVENT = 'vinctus:notifications-updated';

const WRITE_TIMEOUT_MS = 7000;
const BATCH_CHUNK_SIZE = 450;
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

export const notifyNotificationsUpdated = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
};

export const markNotificationRead = async (
  notificationId: string,
  read: boolean = true,
): Promise<void> => {
  const safeId = validate(notificationIdSchema, notificationId, { field: 'notificationId' });
  await runWrite('notifications.markNotificationRead', async () => {
    trackFirestoreWrite('firestore.updateDoc');
    await updateDoc(doc(db, COLLECTIONS.notifications, safeId), { read });
  });
};

export const markAllNotificationsRead = async (notificationIds: string[]): Promise<void> => {
  const uniqueIds = Array.from(
    new Set(
      notificationIds
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
        .map((id) => validate(notificationIdSchema, id, { field: 'notificationId' })),
    ),
  );
  if (uniqueIds.length === 0) return;

  await runWrite('notifications.markAllNotificationsRead', async () => {
    for (let i = 0; i < uniqueIds.length; i += BATCH_CHUNK_SIZE) {
      const chunk = uniqueIds.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((id) => {
        trackFirestoreWrite('firestore.updateDoc');
        batch.update(doc(db, COLLECTIONS.notifications, id), { read: true });
      });
      await batch.commit();
    }
  });
};

export const deleteNotification = async (notificationId: string): Promise<void> => {
  const safeId = validate(notificationIdSchema, notificationId, { field: 'notificationId' });
  await runWrite('notifications.deleteNotification', async () => {
    trackFirestoreWrite('firestore.deleteDoc');
    await deleteDoc(doc(db, COLLECTIONS.notifications, safeId));
  });
};
