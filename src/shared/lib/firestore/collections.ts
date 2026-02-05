import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
  type FieldValue,
} from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';

const DEFAULT_LIMIT = 30;
const SMALL_LIST_LIMIT = 50;
const LARGE_LIST_LIMIT = 200;

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
    collection(db, 'users', uid, 'collections'),
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
      itemCount: typeof data.itemCount === 'number' ? data.itemCount : 0,
      createdAt: toDate(data.createdAt) ?? new Date(),
      updatedAt: toDate(data.updatedAt) ?? new Date(),
    } as CollectionRead;
  });
};

export async function createCollection(
  uid: string,
  input: { name: string; icon?: string | null },
): Promise<string> {
  const ref = doc(collection(db, 'users', uid, 'collections'));
  trackFirestoreWrite('firestore.setDoc');
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
  await updateDoc(doc(db, 'users', uid, 'collections', collectionId), {
    name: input.name,
    icon: input.icon ?? null,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCollection(uid: string, collectionId: string): Promise<void> {
  trackFirestoreWrite('firestore.deleteDoc');
  await deleteDoc(doc(db, 'users', uid, 'collections', collectionId));
}

export async function getCollectionItems(
  uid: string,
  collectionId: string,
  limitCount: number = DEFAULT_LIMIT,
): Promise<CollectionItemRead[]> {
  const q = query(
    collection(db, 'users', uid, 'collections', collectionId, 'items'),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snapshot = await getDocs(q);
  trackFirestoreRead('firestore.getDocs', snapshot.size);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ownerId: data.ownerId,
      collectionId: data.collectionId,
      collectionName: data.collectionName,
      type: data.type as CollectionItemType,
      title: data.title,
      url: data.url ?? null,
      text: data.text ?? null,
      fileName: data.fileName ?? null,
      fileSize: typeof data.fileSize === 'number' ? data.fileSize : null,
      contentType: data.contentType ?? null,
      storagePath: data.storagePath ?? null,
      createdAt: toDate(data.createdAt) ?? new Date(),
    } as CollectionItemRead;
  });
}

export async function createCollectionItem(
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
): Promise<string> {
  const itemRef = doc(collection(db, 'users', uid, 'collections', collectionId, 'items'));
  const collectionRef = doc(db, 'users', uid, 'collections', collectionId);
  const batch = writeBatch(db);
  batch.set(
    itemRef,
    {
      ownerId: uid,
      collectionId,
      collectionName: input.collectionName,
      type: input.type,
      title: input.title,
      url: input.url ?? null,
      text: input.text ?? null,
      fileName: input.fileName ?? null,
      fileSize: typeof input.fileSize === 'number' ? input.fileSize : null,
      contentType: input.contentType ?? null,
      storagePath: input.storagePath ?? null,
      createdAt: serverTimestamp(),
    } as CollectionItemWrite,
    { merge: false },
  );
  batch.update(collectionRef, {
    itemCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return itemRef.id;
}

export async function deleteCollectionItem(
  uid: string,
  collectionId: string,
  itemId: string,
): Promise<void> {
  const itemRef = doc(db, 'users', uid, 'collections', collectionId, 'items', itemId);
  const collectionRef = doc(db, 'users', uid, 'collections', collectionId);
  const batch = writeBatch(db);
  batch.delete(itemRef);
  batch.update(collectionRef, {
    itemCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

const mapCollectionItem = (docSnap: DocumentSnapshot): CollectionItemRead => {
  const data = docSnap.data() as Record<string, unknown> | undefined;
  return {
    id: docSnap.id,
    ownerId: data?.ownerId as string,
    collectionId: data?.collectionId as string,
    collectionName: (data?.collectionName as string) ?? null,
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

const fallbackRecentCollectionItems = async (
  uid: string,
  limitCount: number,
): Promise<CollectionItemRead[]> => {
  const collectionSnap = await getDocs(
    query(
      collection(db, 'users', uid, 'collections'),
      orderBy('updatedAt', 'desc'),
      limit(Math.min(limitCount * 2, 12)),
    ),
  );
  trackFirestoreRead('firestore.getDocs', collectionSnap.size);

  if (collectionSnap.empty) return [];

  const itemSnaps = await Promise.all(
    collectionSnap.docs.map((docSnap) => {
      const itemsRef = collection(db, 'users', uid, 'collections', docSnap.id, 'items');
      const itemsQuery = query(itemsRef, orderBy('createdAt', 'desc'), limit(limitCount));
      return getDocs(itemsQuery).catch(() => null);
    }),
  );

  const merged: CollectionItemRead[] = [];
  itemSnaps.forEach((snap) => {
    if (!snap) return;
    trackFirestoreRead('firestore.getDocs', snap.size);
    snap.docs.forEach((docSnap) => merged.push(mapCollectionItem(docSnap)));
  });

  merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return merged.slice(0, limitCount);
};

export async function getRecentCollectionItems(
  uid: string,
  limitCount: number = SMALL_LIST_LIMIT,
): Promise<CollectionItemRead[]> {
  const q = query(
    collectionGroup(db, 'items'),
    where('ownerId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  try {
    const snapshot = await getDocs(q);
    trackFirestoreRead('firestore.getDocs', snapshot.size);
    return snapshot.docs.map((docSnap) => mapCollectionItem(docSnap));
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'failed-precondition' || code === 'permission-denied') {
      console.warn('Recent items query failed; using per-collection fallback.');
      return fallbackRecentCollectionItems(uid, limitCount);
    }
    throw error;
  }
}
