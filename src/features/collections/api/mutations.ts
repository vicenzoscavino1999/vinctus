import {
  createCollection as createCollectionRaw,
  createCollectionItem as createCollectionItemRaw,
  deleteCollectionItem as deleteCollectionItemRaw,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate } from '@/shared/lib/validators';
import {
  collectionIdSchema,
  collectionItemIdSchema,
  createCollectionInputSchema,
  createCollectionItemInputSchema,
  uidSchema,
  type CollectionItemType,
} from '@/features/collections/api/types';

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

const normalizeNullableText = (value: string | null | undefined): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const createCollection = async (
  uid: string,
  input: { name: string; icon?: string | null },
): Promise<string> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeInput = validate(createCollectionInputSchema, input, { field: 'input' });
  const normalizedInput = {
    name: safeInput.name.trim(),
    icon: normalizeNullableText(safeInput.icon),
  };
  return runWrite('collections.createCollection', () =>
    createCollectionRaw(safeUid, normalizedInput),
  );
};

export const createCollectionItem = async (
  uid: string,
  collectionId: string,
  input: {
    collectionName: string;
    type: CollectionItemType;
    title: string;
    url?: string | null;
    text?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
    contentType?: string | null;
    storagePath?: string | null;
  },
): Promise<string> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeCollectionId = validate(collectionIdSchema, collectionId, { field: 'collectionId' });
  const safeInput = validate(createCollectionItemInputSchema, input, { field: 'input' });
  const normalizedInput = {
    collectionName: safeInput.collectionName.trim(),
    type: safeInput.type,
    title: safeInput.title.trim(),
    url: normalizeNullableText(safeInput.url),
    text: normalizeNullableText(safeInput.text),
    fileName: normalizeNullableText(safeInput.fileName),
    fileSize: safeInput.fileSize ?? null,
    contentType: normalizeNullableText(safeInput.contentType),
    storagePath: normalizeNullableText(safeInput.storagePath),
  };
  return runWrite('collections.createCollectionItem', () =>
    createCollectionItemRaw(safeUid, safeCollectionId, normalizedInput),
  );
};

export const deleteCollectionItem = async (
  uid: string,
  collectionId: string,
  itemId: string,
): Promise<void> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeCollectionId = validate(collectionIdSchema, collectionId, { field: 'collectionId' });
  const safeItemId = validate(collectionItemIdSchema, itemId, { field: 'itemId' });
  return runWrite('collections.deleteCollectionItem', () =>
    deleteCollectionItemRaw(safeUid, safeCollectionId, safeItemId),
  );
};
