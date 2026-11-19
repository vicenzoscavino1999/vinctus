import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentSnapshot,
  type FieldValue,
} from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';
import { COLLECTIONS, LIMITS, SUBCOLLECTIONS } from '@/shared/lib/firestore/firestoreContract';

const DEFAULT_LIMIT = 30;
const SMALL_LIST_LIMIT = 50;
const LARGE_LIST_LIMIT = 200;
const DELETE_BATCH_SIZE = 400;

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
};

export type CollectionItemType = 'link' | 'note' | 'file';

export interface CollectionRead {
  id: string;
  name: string;
  icon: string | null;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionWrite {
  name: string;
  icon: string | null;
  itemCount: number;
  createdAt: FieldValue;
  updatedAt: FieldValue;
}

export interface CollectionItemRead {
  id: string;
  ownerId: string;
  collectionId: string;
  collectionName: string;
  type: CollectionItemType;
  title: string;
  url: string | null;
  text: string | null;
  fileName: string | null;
  fileSize: number | null;
  contentType: string | null;
  storagePath: string | null;
  createdAt: Date;
}

export interface CollectionItemWrite {
  ownerId: string;
  collectionId: string;
  collectionName: string;
  type: CollectionItemType;
  title: string;
  url: string | null;
  text: string | null;
  fileName: string | null;
  fileSize: number | null;
  contentType: string | null;
  storagePath: string | null;
  createdAt: FieldValue;
}

export const getUserCollections = async (
  uid: string,
  limitCount: number = LARGE_LIST_LIMIT,
): Promise<CollectionRead[]> => {
  const safeLimit = Math.min(LARGE_LIST_LIMIT, Math.max(1, Math.floor(limitCount)));
  const q = query(
    collection(db, COLLECTIONS.users, uid, SUBCOLLECTIONS.collections),
    orderBy('createdAt', 'desc'),
    limit(safeLimit),
  );
  const snapshot = await getDocs(q);
  trackFirestoreRead('firestore.getDocs', snapshot.size);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      name: data.name,
      icon: data.icon ?? null,
      itemCount: typeof data.itemCount === 'number' ? Math.max(0, data.itemCount) : 0,
      createdAt: toDate(data.createdAt) ?? new Date(),
      updatedAt: toDate(data.updatedAt) ?? new Date(),
    } as CollectionRead;
  });
};

export async function createCollection(
  uid: string,
  input: { name: string; icon?: string | null },
  collectionId?: string,
): Promise<string> {
  const colRef = collection(db, COLLECTIONS.users, uid, SUBCOLLECTIONS.collections);
  const ref = collectionId ? doc(colRef, collectionId) : doc(colRef);
  trackFirestoreWrite('firestore.setDoc');
  if (collectionId) {
    await runTransaction(db, async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists()) return;
      tx.set(ref, {
        name: input.name,
        icon: input.icon ?? null,
        itemCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as CollectionWrite);
    });
    return ref.id;
  }

  await setDoc(
    ref,
    {
      name: input.name,
      icon: input.icon ?? null,
      itemCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as CollectionWrite,
    { merge: false },
  );
  return ref.id;
}

