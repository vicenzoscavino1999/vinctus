import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
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

export interface FollowedCategoryRead {
  categoryId: string;
  createdAt: Timestamp;
}

export interface FollowedCategoryWrite {
  categoryId: string;
  createdAt: FieldValue;
}

export type SavedArenaDebateWinner = 'A' | 'B' | 'draw';

export interface SavedArenaDebateRead {
  debateId: string;
  topic: string;
  personaA: string;
  personaB: string;
  summary: string | null;
  verdictWinner: SavedArenaDebateWinner | null;
  createdAt: Timestamp;
}

export interface SavedArenaDebateWrite {
  debateId: string;
  topic: string;
  personaA: string;
  personaB: string;
  summary: string | null;
  verdictWinner: SavedArenaDebateWinner | null;
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

/**
 * Follow a category
 */
export const followCategoryWithSync = async (categoryId: string, uid: string): Promise<void> => {
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'users', uid, 'followedCategories', categoryId),
    {
      categoryId,
      createdAt: serverTimestamp(),
    } as FollowedCategoryWrite,
    { merge: false },
  );
  await batch.commit();
};

/**
 * Unfollow a category
 */
export const unfollowCategoryWithSync = async (categoryId: string, uid: string): Promise<void> => {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'followedCategories', categoryId));
  await batch.commit();
};

/**
 * Check if category is followed
 */
export const isCategoryFollowed = async (categoryId: string, uid: string): Promise<boolean> => {
  trackFirestoreRead('firestore.getDoc');
  const docSnap = await getDoc(doc(db, 'users', uid, 'followedCategories', categoryId));
  return docSnap.exists();
};

/**
 * Save an Arena debate
 */
export const saveArenaDebateWithSync = async (
  debate: Omit<SavedArenaDebateWrite, 'createdAt'>,
  uid: string,
): Promise<void> => {
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'users', uid, 'savedArenaDebates', debate.debateId),
    {
      ...debate,
      createdAt: serverTimestamp(),
    } as SavedArenaDebateWrite,
    { merge: false },
  );
  await batch.commit();
};

/**
 * Unsave an Arena debate
 */
export const unsaveArenaDebateWithSync = async (debateId: string, uid: string): Promise<void> => {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'savedArenaDebates', debateId));
  await batch.commit();
};

/**
 * Check if an Arena debate is saved
 */
export const isArenaDebateSaved = async (debateId: string, uid: string): Promise<boolean> => {
  trackFirestoreRead('firestore.getDoc');
  const docSnap = await getDoc(doc(db, 'users', uid, 'savedArenaDebates', debateId));
  return docSnap.exists();
};

/**
 * Get saved Arena debates
 */
export const getSavedArenaDebates = async (
  uid: string,
  limitCount = 20,
): Promise<SavedArenaDebateRead[]> => {
  const q = query(
    collection(db, 'users', uid, 'savedArenaDebates'),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snapshot = await getDocs(q);
  trackFirestoreRead('firestore.getDocs', snapshot.size);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as SavedArenaDebateRead;
    return {
      ...data,
      debateId: docSnap.id,
    };
  });
};
