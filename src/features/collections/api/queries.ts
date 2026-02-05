import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type DocumentSnapshot,
} from 'firebase/firestore';

import { db } from '@/shared/lib/firebase';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { idSchema, safeLimitSchema, validate } from '@/shared/lib/validators';

import type {
  CollectionItemRead,
  CollectionItemType,
  CollectionPage,
  CollectionRead,
} from './types';

const DEFAULT_LIMIT = 30;
const READ_TIMEOUT_MS = 5000;

const normalizeDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return null;
};

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  return value;
};

const normalizePositiveNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
};

const normalizeCollectionItemType = (value: unknown): CollectionItemType => {
  if (value === 'link' || value === 'note' || value === 'file') return value;
  return 'note';
};

const buildCollection = (collectionId: string, data: unknown): CollectionRead => {
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

  return {
    id: collectionId,
    name: typeof record.name === 'string' ? record.name : '',
    icon: normalizeText(record.icon),
    itemCount: normalizePositiveNumber(record.itemCount) ?? 0,
    createdAt: normalizeDate(record.createdAt) ?? new Date(0),
    updatedAt: normalizeDate(record.updatedAt) ?? normalizeDate(record.createdAt) ?? new Date(0),
  };
};

const buildCollectionItem = (
  itemId: string,
  data: unknown,
  fallbackCollectionId?: string,
): CollectionItemRead => {
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

  const collectionId =
    typeof record.collectionId === 'string'
      ? record.collectionId
      : fallbackCollectionId
        ? fallbackCollectionId
        : '';

  return {
    id: itemId,
    ownerId: typeof record.ownerId === 'string' ? record.ownerId : '',
    collectionId,
    collectionName: typeof record.collectionName === 'string' ? record.collectionName : '',
    type: normalizeCollectionItemType(record.type),
    title: typeof record.title === 'string' ? record.title : '',
    url: normalizeText(record.url),
    text: normalizeText(record.text),
    fileName: normalizeText(record.fileName),
    fileSize: normalizePositiveNumber(record.fileSize),
    contentType: normalizeText(record.contentType),
    storagePath: normalizeText(record.storagePath),
    createdAt: normalizeDate(record.createdAt) ?? new Date(0),
  };
};

const buildPageResult = <T>(
  docs: DocumentSnapshot[],
  pageSize: number,
  mapper: (docSnap: DocumentSnapshot) => T,
): CollectionPage<T> => {
  const hasMore = docs.length > pageSize;
  const currentDocs = hasMore ? docs.slice(0, pageSize) : docs;

  return {
    items: currentDocs.map(mapper),
    lastDoc: currentDocs.length > 0 ? currentDocs[currentDocs.length - 1] : null,
    hasMore,
  };
};

const fallbackRecentCollectionItems = async (
  uid: string,
  safeLimit: number,
): Promise<CollectionItemRead[]> => {
  const collectionsQuery = query(
    collection(db, 'users', uid, 'collections'),
    orderBy('updatedAt', 'desc'),
    limit(Math.min(safeLimit * 2, 12)),
  );

  const collectionsSnap = await withTimeout(
    withRetry(() => getDocs(collectionsQuery), {
      context: { op: 'collections.getRecentCollectionItems.fallback.collections', uid },
    }),
    READ_TIMEOUT_MS,
    { context: { op: 'collections.getRecentCollectionItems.fallback.collections', uid } },
  );

  trackFirestoreRead(
    'collections.getRecentCollectionItems.fallback.collections',
    collectionsSnap.size,
  );

  if (collectionsSnap.empty) return [];

  const itemSnaps = await Promise.all(
    collectionsSnap.docs.map(async (collectionSnap) => {
      const itemsQuery = query(
        collection(db, 'users', uid, 'collections', collectionSnap.id, 'items'),
        orderBy('createdAt', 'desc'),
        limit(safeLimit),
      );

      try {
        const itemSnap = await withTimeout(
          withRetry(() => getDocs(itemsQuery), {
            context: {
              op: 'collections.getRecentCollectionItems.fallback.items',
              uid,
              collectionId: collectionSnap.id,
            },
          }),
          READ_TIMEOUT_MS,
          {
            context: {
              op: 'collections.getRecentCollectionItems.fallback.items',
              uid,
              collectionId: collectionSnap.id,
            },
          },
        );

        trackFirestoreRead('collections.getRecentCollectionItems.fallback.items', itemSnap.size);
        return itemSnap;
      } catch {
        return null;
      }
    }),
  );

  const items: CollectionItemRead[] = [];
  itemSnaps.forEach((itemSnap, index) => {
    if (!itemSnap) return;
    const collectionId = collectionsSnap.docs[index]?.id;
    itemSnap.docs.forEach((docSnap) => {
      items.push(buildCollectionItem(docSnap.id, docSnap.data(), collectionId));
    });
  });

  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, safeLimit);
};

