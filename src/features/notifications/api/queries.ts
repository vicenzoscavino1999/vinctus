import type { DocumentSnapshot } from 'firebase/firestore';
import { getUserActivity as getUserActivityRaw } from '@/shared/lib/firestore';
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