export async function updateCollection(
  uid: string,
  collectionId: string,
  input: { name: string; icon?: string | null },
): Promise<void> {
  trackFirestoreWrite('firestore.updateDoc');
  await updateDoc(doc(db, COLLECTIONS.users, uid, SUBCOLLECTIONS.collections, collectionId), {
    name: input.name,
    icon: input.icon ?? null,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Deletes every item in the collection in paginated batches and then deletes
 * the collection document. Returns storage paths of deleted file items so
 * callers can clean up Storage objects immediately (backed up server-side by
 * onCollectionDeleted).
 */
export async function deleteCollection(uid: string, collectionId: string): Promise<string[]> {
  const collectionRef = doc(db, COLLECTIONS.users, uid, SUBCOLLECTIONS.collections, collectionId);
  const itemsRef = collection(collectionRef, SUBCOLLECTIONS.items);
  const storagePaths: string[] = [];

  while (true) {
    const snap = await getDocs(query(itemsRef, limit(DELETE_BATCH_SIZE)));
    trackFirestoreRead('firestore.getDocs', snap.size);
    if (snap.empty) break;

    const batch = writeBatch(db);
    snap.docs.forEach((itemDoc) => {
      const storagePath = itemDoc.data().storagePath;
      if (typeof storagePath === 'string' && storagePath.trim().length > 0) {
        storagePaths.push(storagePath.trim());
      }
      batch.delete(itemDoc.ref);
    });
    const isFinalBatch = snap.size < DELETE_BATCH_SIZE;
    if (isFinalBatch) {
      batch.delete(collectionRef);
    }
    trackFirestoreWrite('firestore.deleteDoc');
    await batch.commit();
    if (isFinalBatch) {
      return storagePaths;
    }
  }

  const finalBatch = writeBatch(db);
  finalBatch.delete(collectionRef);
  trackFirestoreWrite('firestore.deleteDoc');
  await finalBatch.commit();
  return storagePaths;
}

export async function getCollectionItems(
  uid: string,
  collectionId: string,
  limitCount: number = DEFAULT_LIMIT,
): Promise<CollectionItemRead[]> {
  const q = query(
    collection(
      db,
      COLLECTIONS.users,
      uid,
      SUBCOLLECTIONS.collections,
      collectionId,
      SUBCOLLECTIONS.items,
    ),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snapshot = await getDocs(q);
  trackFirestoreRead('firestore.getDocs', snapshot.size);
  return snapshot.docs.map((docSnap) => mapCollectionItem(docSnap));
}

export async function createCollectionItem(
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
): Promise<string> {
  const itemsCol = collection(
    db,
    COLLECTIONS.users,
    uid,
    SUBCOLLECTIONS.collections,
    collectionId,
    SUBCOLLECTIONS.items,
  );
  const itemRef = input.itemId ? doc(itemsCol, input.itemId) : doc(itemsCol);
  const collectionRef = doc(db, COLLECTIONS.users, uid, SUBCOLLECTIONS.collections, collectionId);
  const safeCollectionName = input.collectionName
    .trim()
    .slice(0, LIMITS.collectionItems.collectionNameMaxLength);

  trackFirestoreWrite('firestore.setDoc');
  await runTransaction(db, async (tx) => {
    const [existingItem, collectionSnap] = await Promise.all([
      tx.get(itemRef),
      tx.get(collectionRef),
    ]);
    // Idempotent retry: if the previous write committed before an ACK failure, do not double-count.
    if (existingItem.exists()) return;

    const currentCount =
      collectionSnap.exists() && typeof collectionSnap.data().itemCount === 'number'
        ? Math.max(0, collectionSnap.data().itemCount)
        : 0;

    tx.set(itemRef, {
      ownerId: uid,
      collectionId,
      collectionName: safeCollectionName || 'Coleccion',
      type: input.type,
      title: input.title,
      url: input.url ?? null,
      text: input.text ?? null,
      fileName: input.fileName ?? null,
      fileSize: typeof input.fileSize === 'number' ? input.fileSize : null,
      contentType: input.contentType ?? null,
      storagePath: input.storagePath ?? null,
      createdAt: serverTimestamp(),
    } as CollectionItemWrite);

    if (collectionSnap.exists()) {
      tx.update(collectionRef, {
        itemCount: currentCount + 1,
        updatedAt: serverTimestamp(),
      });
    }
  });
  return itemRef.id;
}

export async function deleteCollectionItem(
  uid: string,
  collectionId: string,
  itemId: string,
): Promise<void> {
  const itemRef = doc(
    db,
    COLLECTIONS.users,
    uid,
    SUBCOLLECTIONS.collections,
    collectionId,
    SUBCOLLECTIONS.items,
    itemId,
  );
  const collectionRef = doc(db, COLLECTIONS.users, uid, SUBCOLLECTIONS.collections, collectionId);

  trackFirestoreWrite('firestore.deleteDoc');
  await runTransaction(db, async (tx) => {
    const [itemSnap, collectionSnap] = await Promise.all([tx.get(itemRef), tx.get(collectionRef)]);
    if (!itemSnap.exists()) return;

    tx.delete(itemRef);
    if (collectionSnap.exists()) {
      const currentCount =
        typeof collectionSnap.data().itemCount === 'number' ? collectionSnap.data().itemCount : 0;
      tx.update(collectionRef, {
        itemCount: Math.max(0, currentCount - 1),
        updatedAt: serverTimestamp(),
      });
    }
  });
}

const mapCollectionItem = (
  docSnap: DocumentSnapshot,
  overrideCollectionName?: string,
): CollectionItemRead => {
  const data = docSnap.data() as Record<string, unknown> | undefined;
  return {
    id: docSnap.id,
    ownerId: data?.ownerId as string,
    collectionId: data?.collectionId as string,
    collectionName: overrideCollectionName ?? (data?.collectionName as string) ?? '',
    type: data?.type as CollectionItemType,
    title: data?.title as string,
    url: (data?.url as string) ?? null,
    text: (data?.text as string) ?? null,
    fileName: (data?.fileName as string) ?? null,
    fileSize: typeof data?.fileSize === 'number' ? (data.fileSize as number) : null,
    contentType: (data?.contentType as string) ?? null,
    storagePath: (data?.storagePath as string) ?? null,
    createdAt: toDate(data?.createdAt) ?? new Date(0),
  } as CollectionItemRead;
};

/**
 * Fetches recent items directly across the user's own most-recently-updated
 * collections (avoiding unpermitted collectionGroup scans) and resolves each
 * item's live collection name so renamed folders stay up to date.
 */
export async function getRecentCollectionItems(
  uid: string,
  limitCount: number = SMALL_LIST_LIMIT,
): Promise<CollectionItemRead[]> {
  const safeLimit = Math.min(SMALL_LIST_LIMIT, Math.max(1, Math.floor(limitCount)));
  const collectionSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.users, uid, SUBCOLLECTIONS.collections),
      orderBy('updatedAt', 'desc'),
      limit(Math.min(Math.max(safeLimit * 2, 12), 24)),
    ),
  );
  trackFirestoreRead('firestore.getDocs', collectionSnap.size);

  if (collectionSnap.empty) return [];

  const settled = await Promise.allSettled(
    collectionSnap.docs.map(async (colDoc) => {
      const liveName =
        typeof colDoc.data().name === 'string' && colDoc.data().name.trim().length > 0
          ? colDoc.data().name.trim()
          : undefined;
      const itemsRef = collection(
        db,
        COLLECTIONS.users,
        uid,
        SUBCOLLECTIONS.collections,
        colDoc.id,
        SUBCOLLECTIONS.items,
      );
      const snap = await getDocs(query(itemsRef, orderBy('createdAt', 'desc'), limit(safeLimit)));
      trackFirestoreRead('firestore.getDocs', snap.size);
      return snap.docs.map((itemDoc) => mapCollectionItem(itemDoc, liveName));
    }),
  );

  const fulfilled = settled.filter(
    (result): result is PromiseFulfilledResult<CollectionItemRead[]> =>
      result.status === 'fulfilled',
  );
  if (fulfilled.length === 0) {
    const firstRejected = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    throw firstRejected?.reason ?? new Error('No se pudieron cargar elementos recientes.');
  }

  const merged = fulfilled.flatMap((result) => result.value);
  merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return merged.slice(0, safeLimit);
}
