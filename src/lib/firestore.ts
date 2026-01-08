// Firestore service layer for Vinctus
// Handles all database operations for groups, memberships, and user data

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp,
    query,
    where,
    type Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';

// Types
export interface FirestoreGroup {
    id: string;
    name: string;
    categoryId: string;
    memberCount: number;
    apiQuery?: string;
    createdAt?: Date;
}

export interface GroupMembership {
    groupId: string;
    userId: string;
    joinedAt: Date;
}

// Collection references
const groupsCollection = collection(db, 'groups');

// ==================== Groups ====================

/**
 * Get all groups
 */
export const getGroups = async (): Promise<FirestoreGroup[]> => {
    const snapshot = await getDocs(groupsCollection);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as FirestoreGroup));
};

/**
 * Get groups by category
 */
export const getGroupsByCategory = async (categoryId: string): Promise<FirestoreGroup[]> => {
    const q = query(groupsCollection, where('categoryId', '==', categoryId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as FirestoreGroup));
};

/**
 * Get single group by ID
 */
export const getGroup = async (groupId: string): Promise<FirestoreGroup | null> => {
    const docRef = doc(db, 'groups', groupId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...docSnap.data() } as FirestoreGroup;
};

// ==================== Group Membership ====================

/**
 * Check if user is member of group
 */
export const isGroupMember = async (groupId: string, userId: string): Promise<boolean> => {
    const memberDoc = doc(db, 'groups', groupId, 'members', userId);
    const docSnap = await getDoc(memberDoc);
    return docSnap.exists();
};

/**
 * Join a group
 */
export const joinGroup = async (groupId: string, userId: string): Promise<void> => {
    const memberDoc = doc(db, 'groups', groupId, 'members', userId);
    await setDoc(memberDoc, {
        joinedAt: serverTimestamp()
    });
};

/**
 * Leave a group
 */
export const leaveGroup = async (groupId: string, userId: string): Promise<void> => {
    const memberDoc = doc(db, 'groups', groupId, 'members', userId);
    await deleteDoc(memberDoc);
};

/**
 * Get all group IDs that a user has joined
 */
export const getUserJoinedGroups = async (userId: string): Promise<string[]> => {
    // Since we store memberships as subcollections, we need to check each group
    // This is a limitation - in production, consider a separate userGroups collection
    const groupsSnap = await getDocs(groupsCollection);
    const joinedGroups: string[] = [];

    for (const groupDoc of groupsSnap.docs) {
        const memberDoc = doc(db, 'groups', groupDoc.id, 'members', userId);
        const memberSnap = await getDoc(memberDoc);
        if (memberSnap.exists()) {
            joinedGroups.push(groupDoc.id);
        }
    }

    return joinedGroups;
};

/**
 * Subscribe to user's joined groups (real-time)
 * Returns unsubscribe function
 */
export const subscribeToUserGroups = (
    userId: string,
    onUpdate: (groupIds: string[]) => void
): Unsubscribe => {
    // Listen to the user's membership documents collection
    const userMembershipsRef = collection(db, 'userMemberships', userId, 'groups');

    return onSnapshot(userMembershipsRef, (snapshot) => {
        const groupIds = snapshot.docs.map(doc => doc.id);
        onUpdate(groupIds);
    });
};

// ==================== User Memberships (Denormalized for fast reads) ====================

/**
 * Add group to user's memberships (denormalized)
 */
export const addUserMembership = async (userId: string, groupId: string): Promise<void> => {
    const userGroupDoc = doc(db, 'userMemberships', userId, 'groups', groupId);
    await setDoc(userGroupDoc, {
        joinedAt: serverTimestamp()
    });
};

/**
 * Remove group from user's memberships (denormalized)
 */
export const removeUserMembership = async (userId: string, groupId: string): Promise<void> => {
    const userGroupDoc = doc(db, 'userMemberships', userId, 'groups', groupId);
    await deleteDoc(userGroupDoc);
};

