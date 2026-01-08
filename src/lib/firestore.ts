// Firestore service layer for Vinctus
// Production-ready: offline-first writeBatch, correct types, chunking

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    onSnapshot,
    writeBatch,
    serverTimestamp,
    Timestamp,
    type FieldValue,
    type DocumentSnapshot,
    type DocumentReference,
    type Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';

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

export interface SavedPostRead {
    postId: string;
    createdAt: Timestamp;
}

export interface SavedCategoryRead {
    categoryId: string;
    createdAt: Timestamp;
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

export interface SavedPostWrite {
    postId: string;
    createdAt: FieldValue;
}

export interface SavedCategoryWrite {
    categoryId: string;
    createdAt: FieldValue;
}

// ==================== Group Type ====================

export interface FirestoreGroup {
    id: string;
    name: string;
    categoryId: string;
    memberCount: number;
    apiQuery?: string;
    createdAt?: Date;
}

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

// ==================== Chunking Helper ====================

/**
 * Delete documents in chunks to avoid 500 write limit
 */
async function deleteInChunks(refs: DocumentReference[]): Promise<void> {
    for (let i = 0; i < refs.length; i += BATCH_CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = refs.slice(i, i + BATCH_CHUNK_SIZE);
        chunk.forEach(ref => batch.delete(ref));
        await batch.commit();
    }
}

/**
 * Set documents in chunks to avoid 500 write limit
 */
async function setInChunks<T extends object>(
    items: Array<{ ref: DocumentReference; data: T }>
): Promise<void> {
    for (let i = 0; i < items.length; i += BATCH_CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = items.slice(i, i + BATCH_CHUNK_SIZE);
        chunk.forEach(({ ref, data }) => batch.set(ref, data));
        await batch.commit();
    }
}

// ==================== Groups (Read) ====================

const groupsCollection = collection(db, 'groups');

export const getGroups = async (): Promise<FirestoreGroup[]> => {
    const snapshot = await getDocs(groupsCollection);
    return snapshot.docs.map(d => {
        const data = d.data();
        return {
            id: d.id,
            ...data,
            createdAt: toDate(data.createdAt),
        } as FirestoreGroup;
    });
};

export const getGroupsByCategory = async (categoryId: string): Promise<FirestoreGroup[]> => {
    const q = query(groupsCollection, where('categoryId', '==', categoryId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => {
        const data = d.data();
        return {
            id: d.id,
            ...data,
            createdAt: toDate(data.createdAt),
        } as FirestoreGroup;
    });
};

export const getGroup = async (groupId: string): Promise<FirestoreGroup | null> => {
    const docSnap = await getDoc(doc(db, 'groups', groupId));
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    return {
        id: docSnap.id,
        ...data,
        createdAt: toDate(data.createdAt),
    } as FirestoreGroup;
};

// ==================== Group Membership (Offline-First writeBatch) ====================

/**
 * Join a group - offline-first with writeBatch (no reads)
 * Cloud Function should handle memberCount increment on onCreate
 * 
 * Source of truth: groups/{groupId}/members/{uid}
 * User index: users/{uid}/memberships/{groupId}
 */
export const joinGroupWithSync = async (groupId: string, uid: string): Promise<void> => {
    const memberRef = doc(db, 'groups', groupId, 'members', uid);
    const membershipRef = doc(db, 'users', uid, 'memberships', groupId);

    const batch = writeBatch(db);

    // Source of truth
    batch.set(memberRef, {
        uid,
        groupId,
        role: 'member',
        joinedAt: serverTimestamp(),
    } as GroupMemberWrite);

    // User index
    batch.set(membershipRef, {
        groupId,
        joinedAt: serverTimestamp(),
    } as UserMembershipWrite);

    await batch.commit();
};

/**
 * Leave a group - offline-first delete
 * Cloud Function should handle memberCount decrement on onDelete
 */
export const leaveGroupWithSync = async (groupId: string, uid: string): Promise<void> => {
    const memberRef = doc(db, 'groups', groupId, 'members', uid);
    const membershipRef = doc(db, 'users', uid, 'memberships', groupId);

    const batch = writeBatch(db);
    batch.delete(memberRef);
    batch.delete(membershipRef);
    await batch.commit();
};

/**
 * Check if user is member of group
 */
export const isGroupMember = async (groupId: string, uid: string): Promise<boolean> => {
    const docSnap = await getDoc(doc(db, 'groups', groupId, 'members', uid));
    return docSnap.exists();
};

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
    batch.set(likeRef, {
        uid,
        postId,
        createdAt: serverTimestamp(),
    } as PostLikeWrite);

    // User index (for quick "my likes" queries)
    batch.set(userLikeRef, {
        postId,
        createdAt: serverTimestamp(),
    } as UserLikeWrite);

    await batch.commit();
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

// ==================== Saved Posts (Offline-First) ====================

/**
 * Save a post
 */
export const savePostWithSync = async (postId: string, uid: string): Promise<void> => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid, 'savedPosts', postId), {
        postId,
        createdAt: serverTimestamp(),
    } as SavedPostWrite);
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
    const docSnap = await getDoc(doc(db, 'users', uid, 'savedPosts', postId));
    return docSnap.exists();
};

// ==================== Saved Categories (Offline-First) ====================

/**
 * Save a category
 */
