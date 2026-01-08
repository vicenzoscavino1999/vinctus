// AppState Context - Integrates with Firestore for authenticated users
// Features: real-time sync, optimistic UI with rollback, localStorage fallback

import {
    createContext,
    useContext,
    useState,
    useCallback,
    useMemo,
    useEffect,
    type ReactNode
} from 'react';
import type { AppStateContextType } from '../types';
import { useAuth } from './AuthContext';
import {
    // Firestore operations
    joinGroupWithSync,
    leaveGroupWithSync,
    likePostWithSync,
    unlikePostWithSync,
    savePostWithSync,
    unsavePostWithSync,
    saveCategoryWithSync,
    unsaveCategoryWithSync,
    // Real-time subscriptions
    subscribeToUserMemberships,
    subscribeToSavedCategories,
    subscribeToLikedPosts,
    subscribeToSavedPosts,
} from '../lib/firestore';

// Create the context with proper typing
const AppStateContext = createContext<AppStateContextType | null>(null);

// LocalStorage keys (fallback for anonymous users)
const STORAGE_KEYS = {
    JOINED_GROUPS: 'vinctus_joined_groups',
    SAVED_CATEGORIES: 'vinctus_saved_categories',
    LIKED_POSTS: 'vinctus_liked_posts',
    SAVED_POSTS: 'vinctus_saved_posts',
} as const;

const uniqueValues = (items: string[]): string[] => Array.from(new Set(items));

// Helper to safely parse JSON from localStorage
const getStoredValue = <T,>(key: string, defaultValue: T): T => {
    if (typeof window === 'undefined') return defaultValue;
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : defaultValue;
    } catch {
        return defaultValue;
    }
};

const setStoredValue = <T,>(key: string, value: T): void => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // ignore storage errors (private mode, quota, SSR)
    }
};

interface AppStateProviderProps {
    children: ReactNode;
}

