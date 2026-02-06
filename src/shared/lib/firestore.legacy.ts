// LEGACY Firestore service layer for Vinctus.
// Frozen in Phase 3. Do not add new code here; move new APIs to src/features/*/api.

import {
  collection,
  doc,
  getDoc as _getDoc,
  getDocs as _getDocs,
  getCountFromServer as _getCountFromServer,
  setDoc as _setDoc,
  updateDoc as _updateDoc,
  query,
  where,
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
import { trackFirestoreListener, trackFirestoreRead, trackFirestoreWrite } from './devMetrics';
import { joinGroupWithSync, leaveGroupWithSync } from './firestore/groups';
import { getPublicUsersByIds } from './firestore/publicUsers';
import { getPost } from './firestore/posts';
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

const getDoc = ((...args: unknown[]) => {
  trackFirestoreRead('firestore.getDoc');
  return (_getDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _getDoc;

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

const getCountFromServer = ((...args: unknown[]) => {
  trackFirestoreRead('firestore.getCountFromServer');
  return (_getCountFromServer as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _getCountFromServer;

const setDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.setDoc');
  return (_setDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _setDoc;

const updateDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.updateDoc');
  return (_updateDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _updateDoc;

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

// ==================== Contributions Types ====================

export type ContributionType = 'project' | 'paper' | 'cv' | 'certificate' | 'other';

export interface ContributionRead {
  id: string;
  userId: string;
  type: ContributionType;
  title: string;
  description: string | null;
  categoryId?: string | null;
  link: string | null;
  fileUrl: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileType: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContributionWrite {
  userId: string;
  type: ContributionType;
  title: string;
  description: string | null;
  categoryId?: string | null;
  link: string | null;
  fileUrl: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileType: string | null;
  createdAt: FieldValue;
  updatedAt: FieldValue;
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
const ACTIVITY_SNIPPET_LIMIT = 160;

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

const notificationsCollection = collection(db, 'notifications');

const trimText = (
  value: string | null | undefined,
  limit = ACTIVITY_SNIPPET_LIMIT,
): string | null => {
  if (!value) return null;
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trim()}...`;
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

// ==================== Post Likes (Offline-First writeBatch) ====================

/**
 * Like a post - offline-first with writeBatch
 * Cloud Function should handle likesCount increment on onCreate
 *
 * Source of truth: posts/{postId}/likes/{uid}
 * User index: users/{uid}/likes/{postId}
 */
export const likePostWithSync = async (postId: string, uid: string): Promise<void> => {
  const likeRef = doc(db, 'posts', postId, 'likes', uid);
  const userLikeRef = doc(db, 'users', uid, 'likes', postId);

  const batch = writeBatch(db);

  // Source of truth (for counting/triggers)
  batch.set(
    likeRef,
    {
      uid,
      postId,
      createdAt: serverTimestamp(),
    } as PostLikeWrite,
    { merge: false },
  );

  // User index (for quick "my likes" queries)
  batch.set(
    userLikeRef,
    {
      postId,
      createdAt: serverTimestamp(),
    } as UserLikeWrite,
    { merge: false },
  );

  await batch.commit();

  try {
    const post = await getPost(postId);
    if (!post) return;
    if (post.authorId === uid) return;
    const profile = await getUserProfile(uid);
    await createPostLikeActivity({
      postId,
      postAuthorId: post.authorId,
      postContent: post.content,
      fromUid: uid,
      fromUserName: profile?.displayName ?? null,
      fromUserPhoto: profile?.photoURL ?? null,
    });
  } catch (error) {
    console.error('Error creating like activity:', error);
  }
};

/**
 * Unlike a post - offline-first delete
 * Cloud Function should handle likesCount decrement on onDelete
 */
export const unlikePostWithSync = async (postId: string, uid: string): Promise<void> => {
  const likeRef = doc(db, 'posts', postId, 'likes', uid);
  const userLikeRef = doc(db, 'users', uid, 'likes', postId);

  const batch = writeBatch(db);
  batch.delete(likeRef);
  batch.delete(userLikeRef);
  await batch.commit();
};

/**
 * Check if user liked a post
 */
export const isPostLiked = async (postId: string, uid: string): Promise<boolean> => {
  const docSnap = await getDoc(doc(db, 'posts', postId, 'likes', uid));
  return docSnap.exists();
};

// ==================== Post Comments ====================

export interface PostCommentRead {
  id: string;
  postId: string;
  authorId: string;
  authorSnapshot: {
    displayName: string;
    photoURL: string | null;
  };
  text: string;
  createdAt: Date;
}

export async function addPostComment(
  postId: string,
  authorId: string,
  authorSnapshot: { displayName: string; photoURL: string | null },
  text: string,
): Promise<string> {
  const commentRef = doc(collection(db, 'posts', postId, 'comments'));
  await setDoc(commentRef, {
    postId,
    authorId,
    authorSnapshot,
    text,
    createdAt: serverTimestamp(),
  });
  try {
    const post = await getPost(postId);
    if (post) {
      await createPostCommentActivity({
        postId,
        postAuthorId: post.authorId,
        postContent: post.content,
        commentText: text,
        fromUid: authorId,
        fromUserName: authorSnapshot.displayName,
        fromUserPhoto: authorSnapshot.photoURL,
      });
    }
  } catch (error) {
    console.error('Error creating comment activity:', error);
  }
  return commentRef.id;
}

export async function getPostComments(
  postId: string,
  limitCount: number = 50,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResult<PostCommentRead>> {
  let q = query(
    collection(db, 'posts', postId, 'comments'),
    orderBy('createdAt', 'desc'),
    limit(limitCount + 1),
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  const hasMore = snapshot.docs.length > limitCount;
  const docs = hasMore ? snapshot.docs.slice(0, limitCount) : snapshot.docs;

  const items = docs.map((docSnap) => {
    const data = docSnap.data();
    const createdAt = toDate(data.createdAt) || new Date();
    return {
      id: docSnap.id,
      postId: data.postId || postId,
      authorId: data.authorId || '',
      authorSnapshot: {
        displayName: data.authorSnapshot?.displayName || 'Usuario',
        photoURL: data.authorSnapshot?.photoURL || null,
      },
      text: data.text || '',
      createdAt,
    } as PostCommentRead;
  });

  return {
    items,
    lastDoc: docs[docs.length - 1] || null,
    hasMore,
  };
}

export async function getPostCommentCount(postId: string): Promise<number> {
  const snapshot = await getCountFromServer(collection(db, 'posts', postId, 'comments'));
  return snapshot.data().count;
}

export async function getPostLikeCount(postId: string): Promise<number> {
  const snapshot = await getCountFromServer(collection(db, 'posts', postId, 'likes'));
  return snapshot.data().count;
}

// ==================== Activity Feed ====================

export async function getUserActivity(
  uid: string,
  pageSize: number = DEFAULT_LIMIT,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResult<ActivityRead>> {
  let q = query(
    notificationsCollection,
    where('toUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(pageSize + 1),
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

  const items = docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      type: data.type as ActivityType,
      toUid: data.toUid,
      fromUid: data.fromUid,
      fromUserName: data.fromUserName ?? null,
      fromUserPhoto: data.fromUserPhoto ?? null,
      postId: data.postId ?? null,
      postSnippet: data.postSnippet ?? null,
      commentText: data.commentText ?? null,
      createdAt: toDate(data.createdAt) || new Date(),
      read: data.read === true,
    } as ActivityRead;
  });

  return {
    items,
    lastDoc: docs[docs.length - 1] || null,
    hasMore,
  };
}

export async function createPostLikeActivity(input: {
  postId: string;
  postAuthorId: string;
  postContent: string | null;
  fromUid: string;
  fromUserName: string | null;
  fromUserPhoto: string | null;
}): Promise<void> {
  if (input.postAuthorId === input.fromUid) return;
  const docId = `like_${input.postId}_${input.fromUid}`;
  await setDoc(
    doc(notificationsCollection, docId),
    {
      type: 'post_like',
      toUid: input.postAuthorId,
      fromUid: input.fromUid,
      fromUserName: input.fromUserName ?? null,
      fromUserPhoto: input.fromUserPhoto ?? null,
      postId: input.postId,
      postSnippet: trimText(input.postContent),
      commentText: null,
      createdAt: serverTimestamp(),
      read: false,
    } as ActivityWrite,
    { merge: true },
  );
}

export async function createPostCommentActivity(input: {
  postId: string;
  postAuthorId: string;
  postContent: string | null;
  commentText: string;
  fromUid: string;
  fromUserName: string | null;
  fromUserPhoto: string | null;
}): Promise<string | null> {
  if (input.postAuthorId === input.fromUid) return null;
  const ref = doc(notificationsCollection);
  await setDoc(ref, {
    type: 'post_comment',
    toUid: input.postAuthorId,
    fromUid: input.fromUid,
    fromUserName: input.fromUserName ?? null,
    fromUserPhoto: input.fromUserPhoto ?? null,
    postId: input.postId,
    postSnippet: trimText(input.postContent),
    commentText: trimText(input.commentText, 220),
    createdAt: serverTimestamp(),
    read: false,
  } as ActivityWrite);
  return ref.id;
}

// ==================== Contributions ====================

export async function getUserContributions(uid: string): Promise<ContributionRead[]> {
  const q = query(collection(db, 'contributions'), where('userId', '==', uid));
  const snapshot = await getDocs(q);
  const items = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      userId: data.userId,
      type: data.type as ContributionType,
      title: data.title,
      description: data.description ?? null,
      categoryId: data.categoryId ?? null,
      link: data.link ?? null,
      fileUrl: data.fileUrl ?? null,
      filePath: data.filePath ?? null,
      fileName: data.fileName ?? null,
      fileSize: typeof data.fileSize === 'number' ? data.fileSize : null,
      fileType: data.fileType ?? null,
      createdAt: toDate(data.createdAt) ?? new Date(0),
      updatedAt: toDate(data.updatedAt) ?? new Date(0),
    } as ContributionRead;
  });
  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return items;
}

export async function getContributionsByCategory(
  categoryId: string,
  limitCount: number = 12,
): Promise<ContributionRead[]> {
  const q = query(
    collection(db, 'contributions'),
    where('categoryId', '==', categoryId),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      userId: data.userId,
      type: data.type as ContributionType,
      title: data.title,
      description: data.description ?? null,
      categoryId: data.categoryId ?? null,
      link: data.link ?? null,
      fileUrl: data.fileUrl ?? null,
      filePath: data.filePath ?? null,
      fileName: data.fileName ?? null,
      fileSize: typeof data.fileSize === 'number' ? data.fileSize : null,
      fileType: data.fileType ?? null,
      createdAt: toDate(data.createdAt) ?? new Date(0),
      updatedAt: toDate(data.updatedAt) ?? new Date(0),
    } as ContributionRead;
  });
}

export async function createContribution(input: {
  userId: string;
  type: ContributionType;
  title: string;
  description?: string | null;
  link?: string | null;
  categoryId?: string | null;
}): Promise<string> {
  const ref = doc(collection(db, 'contributions'));
  await setDoc(
    ref,
    {
      userId: input.userId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
      link: input.link ?? null,
      fileUrl: null,
      filePath: null,
      fileName: null,
      fileSize: null,
      fileType: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as ContributionWrite,
    { merge: false },
  );
  return ref.id;
}

export async function updateContributionFile(
  contributionId: string,
  input: {
    fileUrl: string;
    filePath: string;
    fileName: string;
    fileSize: number;
    fileType: string;
  },
): Promise<void> {
  await updateDoc(doc(db, 'contributions', contributionId), {
    fileUrl: input.fileUrl,
    filePath: input.filePath,
    fileName: input.fileName,
    fileSize: input.fileSize,
    fileType: input.fileType,
    updatedAt: serverTimestamp(),
  });
}

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

// ==================== User Profile Functions ====================

/**
 * Get user profile by UID
 * Handles multiple scenarios:
 * - User exists in private 'users' collection
 * - User only exists in public 'users_public' collection
 * - Permission denied on 'users' collection (fallback to public)
 * - Missing fields in 'users' (complement with 'users_public')
 */
export async function getUserProfile(uid: string): Promise<UserProfileRead | null> {
  let privateData = null;
  let publicData = null;

  // 1. Try private collection (might fail with permission-denied)
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      privateData = userDoc.data();
    }
  } catch (error: any) {
    // Log permission-denied for debugging
    if (error?.code === 'permission-denied') {
      console.log(
        '[getUserProfile] Permission denied for users/' + uid + ', falling back to public',
      );
    }
  }

  // 2. Load public data (always, for fallback or complementing)
  try {
    const publicDoc = await getDoc(doc(db, 'users_public', uid));
    if (publicDoc.exists()) {
      publicData = publicDoc.data();
    }
  } catch (error) {
    console.error('[getUserProfile] Error loading public data:', error);
  }

  // 3. If neither exists, user not found
  if (!privateData && !publicData) {
    console.log('[getUserProfile] User not found in users or users_public: ' + uid);
    return null;
  }

  const accountVisibility =
    privateData?.settings?.privacy?.accountVisibility === 'private'
      ? 'private'
      : publicData?.accountVisibility === 'private'
        ? 'private'
        : 'public';
  const followersCount =
    typeof publicData?.followersCount === 'number'
      ? publicData.followersCount
      : typeof privateData?.followersCount === 'number'
        ? privateData.followersCount
        : 0;
  const followingCount =
    typeof publicData?.followingCount === 'number'
      ? publicData.followingCount
      : typeof privateData?.followingCount === 'number'
        ? privateData.followingCount
        : 0;
  const postsCount =
    typeof publicData?.postsCount === 'number'
      ? publicData.postsCount
      : typeof privateData?.postsCount === 'number'
        ? privateData.postsCount
        : 0;
  const reputation =
    typeof privateData?.reputation === 'number'
      ? privateData.reputation
      : typeof publicData?.reputation === 'number'
        ? publicData.reputation
        : 0;
  const karmaGlobal =
    typeof privateData?.karmaGlobal === 'number'
      ? privateData.karmaGlobal
      : typeof publicData?.karmaGlobal === 'number'
        ? publicData.karmaGlobal
        : undefined;
  const karmaByInterest = (privateData?.karmaByInterest ?? publicData?.karmaByInterest) as
    | Record<string, number>
    | undefined;

  // 4. Merge data (private first, complement with public)
  return {
    uid: uid,
    displayName: privateData?.displayName ?? publicData?.displayName ?? null,
    displayNameLowercase:
      privateData?.displayNameLowercase ?? publicData?.displayNameLowercase ?? null,
    photoURL: privateData?.photoURL ?? publicData?.photoURL ?? null,
    email: privateData?.email ?? null,
    bio: privateData?.bio ?? null,
    role: privateData?.role ?? null,
    location: privateData?.location ?? null,
    username: privateData?.username ?? publicData?.username ?? null,
    reputation,
    karmaGlobal,
    karmaByInterest,
    accountVisibility,
    followersCount,
    followingCount,
    postsCount,
    createdAt: toDate(privateData?.createdAt ?? publicData?.createdAt) ?? new Date(),
    updatedAt: toDate(privateData?.updatedAt ?? publicData?.updatedAt) ?? new Date(),
  };
}

/**
 * Update user profile
 * Updates both 'users' (private) and 'users_public' (public) collections
 */
export async function updateUserProfile(uid: string, updates: UserProfileUpdate): Promise<void> {
  const batch = writeBatch(db);

  // Build updates object
  const userUpdates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  const publicUpdates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.displayName !== undefined) {
    userUpdates.displayName = updates.displayName;
    userUpdates.displayNameLowercase = updates.displayName.toLowerCase();
    publicUpdates.displayName = updates.displayName;
    publicUpdates.displayNameLowercase = updates.displayName.toLowerCase();
  }

  if (updates.bio !== undefined) {
    userUpdates.bio = updates.bio;
  }

  if (updates.photoURL !== undefined) {
    userUpdates.photoURL = updates.photoURL;
    publicUpdates.photoURL = updates.photoURL;
  }

  if (updates.role !== undefined) {
    userUpdates.role = updates.role;
  }

  if (updates.location !== undefined) {
    userUpdates.location = updates.location;
  }

  if (updates.username !== undefined) {
    userUpdates.username = updates.username;
    publicUpdates.username = updates.username;
  }

  // Update private user doc
  batch.set(doc(db, 'users', uid), userUpdates, { merge: true });

  // Update public user doc (only public fields)
  batch.set(doc(db, 'users_public', uid), publicUpdates, { merge: true });

  await batch.commit();
}

/**
 * Subscribe to user profile changes
 */
export function subscribeToUserProfile(
  uid: string,
  onData: (profile: UserProfileRead | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      const data = snapshot.data();
      const privacy = (data.settings?.privacy ?? {}) as Partial<PrivacySettings>;
      const accountVisibility = privacy.accountVisibility === 'private' ? 'private' : 'public';
      onData({
        uid: data.uid || uid,
        displayName: data.displayName || null,
        displayNameLowercase: data.displayNameLowercase || null,
        photoURL: data.photoURL || null,
        email: data.email || null,
        bio: data.bio || null,
        role: data.role || null,
        location: data.location || null,
        username: data.username || null,
        reputation: data.reputation || 0,
        karmaGlobal: typeof data.karmaGlobal === 'number' ? data.karmaGlobal : undefined,
        karmaByInterest:
          typeof data.karmaByInterest === 'object'
            ? (data.karmaByInterest as Record<string, number>)
            : undefined,
        accountVisibility,
        followersCount: typeof data.followersCount === 'number' ? data.followersCount : 0,
        followingCount: typeof data.followingCount === 'number' ? data.followingCount : 0,
        postsCount: typeof data.postsCount === 'number' ? data.postsCount : 0,
        createdAt: toDate(data.createdAt) || new Date(),
        updatedAt: toDate(data.updatedAt) || new Date(),
      });
    },
    onError,
  );
}

// ==================== User Settings ====================

const normalizeNotificationSettings = (value: unknown): NotificationSettings => {
  const data = (value ?? {}) as Partial<NotificationSettings>;
  return {
    pushEnabled:
      typeof data.pushEnabled === 'boolean'
        ? data.pushEnabled
        : DEFAULT_NOTIFICATION_SETTINGS.pushEnabled,
    emailEnabled:
      typeof data.emailEnabled === 'boolean'
        ? data.emailEnabled
        : DEFAULT_NOTIFICATION_SETTINGS.emailEnabled,
    mentionsOnly:
      typeof data.mentionsOnly === 'boolean'
        ? data.mentionsOnly
        : DEFAULT_NOTIFICATION_SETTINGS.mentionsOnly,
    weeklyDigest:
      typeof data.weeklyDigest === 'boolean'
        ? data.weeklyDigest
        : DEFAULT_NOTIFICATION_SETTINGS.weeklyDigest,
    productUpdates:
      typeof data.productUpdates === 'boolean'
        ? data.productUpdates
        : DEFAULT_NOTIFICATION_SETTINGS.productUpdates,
  };
};

const normalizePrivacySettings = (value: unknown): PrivacySettings => {
  const data = (value ?? {}) as Partial<PrivacySettings>;
  const visibility =
    data.accountVisibility === 'private' || data.accountVisibility === 'public'
      ? data.accountVisibility
      : DEFAULT_PRIVACY_SETTINGS.accountVisibility;
  return {
    accountVisibility: visibility,
    allowDirectMessages:
      typeof data.allowDirectMessages === 'boolean'
        ? data.allowDirectMessages
        : DEFAULT_PRIVACY_SETTINGS.allowDirectMessages,
    showOnlineStatus:
      typeof data.showOnlineStatus === 'boolean'
        ? data.showOnlineStatus
        : DEFAULT_PRIVACY_SETTINGS.showOnlineStatus,
    showLastActive:
      typeof data.showLastActive === 'boolean'
        ? data.showLastActive
        : DEFAULT_PRIVACY_SETTINGS.showLastActive,
    allowFriendRequests:
      typeof data.allowFriendRequests === 'boolean'
        ? data.allowFriendRequests
        : DEFAULT_PRIVACY_SETTINGS.allowFriendRequests,
    blockedUsers: Array.isArray(data.blockedUsers)
      ? data.blockedUsers.filter((uid) => typeof uid === 'string')
      : [],
  };
};

export async function getUserSettings(uid: string): Promise<UserSettingsRead> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) {
      return {
        notifications: DEFAULT_NOTIFICATION_SETTINGS,
        privacy: DEFAULT_PRIVACY_SETTINGS,
      };
    }
    const data = snap.data() as { settings?: { notifications?: unknown; privacy?: unknown } };
    return {
      notifications: normalizeNotificationSettings(data.settings?.notifications),
      privacy: normalizePrivacySettings(data.settings?.privacy),
    };
  } catch (error) {
    console.error('Error loading user settings:', error);
    return {
      notifications: DEFAULT_NOTIFICATION_SETTINGS,
      privacy: DEFAULT_PRIVACY_SETTINGS,
    };
  }
}

export async function updateNotificationSettings(
  uid: string,
  settings: NotificationSettings,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    'settings.notifications': settings,
  });
}

export async function updatePrivacySettings(uid: string, settings: PrivacySettings): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid), {
    'settings.privacy': settings,
  });
  batch.set(
    doc(db, 'users_public', uid),
    {
      accountVisibility: settings.accountVisibility,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();
}
