// Firestore service layer for Vinctus
// Production-ready: atomic transactions, idempotent, proper pagination

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
    runTransaction,
    writeBatch,
    serverTimestamp,
    type DocumentSnapshot,
    type Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';

// ==================== Types & Interfaces ====================

// Edge document shapes (source of truth)
export interface MembershipDoc {
    uid: string;
    groupId: string;
    role: 'member' | 'moderator' | 'admin';
    joinedAt: Date;
}

export interface LikeDoc {
    uid: string;
    postId: string;
    createdAt: Date;
}

export interface SavedPostDoc {
    postId: string;
    createdAt: Date;
}

export interface SavedCategoryDoc {
    categoryId: string;
    createdAt: Date;
}

// Group structure
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
const SMALL_LIST_LIMIT = 50; // For categories, small lists

// ==================== Groups (Read) ====================

const groupsCollection = collection(db, 'groups');

export const getGroups = async (): Promise<FirestoreGroup[]> => {
    const snapshot = await getDocs(groupsCollection);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreGroup));
};

export const getGroupsByCategory = async (categoryId: string): Promise<FirestoreGroup[]> => {
    const q = query(groupsCollection, where('categoryId', '==', categoryId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreGroup));
};

export const getGroup = async (groupId: string): Promise<FirestoreGroup | null> => {
    const docSnap = await getDoc(doc(db, 'groups', groupId));
    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...docSnap.data() } as FirestoreGroup;
};

// ==================== Group Membership (Transactional) ====================

/**
 * Join a group - truly idempotent with transaction
 * Source of truth: groups/{groupId}/members/{uid}
 * User index: users/{uid}/memberships/{groupId}
 */
export const joinGroupWithSync = async (groupId: string, uid: string): Promise<void> => {
    const memberRef = doc(db, 'groups', groupId, 'members', uid);
    const membershipRef = doc(db, 'users', uid, 'memberships', groupId);

    await runTransaction(db, async (tx) => {
        const [memberSnap, membershipSnap] = await Promise.all([
            tx.get(memberRef),
            tx.get(membershipRef),
        ]);

        // Only create if doesn't exist (true idempotence)
        if (!memberSnap.exists()) {
            tx.set(memberRef, {
                uid,
                groupId,
                role: 'member',
                joinedAt: serverTimestamp(),
            });
        }

        if (!membershipSnap.exists()) {
            tx.set(membershipRef, {
                groupId,
                joinedAt: serverTimestamp(),
            });
        }
    });
};

/**
 * Leave a group - delete is idempotent
 */
export const leaveGroupWithSync = async (groupId: string, uid: string): Promise<void> => {
    const memberRef = doc(db, 'groups', groupId, 'members', uid);
    const membershipRef = doc(db, 'users', uid, 'memberships', groupId);

    await runTransaction(db, async (tx) => {
        tx.delete(memberRef);
        tx.delete(membershipRef);
    });
};

/**
 * Check if user is member of group
 */
export const isGroupMember = async (groupId: string, uid: string): Promise<boolean> => {
    const memberDoc = doc(db, 'groups', groupId, 'members', uid);
    const docSnap = await getDoc(memberDoc);
    return docSnap.exists();
};

// ==================== Post Likes (Transactional) ====================

/**
 * Like a post - truly idempotent
 * Source of truth: posts/{postId}/likes/{uid}
 * User index: users/{uid}/likes/{postId}
 */
export const likePostWithSync = async (postId: string, uid: string): Promise<void> => {
    const likeRef = doc(db, 'posts', postId, 'likes', uid);
    const userLikeRef = doc(db, 'users', uid, 'likes', postId);

    await runTransaction(db, async (tx) => {
        const [likeSnap, userLikeSnap] = await Promise.all([
            tx.get(likeRef),
            tx.get(userLikeRef),
        ]);

        if (!likeSnap.exists()) {
            tx.set(likeRef, { uid, postId, createdAt: serverTimestamp() });
        }
        if (!userLikeSnap.exists()) {
            tx.set(userLikeRef, { postId, createdAt: serverTimestamp() });
        }
    });
};

/**
 * Unlike a post - delete is idempotent
 */
export const unlikePostWithSync = async (postId: string, uid: string): Promise<void> => {
    const likeRef = doc(db, 'posts', postId, 'likes', uid);
    const userLikeRef = doc(db, 'users', uid, 'likes', postId);

    await runTransaction(db, async (tx) => {
        tx.delete(likeRef);
        tx.delete(userLikeRef);
    });
};

/**
 * Check if user liked a post
 */
export const isPostLiked = async (postId: string, uid: string): Promise<boolean> => {
    const likeDoc = doc(db, 'posts', postId, 'likes', uid);
    const docSnap = await getDoc(likeDoc);
    return docSnap.exists();
};

// ==================== Saved Posts (Transactional) ====================

/**
 * Save a post - uses users/{uid}/savedPosts/{postId}
 */
export const savePostWithSync = async (postId: string, uid: string): Promise<void> => {
    const savedRef = doc(db, 'users', uid, 'savedPosts', postId);

    await runTransaction(db, async (tx) => {
        const snap = await tx.get(savedRef);
        if (!snap.exists()) {
            tx.set(savedRef, { postId, createdAt: serverTimestamp() });
        }
    });
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

// ==================== Saved Categories (Transactional) ====================

/**
 * Save a category
 */
export const saveCategoryWithSync = async (categoryId: string, uid: string): Promise<void> => {
    const savedRef = doc(db, 'users', uid, 'savedCategories', categoryId);

    await runTransaction(db, async (tx) => {
        const snap = await tx.get(savedRef);
        if (!snap.exists()) {
            tx.set(savedRef, { categoryId, createdAt: serverTimestamp() });
        }
    });
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
 * Subscribe to user's memberships (with limit)
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
 * Subscribe to user's saved categories (small list, no pagination needed)
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
 * Subscribe to user's liked posts (with limit)
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
 * Subscribe to user's saved posts (with limit)
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

// ==================== Paginated Queries (Load More) ====================

/**
 * Get user's memberships with pagination (for "load more")
 */
export const getUserMembershipsPaginated = async (
    uid: string,
    lastDoc?: DocumentSnapshot,
    pageSize: number = DEFAULT_LIMIT
): Promise<PaginatedResult<string>> => {
    let q = query(
        collection(db, 'users', uid, 'memberships'),
        orderBy('joinedAt', 'desc'),
        limit(pageSize + 1) // +1 to check if there's more
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

// ==================== Bulk Operations (for migrations/seeds) ====================

/**
 * Seed initial groups from mock data (use only in dev/setup)
 */
export const seedGroups = async (groups: Omit<FirestoreGroup, 'id'>[]): Promise<void> => {
    const batch = writeBatch(db);

    for (const group of groups) {
        const docRef = doc(collection(db, 'groups'));
        batch.set(docRef, {
            ...group,
            memberCount: 0,
            createdAt: serverTimestamp()
        });
    }

    await batch.commit();
};

/**
 * Clear all user data (for account deletion/testing)
 */
export const clearUserData = async (uid: string): Promise<void> => {
    const batch = writeBatch(db);

    // Get all user subcollections and delete
    const collections = ['memberships', 'likes', 'savedPosts', 'savedCategories'];

    for (const collName of collections) {
        const snapshot = await getDocs(collection(db, 'users', uid, collName));
        snapshot.docs.forEach(d => batch.delete(d.ref));
    }

    await batch.commit();
};