export const saveCategoryWithSync = async (categoryId: string, uid: string): Promise<void> => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid, 'savedCategories', categoryId), {
        categoryId,
        createdAt: serverTimestamp(),
    } as SavedCategoryWrite);
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
    const docSnap = await getDoc(doc(db, 'users', uid, 'savedCategories', categoryId));
    return docSnap.exists();
};

// ==================== Real-time Subscriptions ====================

/**
 * Subscribe to user's memberships (first page only for realtime)
 */
export const subscribeToUserMemberships = (
    uid: string,
    onUpdate: (groupIds: string[]) => void,
    limitCount: number = SMALL_LIST_LIMIT
): Unsubscribe => {
    const q = query(
        collection(db, 'users', uid, 'memberships'),
        orderBy('joinedAt', 'desc'),
        limit(limitCount)
    );

    return onSnapshot(q, (snapshot) => {
        const groupIds = snapshot.docs.map(d => d.id);
        onUpdate(groupIds);
    });
};

/**
 * Subscribe to user's saved categories
 */
export const subscribeToSavedCategories = (
    uid: string,
    onUpdate: (categoryIds: string[]) => void
): Unsubscribe => {
    const q = query(
        collection(db, 'users', uid, 'savedCategories'),
        orderBy('createdAt', 'desc'),
        limit(SMALL_LIST_LIMIT)
    );

    return onSnapshot(q, (snapshot) => {
        const categoryIds = snapshot.docs.map(d => d.id);
        onUpdate(categoryIds);
    });
};

/**
 * Subscribe to user's liked posts (first page)
 */
export const subscribeToLikedPosts = (
    uid: string,
    onUpdate: (postIds: string[]) => void,
    limitCount: number = DEFAULT_LIMIT
): Unsubscribe => {
    const q = query(
        collection(db, 'users', uid, 'likes'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
    );

    return onSnapshot(q, (snapshot) => {
        const postIds = snapshot.docs.map(d => d.id);
        onUpdate(postIds);
    });
};

/**
 * Subscribe to user's saved posts (first page)
 */
export const subscribeToSavedPosts = (
    uid: string,
    onUpdate: (postIds: string[]) => void,
    limitCount: number = DEFAULT_LIMIT
): Unsubscribe => {
    const q = query(
        collection(db, 'users', uid, 'savedPosts'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
    );

    return onSnapshot(q, (snapshot) => {
        const postIds = snapshot.docs.map(d => d.id);
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
    pageSize: number = DEFAULT_LIMIT
): Promise<PaginatedResult<string>> => {
    let q = query(
        collection(db, 'users', uid, 'memberships'),
        orderBy('joinedAt', 'desc'),
        limit(pageSize + 1)
    );

    if (lastDoc) {
        q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const hasMore = snapshot.docs.length > pageSize;
    const docs = hasMore ? snapshot.docs.slice(0, -1) : snapshot.docs;

    return {
        items: docs.map(d => d.id),
        lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
        hasMore
    };
};

/**
 * Get user's liked posts with pagination
 */
export const getLikedPostsPaginated = async (
    uid: string,
    lastDoc?: DocumentSnapshot,
    pageSize: number = DEFAULT_LIMIT
): Promise<PaginatedResult<string>> => {
    let q = query(
        collection(db, 'users', uid, 'likes'),
        orderBy('createdAt', 'desc'),
        limit(pageSize + 1)
    );

    if (lastDoc) {
        q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const hasMore = snapshot.docs.length > pageSize;
    const docs = hasMore ? snapshot.docs.slice(0, -1) : snapshot.docs;

    return {
        items: docs.map(d => d.id),
        lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
        hasMore
    };
};

// ==================== Bulk Operations (with chunking) ====================

/**
 * Seed groups from mock data (chunked for >500 items)
 */
export const seedGroups = async (
    groups: Array<Omit<FirestoreGroup, 'id' | 'createdAt'>>
): Promise<void> => {
    const items = groups.map(group => ({
        ref: doc(collection(db, 'groups')),
        data: {
            ...group,
            memberCount: group.memberCount || 0,
            createdAt: serverTimestamp(),
        }
    }));

    await setInChunks(items);
};

/**
 * Clear all user data (chunked for users with many items)
 */
export const clearUserData = async (uid: string): Promise<void> => {
    const collections = ['memberships', 'likes', 'savedPosts', 'savedCategories'];
    const allRefs: DocumentReference[] = [];

    // Gather all document references
    for (const collName of collections) {
        const snapshot = await getDocs(collection(db, 'users', uid, collName));
        snapshot.docs.forEach(d => allRefs.push(d.ref));
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
    currentGroups: string[]
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
    currentGroups: string[]
): OptimisticAction<string[]> => ({
    execute: () => leaveGroupWithSync(groupId, uid),
    optimisticValue: currentGroups.filter(id => id !== groupId),
    rollbackValue: currentGroups,
});

/**
 * Create optimistic like action
 */
export const createOptimisticLike = (
    postId: string,
    uid: string,
    currentLikes: string[]
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
    currentLikes: string[]
): OptimisticAction<string[]> => ({
    execute: () => unlikePostWithSync(postId, uid),
    optimisticValue: currentLikes.filter(id => id !== postId),
    rollbackValue: currentLikes,
});
