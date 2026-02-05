import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  type FieldValue,
  type Timestamp,
} from 'firebase/firestore';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';

export interface SavedPostRead {
  postId: string;
  createdAt: Timestamp;
}

export interface SavedPostWrite {
  postId: string;
  createdAt: FieldValue;
}

export interface SavedCategoryRead {
  categoryId: string;
  createdAt: Timestamp;
}

export interface SavedCategoryWrite {
  categoryId: string;
  createdAt: FieldValue;
}

/**
 * Save a post
 */
export const savePostWithSync = async (postId: string, uid: string): Promise<void> => {
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'users', uid, 'savedPosts', postId),
    {
      postId,
      createdAt: serverTimestamp(),
    } as SavedPostWrite,
    { merge: false },
  );
  await batch.commit();
};

/**
 * Unsave a post
 */
export const unsavePostWithSync = async (postId: string, uid: string): Promise<void> => {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'savedPosts', postId));
  await batch.commit();
};

/**
 * Check if post is saved
 */
export const isPostSaved = async (postId: string, uid: string): Promise<boolean> => {
  trackFirestoreRead('firestore.getDoc');
  const docSnap = await getDoc(doc(db, 'users', uid, 'savedPosts', postId));
  return docSnap.exists();
};

/**
 * Save a category
 */
export const saveCategoryWithSync = async (categoryId: string, uid: string): Promise<void> => {
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'users', uid, 'savedCategories', categoryId),
    {
      categoryId,
      createdAt: serverTimestamp(),
    } as SavedCategoryWrite,
    { merge: false },
  );
  await batch.commit();
};

/**
 * Unsave a category
 */
export const unsaveCategoryWithSync = async (categoryId: string, uid: string): Promise<void> => {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'savedCategories', categoryId));
  await batch.commit();
};

/**
 * Check if category is saved
 */
export const isCategorySaved = async (categoryId: string, uid: string): Promise<boolean> => {
  trackFirestoreRead('firestore.getDoc');
  const docSnap = await getDoc(doc(db, 'users', uid, 'savedCategories', categoryId));
  return docSnap.exists();
};
