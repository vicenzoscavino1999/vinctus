import type { DocumentSnapshot } from 'firebase/firestore';
import {
  getModerationQueue as getModerationQueueRaw,
  isAppAdmin as isAppAdminRaw,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { safeLimit, validate } from '@/shared/lib/validators';
import {
  moderationQueueLimitSchema,
  uidSchema,
  type ModerationQueueItemRead,
  type PaginatedResultModel,
} from '@/features/moderation/api/types';

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

export const isCurrentUserAppAdmin = async (uid: string): Promise<boolean> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runRead('moderation.isCurrentUserAppAdmin', () => isAppAdminRaw(safeUid));
};

export const getModerationQueue = async (
  pageSize: number = 25,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResultModel<ModerationQueueItemRead>> => {
  const safePageSize = validate(moderationQueueLimitSchema, safeLimit(pageSize, 25), {
    field: 'pageSize',
  });
  return runRead('moderation.getModerationQueue', () =>
    getModerationQueueRaw(safePageSize, lastDoc),
  );
};
