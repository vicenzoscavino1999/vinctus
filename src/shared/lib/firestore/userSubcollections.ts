import {
  collection,
  doc,
  getDocs as _getDocs,
  limit,
  onSnapshot as _onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  writeBatch,
  type DocumentReference,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { trackFirestoreListener, trackFirestoreRead } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';
import { joinGroupWithSync, leaveGroupWithSync } from '@/shared/lib/firestore/groups';
import { likePostWithSync, unlikePostWithSync } from '@/shared/lib/firestore/postEngagement';

const DEFAULT_LIMIT = 30;
const SMALL_LIST_LIMIT = 50;
const BATCH_CHUNK_SIZE = 450; // Max 500, use 450 for safety

type GroupVisibility = 'public' | 'private';

interface FirestoreGroupSeed {
  id: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  visibility?: GroupVisibility;
  ownerId?: string;
  iconUrl?: string | null;
  memberCount?: number;
  apiQuery?: string;
  createdAt?: Date;
}

interface PaginatedResultModel<T> {
  items: T[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

const resolveSnapshotSize = (value: unknown): number => {
  if (typeof value !== 'object' || value === null || !('size' in value)) return 1;
  const size = (value as { size?: unknown }).size;
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) return 1;
  return Math.max(1, Math.floor(size));
};

const trackSnapshotRead = (snapshot: unknown): void => {
  trackFirestoreRead('firestore.onSnapshot', resolveSnapshotSize(snapshot));
};

const wrapSnapshotHandler = (handler: unknown): unknown => {
  if (typeof handler !== 'function') return handler;

  return (snapshot: unknown, ...rest: unknown[]) => {
    trackSnapshotRead(snapshot);
    return (handler as (...args: unknown[]) => unknown)(snapshot, ...rest);
  };
};

const wrapSnapshotObserver = (observer: unknown): unknown => {
  if (typeof observer !== 'object' || observer === null || !('next' in observer)) {
    return observer;
  }
  const next = (observer as { next?: unknown }).next;
  if (typeof next !== 'function') return observer;

  const typedObserver = observer as {
    next: (snapshot: unknown, ...rest: unknown[]) => unknown;
  };

  return {
    ...typedObserver,
    next: (snapshot: unknown, ...rest: unknown[]) => {
      trackSnapshotRead(snapshot);
      return typedObserver.next(snapshot, ...rest);
    },
  };
};

const getDocs = ((...args: unknown[]) => {
  const result = (_getDocs as (...innerArgs: unknown[]) => unknown)(...args);

  if (
    typeof result === 'object' &&
    result !== null &&
    'then' in result &&
    typeof (result as Promise<unknown>).then === 'function'
  ) {
    return (result as Promise<unknown>).then((snapshot) => {
      trackFirestoreRead('firestore.getDocs', resolveSnapshotSize(snapshot));
      return snapshot;
    });
  }

  trackFirestoreRead('firestore.getDocs', resolveSnapshotSize(result));
  return result;
}) as typeof _getDocs;

const observeSnapshot = ((...args: unknown[]) => {
  const wrappedArgs = [...args];
  if (wrappedArgs.length > 1) {
    const rawSecond = wrappedArgs[1];
    const maybeObserver = wrapSnapshotObserver(rawSecond);
    wrappedArgs[1] = maybeObserver;

    if (maybeObserver === rawSecond) {
      wrappedArgs[1] = wrapSnapshotHandler(rawSecond);
    }
  }

  if (wrappedArgs.length > 2) {
    wrappedArgs[2] = wrapSnapshotHandler(wrappedArgs[2]);
  }

  const unsubscribe = (_onSnapshot as (...innerArgs: unknown[]) => Unsubscribe)(...wrappedArgs);
  return trackFirestoreListener('firestore.onSnapshot', unsubscribe);
}) as typeof _onSnapshot;

async function deleteInChunks(refs: DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += BATCH_CHUNK_SIZE) {
    const batch = writeBatch(db);
    const chunk = refs.slice(i, i + BATCH_CHUNK_SIZE);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function setInChunks<T extends object>(
  items: Array<{ ref: DocumentReference; data: T }>,
): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH_CHUNK_SIZE) {
    const batch = writeBatch(db);
    const chunk = items.slice(i, i + BATCH_CHUNK_SIZE);
    chunk.forEach(({ ref, data }) => batch.set(ref, data));
    await batch.commit();
  }
}

export const subscribeToSavedCategories = (
  uid: string,
  onUpdate: (categoryIds: string[]) => void,
): Unsubscribe => {
  const q = query(
    collection(db, 'users', uid, 'savedCategories'),
    orderBy('createdAt', 'desc'),
    limit(SMALL_LIST_LIMIT),
  );

  return observeSnapshot(q, (snapshot) => {
    const categoryIds = snapshot.docs.map((d) => d.id);
    onUpdate(categoryIds);
  });
};

export const subscribeToLikedPosts = (
  uid: string,
  onUpdate: (postIds: string[]) => void,
  limitCount: number = DEFAULT_LIMIT,
): Unsubscribe => {
  const q = query(
    collection(db, 'users', uid, 'likes'),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );

  return observeSnapshot(q, (snapshot) => {
    const postIds = snapshot.docs.map((d) => d.id);
    onUpdate(postIds);
  });
};

export const subscribeToSavedPosts = (
  uid: string,
  onUpdate: (postIds: string[]) => void,
  limitCount: number = DEFAULT_LIMIT,
): Unsubscribe => {
  const q = query(
    collection(db, 'users', uid, 'savedPosts'),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );

  return observeSnapshot(q, (snapshot) => {
    const postIds = snapshot.docs.map((d) => d.id);
    onUpdate(postIds);
  });
};

export const getUserMembershipsPaginated = async (
  uid: string,
  lastDoc?: DocumentSnapshot,
  pageSize: number = DEFAULT_LIMIT,
): Promise<PaginatedResultModel<string>> => {
  let q = query(
    collection(db, 'users', uid, 'memberships'),
    orderBy('joinedAt', 'desc'),
    limit(pageSize + 1),
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, -1) : snapshot.docs;

  return {
    items: docs.map((d) => d.id),
    lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
    hasMore,
  };
};

export const getLikedPostsPaginated = async (
  uid: string,
  lastDoc?: DocumentSnapshot,
  pageSize: number = DEFAULT_LIMIT,
): Promise<PaginatedResultModel<string>> => {
  let q = query(
    collection(db, 'users', uid, 'likes'),
    orderBy('createdAt', 'desc'),
    limit(pageSize + 1),
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, -1) : snapshot.docs;

  return {
    items: docs.map((d) => d.id),
    lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
    hasMore,
  };
};

export const seedGroups = async (
  groups: Array<Omit<FirestoreGroupSeed, 'id' | 'createdAt'>>,
): Promise<void> => {
  const items = groups.map((group) => ({
    ref: doc(collection(db, 'groups')),
    data: {
      ...group,
      memberCount: group.memberCount || 0,
      createdAt: serverTimestamp(),
    },
  }));

  await setInChunks(items);
};

export const clearUserData = async (uid: string): Promise<void> => {
  const collections = ['memberships', 'likes', 'savedPosts', 'savedCategories'];
  const allRefs: DocumentReference[] = [];

  for (const collName of collections) {
    const snapshot = await getDocs(collection(db, 'users', uid, collName));
    snapshot.docs.forEach((d) => allRefs.push(d.ref));
  }

  if (allRefs.length > 0) {
    await deleteInChunks(allRefs);
  }
};

export interface OptimisticAction<T> {
  execute: () => Promise<void>;
  optimisticValue: T;
  rollbackValue: T;
}

export const createOptimisticJoin = (
  groupId: string,
  uid: string,
  currentGroups: string[],
): OptimisticAction<string[]> => ({
  execute: () => joinGroupWithSync(groupId, uid),
  optimisticValue: [...currentGroups, groupId],
  rollbackValue: currentGroups,
});

export const createOptimisticLeave = (
  groupId: string,
  uid: string,
  currentGroups: string[],
): OptimisticAction<string[]> => ({
  execute: () => leaveGroupWithSync(groupId, uid),
  optimisticValue: currentGroups.filter((id) => id !== groupId),
  rollbackValue: currentGroups,
});

export const createOptimisticLike = (
  postId: string,
  uid: string,
  currentLikes: string[],
): OptimisticAction<string[]> => ({
  execute: () => likePostWithSync(postId, uid),
  optimisticValue: [...currentLikes, postId],
  rollbackValue: currentLikes,
});

export const createOptimisticUnlike = (
  postId: string,
  uid: string,
  currentLikes: string[],
): OptimisticAction<string[]> => ({
  execute: () => unlikePostWithSync(postId, uid),
  optimisticValue: currentLikes.filter((id) => id !== postId),
  rollbackValue: currentLikes,
});
