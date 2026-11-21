import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';
import { getUserActivity as getUserActivityRaw } from '@/shared/lib/firestore';
import { COLLECTIONS, SUBCOLLECTIONS } from '@/shared/lib/firestore/firestoreContract';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { safeLimit, validate } from '@/shared/lib/validators';
import {
  activityPageLimitSchema,
  uidSchema,
  type ActivityRead,
  type PaginatedResult,
} from '@/features/notifications/api/types';

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

export const getUserActivity = async (
  uid: string,
  pageSize: number = 30,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResult<ActivityRead>> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safePageSize = validate(activityPageLimitSchema, safeLimit(pageSize, 30), {
    field: 'pageSize',
  });
  return runRead('notifications.getUserActivity', () =>
    getUserActivityRaw(safeUid, safePageSize, lastDoc),
  );
};

/**
 * Bounded, one-shot badge count across unread activity and pending requests,
 * excluding blocked senders and using only existing Firestore indexes.
 */
export const getUnreadNotificationBadgeCount = async (uid: string): Promise<number> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runRead('notifications.getUnreadNotificationBadgeCount', async () => {
    const [blockedRes, activityRes, followRes, groupRes, collabRes] = await Promise.allSettled([
      getDocs(collection(db, COLLECTIONS.users, safeUid, SUBCOLLECTIONS.blockedUsers)),
      getDocs(
        query(
          collection(db, COLLECTIONS.notifications),
          where('toUid', '==', safeUid),
          orderBy('createdAt', 'desc'),
          limit(20),
        ),
      ),
      getDocs(
        query(
          collection(db, COLLECTIONS.followRequests),
          where('toUid', '==', safeUid),
          where('status', '==', 'pending'),
          orderBy('createdAt', 'desc'),
          limit(10),
        ),
      ),
      getDocs(
        query(
          collection(db, COLLECTIONS.groupRequests),
          where('toUid', '==', safeUid),
          where('status', '==', 'pending'),
          orderBy('createdAt', 'desc'),
          limit(10),
        ),
      ),
      getDocs(
        query(
          collection(db, COLLECTIONS.collaborationRequests),
          where('toUid', '==', safeUid),
          where('status', '==', 'pending'),
          orderBy('createdAt', 'desc'),
          limit(10),
        ),
      ),
    ]);

    const blockedSet = new Set<string>();
    if (blockedRes.status === 'fulfilled') {
      trackFirestoreRead('firestore.getDocs', Math.max(1, blockedRes.value.size));
      blockedRes.value.docs.forEach((docSnap) => blockedSet.add(docSnap.id));
    }

    let total = 0;

    if (activityRes.status === 'fulfilled') {
      trackFirestoreRead('firestore.getDocs', Math.max(1, activityRes.value.size));
      activityRes.value.docs.forEach((docSnap) => {
        const data = docSnap.data() as { read?: unknown; fromUid?: unknown };
        const fromUid = typeof data.fromUid === 'string' ? data.fromUid : '';
        if (data.read !== true && (!fromUid || !blockedSet.has(fromUid))) {
          total += 1;
        }
      });
    }

    for (const reqResult of [followRes, groupRes, collabRes]) {
      if (reqResult.status !== 'fulfilled') continue;
      trackFirestoreRead('firestore.getDocs', Math.max(1, reqResult.value.size));
      reqResult.value.docs.forEach((docSnap) => {
        const data = docSnap.data() as { fromUid?: unknown };
        const fromUid = typeof data.fromUid === 'string' ? data.fromUid : '';
        if (!fromUid || !blockedSet.has(fromUid)) {
          total += 1;
        }
      });
    }

    return total;
  });
};