export const getUserCollectionsPage = async (
  uid: string,
  pageSize: number = DEFAULT_LIMIT,
  cursor?: DocumentSnapshot | null,
): Promise<CollectionPage<CollectionRead>> => {
  const safeUid = validate(idSchema, uid, { context: { uid } });
  const safeLimit = validate(safeLimitSchema, pageSize, { context: { pageSize } });

  let listQuery = query(
    collection(db, 'users', safeUid, 'collections'),
    orderBy('createdAt', 'desc'),
    limit(safeLimit + 1),
  );

  if (cursor) {
    listQuery = query(listQuery, startAfter(cursor));
  }

  try {
    const snapshot = await withTimeout(
      withRetry(() => getDocs(listQuery), {
        context: { op: 'collections.getUserCollectionsPage', uid: safeUid },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'collections.getUserCollectionsPage', uid: safeUid } },
    );

    trackFirestoreRead('collections.getUserCollectionsPage', snapshot.size);

    return buildPageResult(snapshot.docs, safeLimit, (docSnap) =>
      buildCollection(docSnap.id, docSnap.data()),
    );
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'collections.getUserCollectionsPage', uid: safeUid },
    });
  }
};

export const getUserCollections = async (
  uid: string,
  limitCount: number = DEFAULT_LIMIT,
): Promise<CollectionRead[]> => {
  const result = await getUserCollectionsPage(uid, limitCount);
  return result.items;
};

export const getCollectionItemsPage = async (
  uid: string,
  collectionId: string,
  pageSize: number = DEFAULT_LIMIT,
  cursor?: DocumentSnapshot | null,
): Promise<CollectionPage<CollectionItemRead>> => {
  const safeUid = validate(idSchema, uid, { context: { uid } });
  const safeCollectionId = validate(idSchema, collectionId, { context: { collectionId } });
  const safeLimit = validate(safeLimitSchema, pageSize, { context: { pageSize } });

  let listQuery = query(
    collection(db, 'users', safeUid, 'collections', safeCollectionId, 'items'),
    orderBy('createdAt', 'desc'),
    limit(safeLimit + 1),
  );

  if (cursor) {
    listQuery = query(listQuery, startAfter(cursor));
  }

  try {
    const snapshot = await withTimeout(
      withRetry(() => getDocs(listQuery), {
        context: {
          op: 'collections.getCollectionItemsPage',
          uid: safeUid,
          collectionId: safeCollectionId,
        },
      }),
      READ_TIMEOUT_MS,
      {
        context: {
          op: 'collections.getCollectionItemsPage',
          uid: safeUid,
          collectionId: safeCollectionId,
        },
      },
    );

    trackFirestoreRead('collections.getCollectionItemsPage', snapshot.size);

    return buildPageResult(snapshot.docs, safeLimit, (docSnap) =>
      buildCollectionItem(docSnap.id, docSnap.data(), safeCollectionId),
    );
  } catch (error) {
    throw toAppError(error, {
      context: {
        op: 'collections.getCollectionItemsPage',
        uid: safeUid,
        collectionId: safeCollectionId,
      },
    });
  }
};

export const getCollectionItems = async (
  uid: string,
  collectionId: string,
  limitCount: number = DEFAULT_LIMIT,
): Promise<CollectionItemRead[]> => {
  const result = await getCollectionItemsPage(uid, collectionId, limitCount);
  return result.items;
};

export const getRecentCollectionItems = async (
  uid: string,
  limitCount: number = 12,
): Promise<CollectionItemRead[]> => {
  const safeUid = validate(idSchema, uid, { context: { uid } });
  const safeLimit = validate(safeLimitSchema, limitCount, { context: { limitCount } });

  const recentItemsQuery = query(
    collectionGroup(db, 'items'),
    where('ownerId', '==', safeUid),
    orderBy('createdAt', 'desc'),
    limit(safeLimit),
  );

  try {
    const snapshot = await withTimeout(
      withRetry(() => getDocs(recentItemsQuery), {
        context: { op: 'collections.getRecentCollectionItems', uid: safeUid },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'collections.getRecentCollectionItems', uid: safeUid } },
    );

    trackFirestoreRead('collections.getRecentCollectionItems', snapshot.size);

    return snapshot.docs.map((docSnap) => buildCollectionItem(docSnap.id, docSnap.data()));
  } catch (error) {
    const appError = toAppError(error, {
      context: { op: 'collections.getRecentCollectionItems', uid: safeUid },
    });

    const externalCode =
      typeof appError.context?.externalCode === 'string' ? appError.context.externalCode : null;

    if (externalCode !== 'failed-precondition' && externalCode !== 'permission-denied') {
      throw appError;
    }

    try {
      return await fallbackRecentCollectionItems(safeUid, safeLimit);
    } catch (fallbackError) {
      throw toAppError(fallbackError, {
        context: { op: 'collections.getRecentCollectionItems.fallback', uid: safeUid },
      });
    }
  }
};