// Provider component
export const AppStateProvider = ({ children }: AppStateProviderProps) => {
    const { user } = useAuth();
    const uid = user?.uid;

    // State
    const [joinedGroups, setJoinedGroups] = useState<string[]>(() =>
        uniqueValues(getStoredValue<string[]>(STORAGE_KEYS.JOINED_GROUPS, []))
    );
    const [savedCategories, setSavedCategories] = useState<string[]>(() =>
        uniqueValues(getStoredValue<string[]>(STORAGE_KEYS.SAVED_CATEGORIES, []))
    );
    const [likedPosts, setLikedPosts] = useState<string[]>(() =>
        uniqueValues(getStoredValue<string[]>(STORAGE_KEYS.LIKED_POSTS, []))
    );
    const [savedPosts, setSavedPosts] = useState<string[]>(() =>
        uniqueValues(getStoredValue<string[]>(STORAGE_KEYS.SAVED_POSTS, []))
    );

    // ==================== Firestore Real-time Sync ====================

    useEffect(() => {
        if (!uid) {
            // Anonymous user - use localStorage (already loaded in initial state)
            return;
        }

        // Subscribe to real-time updates from Firestore
        const unsubMemberships = subscribeToUserMemberships(uid, (groupIds) => {
            setJoinedGroups(groupIds);
        });

        const unsubCategories = subscribeToSavedCategories(uid, (catIds) => {
            setSavedCategories(catIds);
        });

        const unsubLikes = subscribeToLikedPosts(uid, (postIds) => {
            setLikedPosts(postIds);
        });

        const unsubSaved = subscribeToSavedPosts(uid, (postIds) => {
            setSavedPosts(postIds);
        });

        // Cleanup subscriptions on logout or unmount
        return () => {
            unsubMemberships();
            unsubCategories();
            unsubLikes();
            unsubSaved();
        };
    }, [uid]);

    // ==================== Optimistic UI Helpers ====================

    /**
     * Execute action with optimistic update and rollback on failure
     */
    const executeOptimistic = async <T,>(
        setState: React.Dispatch<React.SetStateAction<T>>,
        optimisticValue: T,
        rollbackValue: T,
        action: () => Promise<void>,
        storageKey?: string
    ): Promise<void> => {
        // Optimistic update
        setState(optimisticValue);

        // Update localStorage for anonymous users
        if (!uid && storageKey) {
            setStoredValue(storageKey, optimisticValue);
        }

        try {
            // Execute Firestore action (only for authenticated users)
            if (uid) {
                await action();
            }
        } catch (error) {
            // Rollback on failure
            console.error('Action failed, rolling back:', error);
            setState(rollbackValue);
            if (!uid && storageKey) {
                setStoredValue(storageKey, rollbackValue);
            }
        }
    };

    // ==================== Group Actions ====================

    const toggleJoinGroup = useCallback((groupId: string) => {
        const isJoined = joinedGroups.includes(groupId);
        const optimistic = isJoined
            ? joinedGroups.filter(id => id !== groupId)
            : [...joinedGroups, groupId];

        executeOptimistic(
            setJoinedGroups,
            uniqueValues(optimistic),
            joinedGroups,
            () => uid
                ? (isJoined ? leaveGroupWithSync(groupId, uid) : joinGroupWithSync(groupId, uid))
                : Promise.resolve(),
            STORAGE_KEYS.JOINED_GROUPS
        );
    }, [joinedGroups, uid]);

    const isGroupJoined = useCallback((groupId: string): boolean => {
        return joinedGroups.includes(groupId);
    }, [joinedGroups]);

    // ==================== Category Actions ====================

    const toggleSaveCategory = useCallback((categoryId: string) => {
        const isSaved = savedCategories.includes(categoryId);
        const optimistic = isSaved
            ? savedCategories.filter(id => id !== categoryId)
            : [...savedCategories, categoryId];

        executeOptimistic(
            setSavedCategories,
            uniqueValues(optimistic),
            savedCategories,
            () => uid
                ? (isSaved ? unsaveCategoryWithSync(categoryId, uid) : saveCategoryWithSync(categoryId, uid))
                : Promise.resolve(),
            STORAGE_KEYS.SAVED_CATEGORIES
        );
    }, [savedCategories, uid]);

    const isCategorySaved = useCallback((categoryId: string): boolean => {
        return savedCategories.includes(categoryId);
    }, [savedCategories]);

    // ==================== Like Actions ====================

    const toggleLikePost = useCallback((postId: string) => {
        const isLiked = likedPosts.includes(postId);
        const optimistic = isLiked
            ? likedPosts.filter(id => id !== postId)
            : [...likedPosts, postId];

        executeOptimistic(
            setLikedPosts,
            uniqueValues(optimistic),
            likedPosts,
            () => uid
                ? (isLiked ? unlikePostWithSync(postId, uid) : likePostWithSync(postId, uid))
                : Promise.resolve(),
            STORAGE_KEYS.LIKED_POSTS
        );
    }, [likedPosts, uid]);

    const isPostLiked = useCallback((postId: string): boolean => {
        return likedPosts.includes(postId);
    }, [likedPosts]);

    // ==================== Save Post Actions ====================

    const toggleSavePost = useCallback((postId: string) => {
        const isSaved = savedPosts.includes(postId);
        const optimistic = isSaved
            ? savedPosts.filter(id => id !== postId)
            : [...savedPosts, postId];

        executeOptimistic(
            setSavedPosts,
            uniqueValues(optimistic),
            savedPosts,
            () => uid
                ? (isSaved ? unsavePostWithSync(postId, uid) : savePostWithSync(postId, uid))
                : Promise.resolve(),
            STORAGE_KEYS.SAVED_POSTS
        );
    }, [savedPosts, uid]);

    const isPostSaved = useCallback((postId: string): boolean => {
        return savedPosts.includes(postId);
    }, [savedPosts]);

    // ==================== Context Value ====================

    const value = useMemo<AppStateContextType>(() => ({
        // Groups
        joinedGroups,
        toggleJoinGroup,
        isGroupJoined,

        // Categories
        savedCategories,
        toggleSaveCategory,
        isCategorySaved,

        // Liked posts
        likedPosts,
        toggleLikePost,
        isPostLiked,

        // Saved posts
        savedPosts,
        toggleSavePost,
        isPostSaved,
    }), [
        joinedGroups, toggleJoinGroup, isGroupJoined,
        savedCategories, toggleSaveCategory, isCategorySaved,
        likedPosts, toggleLikePost, isPostLiked,
        savedPosts, toggleSavePost, isPostSaved,
    ]);

    return (
        <AppStateContext.Provider value={value}>
            {children}
        </AppStateContext.Provider>
    );
};

// Custom hook to use the context
export const useAppState = (): AppStateContextType => {
    const context = useContext(AppStateContext);
    if (!context) {
        throw new Error('useAppState must be used within an AppStateProvider');
    }
    return context;
};

export default AppStateContext;