// ==================== Combined Operations ====================

/**
 * Join group with denormalized write (both group members and user memberships)
 */
export const joinGroupWithSync = async (groupId: string, userId: string): Promise<void> => {
    await Promise.all([
        joinGroup(groupId, userId),
        addUserMembership(userId, groupId)
    ]);
};

/**
 * Leave group with denormalized cleanup
 */
export const leaveGroupWithSync = async (groupId: string, userId: string): Promise<void> => {
    await Promise.all([
        leaveGroup(groupId, userId),
        removeUserMembership(userId, groupId)
    ]);
};

// ==================== Saved Categories ====================

/**
 * Subscribe to user's saved categories
 */
export const subscribeToSavedCategories = (
    userId: string,
    onUpdate: (categoryIds: string[]) => void
): Unsubscribe => {
    const userCategoriesRef = collection(db, 'userSavedCategories', userId, 'categories');

    return onSnapshot(userCategoriesRef, (snapshot) => {
        const categoryIds = snapshot.docs.map(doc => doc.id);
        onUpdate(categoryIds);
    });
};

/**
 * Save a category
 */
export const saveCategory = async (userId: string, categoryId: string): Promise<void> => {
    const docRef = doc(db, 'userSavedCategories', userId, 'categories', categoryId);
    await setDoc(docRef, { savedAt: serverTimestamp() });
};

/**
 * Unsave a category
 */
export const unsaveCategory = async (userId: string, categoryId: string): Promise<void> => {
    const docRef = doc(db, 'userSavedCategories', userId, 'categories', categoryId);
    await deleteDoc(docRef);
};

// ==================== Liked Posts ====================

/**
 * Subscribe to user's liked posts
 */
export const subscribeToLikedPosts = (
    userId: string,
    onUpdate: (postIds: string[]) => void
): Unsubscribe => {
    const userLikesRef = collection(db, 'userLikes', userId, 'posts');

    return onSnapshot(userLikesRef, (snapshot) => {
        const postIds = snapshot.docs.map(doc => doc.id);
        onUpdate(postIds);
    });
};

/**
 * Like a post
 */
export const likePost = async (userId: string, postId: string): Promise<void> => {
    // Add to user's likes
    const userLikeDoc = doc(db, 'userLikes', userId, 'posts', postId);
    await setDoc(userLikeDoc, { likedAt: serverTimestamp() });

    // Add to post's likes (for counting)
    const postLikeDoc = doc(db, 'posts', postId, 'likes', userId);
    await setDoc(postLikeDoc, { likedAt: serverTimestamp() });
};

/**
 * Unlike a post
 */
export const unlikePost = async (userId: string, postId: string): Promise<void> => {
    const userLikeDoc = doc(db, 'userLikes', userId, 'posts', postId);
    await deleteDoc(userLikeDoc);

    const postLikeDoc = doc(db, 'posts', postId, 'likes', userId);
    await deleteDoc(postLikeDoc);
};

// ==================== Saved Posts ====================

/**
 * Subscribe to user's saved posts
 */
export const subscribeToSavedPosts = (
    userId: string,
    onUpdate: (postIds: string[]) => void
): Unsubscribe => {
    const userSavesRef = collection(db, 'userSavedPosts', userId, 'posts');

    return onSnapshot(userSavesRef, (snapshot) => {
        const postIds = snapshot.docs.map(doc => doc.id);
        onUpdate(postIds);
    });
};

/**
 * Save a post
 */
export const savePost = async (userId: string, postId: string): Promise<void> => {
    const docRef = doc(db, 'userSavedPosts', userId, 'posts', postId);
    await setDoc(docRef, { savedAt: serverTimestamp() });
};

/**
 * Unsave a post
 */
export const unsavePost = async (userId: string, postId: string): Promise<void> => {
    const docRef = doc(db, 'userSavedPosts', userId, 'posts', postId);
    await deleteDoc(docRef);
};
