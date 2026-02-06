// LEGACY Firestore service layer for Vinctus.
// Frozen in Phase 3. Do not add new code here; move new APIs to src/features/*/api.

import {
  collection,
  doc,
  getDocs as _getDocs,
  query,
  orderBy,
  documentId,
  limit,
  startAfter,
  onSnapshot as _onSnapshot,
  writeBatch,
  serverTimestamp,
  Timestamp,
  type FieldValue,
  type DocumentSnapshot,
  type DocumentReference,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  getDocs as getDocsLite,
  collection as collectionLite,
  query as queryLite,
  where as whereLite,
} from 'firebase/firestore/lite';
import { db, dbLite } from './firebase';
import { trackFirestoreListener, trackFirestoreRead } from './devMetrics';
import { joinGroupWithSync, leaveGroupWithSync } from './firestore/groups';
import { likePostWithSync, unlikePostWithSync } from './firestore/postEngagement';
import { getPublicUsersByIds } from './firestore/publicUsers';
import type { AccountVisibility } from './firestore/users';

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

const onSnapshot = ((...args: unknown[]) => {
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

// ==================== Type Helpers ====================

/**
 * Convert Firestore Timestamp to JS Date
 */
const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
};

// ==================== Read Types (from Firestore) ====================

export interface GroupMemberRead {
  uid: string;
  groupId: string;
  role: 'member' | 'moderator' | 'admin';
  joinedAt: Timestamp;
}

export interface UserMembershipRead {
  groupId: string;
  joinedAt: Timestamp;
}

export interface PostLikeRead {
  uid: string;
  postId: string;
  createdAt: Timestamp;
}

export interface UserLikeRead {
  postId: string;
  createdAt: Timestamp;
}

// ==================== Activity Notifications ====================

export type ActivityType = 'post_like' | 'post_comment' | 'follow';

export interface ActivityRead {
  id: string;
  type: ActivityType;
  toUid: string;
  fromUid: string;
  fromUserName: string | null;
  fromUserPhoto: string | null;
  postId: string | null;
  postSnippet: string | null;
  commentText: string | null;
  createdAt: Date;
  read: boolean;
}

export interface ActivityWrite {
  type: ActivityType;
  toUid: string;
  fromUid: string;
  fromUserName: string | null;
  fromUserPhoto: string | null;
  postId: string | null;
  postSnippet: string | null;
  commentText: string | null;
  createdAt: FieldValue;
  read: boolean;
}

// Extended user profile data
export interface UserProfileRead {
  uid: string;
  displayName: string | null;
  displayNameLowercase: string | null;
  photoURL: string | null;
  email: string | null;
  bio: string | null;
  role: string | null;
  location: string | null;
  username: string | null;
  reputation: number;
  karmaGlobal?: number;
  karmaByInterest?: Record<string, number>;
  accountVisibility: AccountVisibility;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfileUpdate {
  displayName?: string;
  photoURL?: string | null;
  bio?: string;
  role?: string;
  location?: string;
  username?: string;
}

// User settings (preferences)
export interface NotificationSettings {
  pushEnabled: boolean;
  emailEnabled: boolean;
  mentionsOnly: boolean;
  weeklyDigest: boolean;
  productUpdates: boolean;
}

export interface PrivacySettings {
  accountVisibility: AccountVisibility;
  allowDirectMessages: boolean;
  showOnlineStatus: boolean;
  showLastActive: boolean;
  allowFriendRequests: boolean;
  blockedUsers: string[];
}

export interface UserSettingsRead {
  notifications: NotificationSettings;
  privacy: PrivacySettings;
}

// ==================== Write Types (to Firestore) ====================

export interface GroupMemberWrite {
  uid: string;
  groupId: string;
  role: 'member' | 'moderator' | 'admin';
  joinedAt: FieldValue;
}

export interface UserMembershipWrite {
  groupId: string;
  joinedAt: FieldValue;
}

export interface PostLikeWrite {
  uid: string;
  postId: string;
  createdAt: FieldValue;
}

export interface UserLikeWrite {
  postId: string;
  createdAt: FieldValue;
}

// ==================== Group Type ====================

export interface FirestoreGroup {
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
  updatedAt?: Date;
}

export type GroupVisibility = 'public' | 'private';

// Pagination result
export interface PaginatedResult<T> {
  items: T[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}

// ==================== Constants ====================

const DEFAULT_LIMIT = 30;
const SMALL_LIST_LIMIT = 50;
const BATCH_CHUNK_SIZE = 450; // Max 500, use 450 for safety

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  pushEnabled: true,
  emailEnabled: true,
  mentionsOnly: false,
  weeklyDigest: false,
  productUpdates: true,
};

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  accountVisibility: 'public',
  allowDirectMessages: true,
  showOnlineStatus: true,
  showLastActive: true,
  allowFriendRequests: true,
  blockedUsers: [],
};

// ==================== Chunking Helper ====================

/**
 * Delete documents in chunks to avoid 500 write limit
 */
async function deleteInChunks(refs: DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += BATCH_CHUNK_SIZE) {
    const batch = writeBatch(db);
    const chunk = refs.slice(i, i + BATCH_CHUNK_SIZE);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/**
 * Set documents in chunks to avoid 500 write limit
 */
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

// ==================== Groups (Read) ====================
// Moved to ./firestore/groups.ts

export interface CreateGroupInput {
  name: string;
  description: string;
  categoryId: string | null;
  visibility: GroupVisibility;
  iconUrl: string | null;
}

/**
 * Get list of users that current user follows
 * Uses Firestore Lite for iOS compatibility
 * Returns array of UserProfileRead for display in UI
 */
export async function getFollowing(uid: string): Promise<UserProfileRead[]> {
  const buildProfile = (id: string, data: Record<string, any>): UserProfileRead => ({
    uid: id,
    displayName: data.displayName ?? null,
    displayNameLowercase: data.displayNameLowercase ?? null,
    photoURL: data.photoURL ?? null,
    email: null,
    bio: null,
    role: null,
    location: null,
    username: data.username ?? null,
    reputation: data.reputation ?? 0,
    accountVisibility: data.accountVisibility ?? 'public',
    followersCount: data.followersCount ?? 0,
    followingCount: data.followingCount ?? 0,
    postsCount: data.postsCount ?? 0,
    createdAt: data.createdAt ? (toDate(data.createdAt) ?? new Date()) : new Date(),
    updatedAt: data.updatedAt ? (toDate(data.updatedAt) ?? new Date()) : new Date(),
  });

  let followingIds: string[] = [];
  try {
    const followingQuery = queryLite(collectionLite(dbLite, 'users', uid, 'following'));
    const snapshot = await getDocsLite(followingQuery);
    followingIds = snapshot.docs.map((doc) => doc.id);
  } catch (error) {
    console.warn('getFollowing lite failed, falling back to full Firestore.', error);
  }

  if (followingIds.length === 0) {
    try {
      const snapshot = await getDocs(collection(db, 'users', uid, 'following'));
      followingIds = snapshot.docs.map((docSnap) => docSnap.id);
    } catch (error) {
      console.error('getFollowing fallback failed.', error);
      return [];
    }
  }

  if (followingIds.length === 0) return [];

  const profilesMap = new Map<string, UserProfileRead>();
  try {
    for (let i = 0; i < followingIds.length; i += 10) {
      const chunk = followingIds.slice(i, i + 10);
      const profilesQuery = queryLite(
        collectionLite(dbLite, 'users_public'),
        whereLite(documentId(), 'in', chunk),
      );
      const profilesSnap = await getDocsLite(profilesQuery);
      profilesSnap.docs.forEach((doc) => {
        profilesMap.set(doc.id, buildProfile(doc.id, doc.data() as Record<string, any>));
      });
    }
  } catch (error) {
    console.warn('getFollowing lite profiles failed, falling back to full Firestore.', error);
  }

  const missingIds = followingIds.filter((id) => !profilesMap.has(id));
  if (missingIds.length > 0) {
    const usersMap = await getPublicUsersByIds(missingIds);
    usersMap.forEach((data, id) => {
      profilesMap.set(id, buildProfile(id, data as Record<string, any>));
    });
  }

  return followingIds
    .map((id) => profilesMap.get(id))
    .filter((item): item is UserProfileRead => !!item);
}

export type GroupJoinRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface GroupJoinRequestRead {
  id: string;
  groupId: string;
  groupName: string;
  fromUid: string;
  toUid: string;
  status: GroupJoinRequestStatus;
  message: string | null;
  fromUserName: string | null;
  fromUserPhoto: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== Events (Encuentros) ====================

export type EventVisibility = 'public' | 'private';

export interface FirestoreEvent {
  id: string;
  title: string;
  description: string | null;
  startAt: Date | null;
  endAt: Date | null;
  city: string | null;
  venue: string | null;
  capacity: number | null;
  attendeesCount: number | null;
  visibility: EventVisibility;
  createdBy: string;
  coverUrl: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateEventInput {
  title: string;
  description: string | null;
  startAt: Date;
  endAt?: Date | null;
  city: string | null;
  venue: string | null;
  capacity: number | null;
  visibility: EventVisibility;
  coverUrl?: string | null;
}

export interface EventWrite {
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date | null;
  city: string | null;
  venue: string | null;
  capacity: number | null;
  visibility: EventVisibility;
  createdBy: string;
  coverUrl: string | null;
  createdAt: FieldValue;
  updatedAt: FieldValue;
}

export interface EventAttendeeRead {
  uid: string;
  joinedAt: Date;
}

export interface EventAttendeeWrite {
  uid: string;
  joinedAt: FieldValue;
}

export type GroupJoinStatus = 'member' | 'pending' | 'none';

// ==================== Real-time Subscriptions ====================

/**
 * Subscribe to user's saved categories
 */
export const subscribeToSavedCategories = (
  uid: string,
  onUpdate: (categoryIds: string[]) => void,
): Unsubscribe => {
  const q = query(
    collection(db, 'users', uid, 'savedCategories'),
    orderBy('createdAt', 'desc'),
    limit(SMALL_LIST_LIMIT),
  );

  return onSnapshot(q, (snapshot) => {
    const categoryIds = snapshot.docs.map((d) => d.id);
    onUpdate(categoryIds);
  });
};

/**
 * Subscribe to user's liked posts (first page)
 */
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

  return onSnapshot(q, (snapshot) => {
    const postIds = snapshot.docs.map((d) => d.id);
    onUpdate(postIds);
  });
};

/**
 * Subscribe to user's saved posts (first page)
 */
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

  return onSnapshot(q, (snapshot) => {
    const postIds = snapshot.docs.map((d) => d.id);
    onUpdate(postIds);
  });
};

// ==================== Paginated Queries (Load More - No Realtime) ====================

/**
 * Get user's memberships with pagination
 */
export const getUserMembershipsPaginated = async (
  uid: string,
  lastDoc?: DocumentSnapshot,
  pageSize: number = DEFAULT_LIMIT,
): Promise<PaginatedResult<string>> => {
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

/**
 * Get user's liked posts with pagination
 */
export const getLikedPostsPaginated = async (
  uid: string,
  lastDoc?: DocumentSnapshot,
  pageSize: number = DEFAULT_LIMIT,
): Promise<PaginatedResult<string>> => {
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

// ==================== Bulk Operations (with chunking) ====================

/**
 * Seed groups from mock data (chunked for >500 items)
 */
export const seedGroups = async (
  groups: Array<Omit<FirestoreGroup, 'id' | 'createdAt'>>,
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

/**
 * Clear all user data (chunked for users with many items)
 * WARNING: This is for TESTING ONLY!
 *
 * Production issues:
 * - Only deletes user-side data (users/{uid}/...)
 * - Does NOT delete source-of-truth data (groups/{gid}/members/{uid}, posts/{pid}/likes/{uid})
 * - Leaves "zombie" data in Firestore
 * - Security Rules should prevent users from calling this on other UIDs
 *
 * For production account deletion:
 * - Use Cloud Function with onUserDeleted trigger (Firebase Auth)
 * - Admin SDK can delete both sides of dual-write
 * - See: functions/src/index.ts (TODO: implement onUserDeleted)
 */
export const clearUserData = async (uid: string): Promise<void> => {
  const collections = ['memberships', 'likes', 'savedPosts', 'savedCategories'];
  const allRefs: DocumentReference[] = [];

  // Gather all document references
  for (const collName of collections) {
    const snapshot = await getDocs(collection(db, 'users', uid, collName));
    snapshot.docs.forEach((d) => allRefs.push(d.ref));
  }

  // Delete in chunks
  if (allRefs.length > 0) {
    await deleteInChunks(allRefs);
  }
};

// ==================== Optimistic UI Helpers ====================

/**
 * Action result type for optimistic updates
 */
export interface OptimisticAction<T> {
  execute: () => Promise<void>;
  optimisticValue: T;
  rollbackValue: T;
}

/**
 * Create optimistic join action
 */
export const createOptimisticJoin = (
  groupId: string,
  uid: string,
  currentGroups: string[],
): OptimisticAction<string[]> => ({
  execute: () => joinGroupWithSync(groupId, uid),
  optimisticValue: [...currentGroups, groupId],
  rollbackValue: currentGroups,
});

/**
 * Create optimistic leave action
 */
export const createOptimisticLeave = (
  groupId: string,
  uid: string,
  currentGroups: string[],
): OptimisticAction<string[]> => ({
  execute: () => leaveGroupWithSync(groupId, uid),
  optimisticValue: currentGroups.filter((id) => id !== groupId),
  rollbackValue: currentGroups,
});

/**
 * Create optimistic like action
 */
export const createOptimisticLike = (
  postId: string,
  uid: string,
  currentLikes: string[],
): OptimisticAction<string[]> => ({
  execute: () => likePostWithSync(postId, uid),
  optimisticValue: [...currentLikes, postId],
  rollbackValue: currentLikes,
});

/**
 * Create optimistic unlike action
 */
export const createOptimisticUnlike = (
  postId: string,
  uid: string,
  currentLikes: string[],
): OptimisticAction<string[]> => ({
  execute: () => unlikePostWithSync(postId, uid),
  optimisticValue: currentLikes.filter((id) => id !== postId),
  rollbackValue: currentLikes,
});
