import {
  createCollection as createCollectionRaw,
  createCollectionItem as createCollectionItemRaw,
  deleteCollection as deleteCollectionRaw,
  deleteCollectionItem as deleteCollectionItemRaw,
  updateCollection as updateCollectionRaw,
} from '@/shared/lib/firestore';
import { deleteCollectionFile } from '@/shared/lib/storage';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate } from '@/shared/lib/validators';
import {
  collectionIdSchema,
  collectionItemIdSchema,
  createCollectionInputSchema,
  createCollectionItemInputSchema,
  uidSchema,
  updateCollectionInputSchema,
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

const createStableId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

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
  const stableCollectionId = createStableId();
  return runWrite('collections.createCollection', () =>
    createCollectionRaw(safeUid, normalizedInput, stableCollectionId),
  );
};

export const updateCollection = async (
  uid: string,
  collectionId: string,
  input: { name: string; icon?: string | null },
): Promise<void> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeCollectionId = validate(collectionIdSchema, collectionId, { field: 'collectionId' });
  const safeInput = validate(updateCollectionInputSchema, input, { field: 'input' });
  const normalizedInput = {
    name: safeInput.name.trim(),
    icon: normalizeNullableText(safeInput.icon),
  };
  return runWrite('collections.updateCollection', () =>
    updateCollectionRaw(safeUid, safeCollectionId, normalizedInput),
  );
};

export const deleteCollection = async (uid: string, collectionId: string): Promise<void> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeCollectionId = validate(collectionIdSchema, collectionId, { field: 'collectionId' });
  const storagePaths = await runWrite('collections.deleteCollection', () =>
    deleteCollectionRaw(safeUid, safeCollectionId),
  );
  if (Array.isArray(storagePaths) && storagePaths.length > 0) {
    await Promise.allSettled(storagePaths.map((path) => deleteCollectionFile(path)));
  }
};

export const createCollectionItem = async (
  uid: string,
  collectionId: string,
  input: {
    itemId?: string;
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
  const stableItemId = safeInput.itemId ?? createStableId();
  const normalizedInput = {
    itemId: stableItemId,
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
