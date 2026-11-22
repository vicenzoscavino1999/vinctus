import type { Firestore } from 'firebase-admin/firestore';
import type { getStorage } from 'firebase-admin/storage';
import { COLLECTIONS, SUBCOLLECTIONS, storagePrefix } from './firestoreContract';

type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

const CLEANUP_BATCH_LIMIT = 200;

const isValidSegment = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && !value.includes('/');

/**
 * Returns the owned Storage folder prefix (`collections/{uid}/{collectionId}/`)
 * for a user's private collection.
 */
export function getOwnedCollectionStoragePrefix(uid: string, collectionId: string): string | null {
  if (!isValidSegment(uid) || !isValidSegment(collectionId)) {
    return null;
  }

  return storagePrefix('collectionFile', { userId: uid, collectionId });
}

/**
 * Validates that a collection item's storagePath belongs strictly to
 * `collections/{uid}/{collectionId}/{itemId}/{filename}` with no traversal.
 */
export function isOwnedCollectionStoragePath(
  uid: string,
  collectionId: string,
  storagePath: unknown,
): storagePath is string {
  const prefix = getOwnedCollectionStoragePrefix(uid, collectionId);
  if (!prefix || typeof storagePath !== 'string' || !storagePath.startsWith(prefix)) {
    return false;
  }

  const remainder = storagePath.slice(prefix.length);
  const parts = remainder.split('/');
  return (
    parts.length === 2 && parts.every((part) => part.length > 0 && part !== '.' && part !== '..')
  );
}

/**
 * Reconcile users/{uid}/collections/{collectionId}.itemCount directly from the
 * current items subcollection size without recreating a deleted collection.
 */
export async function reconcileCollectionItemCount(
  db: Firestore,
  uid: string,
  collectionId: string,
): Promise<void> {
  if (!isValidSegment(uid) || !isValidSegment(collectionId)) return;

  const collectionRef = db
    .collection(COLLECTIONS.users)
    .doc(uid)
    .collection(SUBCOLLECTIONS.collections)
    .doc(collectionId);
  const itemsCollection = collectionRef.collection(SUBCOLLECTIONS.items);

  await db.runTransaction(async (tx) => {
    const collectionSnap = await tx.get(collectionRef);
    if (!collectionSnap.exists) return;

    const countSnap = await tx.get(itemsCollection.count());
    const nextCount = Math.max(0, countSnap.data().count);

    if (collectionSnap.data()?.itemCount !== nextCount) {
      tx.update(collectionRef, { itemCount: nextCount });
    }
  });
}

/**
 * Deletes the owned Storage object of a deleted collection file item.
 */
export async function cleanupDeletedCollectionItemMedia(
  bucket: Bucket,
  uid: string,
  collectionId: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const storagePath = data.storagePath;
  if (!isOwnedCollectionStoragePath(uid, collectionId, storagePath)) {
    return false;
  }

  await bucket.file(storagePath).delete({ ignoreNotFound: true });
  return true;
}

/**
 * Deletes all remaining subcollection items (paginated) and all Storage file versions
 * left behind when a user deletes a collection document.
 */
export async function cleanupDeletedCollection(
  db: Firestore,
  bucket: Bucket,
  uid: string,
  collectionId: string,
): Promise<{ itemsDeleted: number; filesDeleted: number }> {
  const prefix = getOwnedCollectionStoragePrefix(uid, collectionId);
  if (!prefix) {
    return { itemsDeleted: 0, filesDeleted: 0 };
  }

  let itemsDeleted = 0;
  const itemsCollection = db.collection(
    `${COLLECTIONS.users}/${uid}/${SUBCOLLECTIONS.collections}/${collectionId}/${SUBCOLLECTIONS.items}`,
  );

  while (true) {
    const snapshot = await itemsCollection.limit(CLEANUP_BATCH_LIMIT).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    for (const itemDoc of snapshot.docs) {
      batch.delete(itemDoc.ref);
    }
    await batch.commit();
    itemsDeleted += snapshot.size;

    if (snapshot.size < CLEANUP_BATCH_LIMIT) break;
  }

  const [files] = await bucket.getFiles({ prefix, versions: true });
  await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));

  return { itemsDeleted, filesDeleted: files.length };
}
