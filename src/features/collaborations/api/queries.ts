import {
  getCollaborations as getCollaborationsRaw,
  getPendingCollaborationRequests as getPendingCollaborationRequestsRaw,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { safeLimit, validate } from '@/shared/lib/validators';
import {
  collaborationPageLimitSchema,
  uidSchema,
  type CollaborationRead,
  type CollaborationRequestRead,
} from '@/features/collaborations/api/types';

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

export const getCollaborations = async (limitCount: number = 20): Promise<CollaborationRead[]> => {
  const safeLimitCount = validate(collaborationPageLimitSchema, safeLimit(limitCount, 20), {
    field: 'limitCount',
  });
  return runRead('collaborations.getCollaborations', () => getCollaborationsRaw(safeLimitCount));
};

export const getPendingCollaborationRequests = async (
  uid: string,
  limitCount: number = 50,
): Promise<CollaborationRequestRead[]> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeLimitCount = validate(collaborationPageLimitSchema, safeLimit(limitCount, 50), {
    field: 'limitCount',
  });
  return runRead('collaborations.getPendingCollaborationRequests', () =>
    getPendingCollaborationRequestsRaw(safeUid, safeLimitCount),
  );
};
