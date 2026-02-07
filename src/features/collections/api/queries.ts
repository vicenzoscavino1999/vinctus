import {
  getCollectionItems as getCollectionItemsRaw,
  getRecentCollectionItems as getRecentCollectionItemsRaw,
  getUserCollections as getUserCollectionsRaw,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { safeLimit, validate } from '@/shared/lib/validators';
import {
  collectionIdSchema,
  collectionPageLimitSchema,
  uidSchema,
  type CollectionItemRead,
  type CollectionRead,
} from '@/features/collections/api/types';

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

export const getUserCollections = async (
  uid: string,
  limitCount: number = 50,
): Promise<CollectionRead[]> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeLimitCount = validate(collectionPageLimitSchema, safeLimit(limitCount, 50), {
    field: 'limitCount',
  });
  return runRead('collections.getUserCollections', () =>
    getUserCollectionsRaw(safeUid, safeLimitCount),
  );
};

export const getCollectionItems = async (
  uid: string,
  collectionId: string,
  limitCount: number = 30,
): Promise<CollectionItemRead[]> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeCollectionId = validate(collectionIdSchema, collectionId, { field: 'collectionId' });
  const safeLimitCount = validate(collectionPageLimitSchema, safeLimit(limitCount, 30), {
    field: 'limitCount',
  });
  return runRead('collections.getCollectionItems', () =>
    getCollectionItemsRaw(safeUid, safeCollectionId, safeLimitCount),
  );
};

export const getRecentCollectionItems = async (
  uid: string,
  limitCount: number = 50,
): Promise<CollectionItemRead[]> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeLimitCount = validate(collectionPageLimitSchema, safeLimit(limitCount, 50), {
    field: 'limitCount',
  });
  return runRead('collections.getRecentCollectionItems', () =>
    getRecentCollectionItemsRaw(safeUid, safeLimitCount),
  );
};
