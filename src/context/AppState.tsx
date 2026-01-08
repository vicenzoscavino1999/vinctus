import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import type { AppStateContextType } from '../types';

// Create the context with proper typing
const AppStateContext = createContext<AppStateContextType | null>(null);

// LocalStorage keys
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
    // Joined groups
    const [joinedGroups, setJoinedGroups] = useState<string[]>(() =>
        uniqueValues(getStoredValue<string[]>(STORAGE_KEYS.JOINED_GROUPS, []))
    );

    // Saved categories
    const [savedCategories, setSavedCategories] = useState<string[]>(() =>
        uniqueValues(getStoredValue<string[]>(STORAGE_KEYS.SAVED_CATEGORIES, []))
    );

    // Liked posts
    const [likedPosts, setLikedPosts] = useState<string[]>(() =>
        uniqueValues(getStoredValue<string[]>(STORAGE_KEYS.LIKED_POSTS, []))
    );

    // Saved posts
    const [savedPosts, setSavedPosts] = useState<string[]>(() =>
        uniqueValues(getStoredValue<string[]>(STORAGE_KEYS.SAVED_POSTS, []))
    );

    // Toggle joined group
    const toggleJoinGroup = useCallback((groupId: string) => {
        setJoinedGroups(prev => {
            const newJoined = prev.includes(groupId)
                ? prev.filter(id => id !== groupId)
                : [...prev, groupId];
            const uniqueJoined = uniqueValues(newJoined);
            setStoredValue(STORAGE_KEYS.JOINED_GROUPS, uniqueJoined);
            return uniqueJoined;
        });
    }, []);

    // Check if joined
    const isGroupJoined = useCallback((groupId: string): boolean => {
        return joinedGroups.includes(groupId);
    }, [joinedGroups]);

    // Toggle saved category
    const toggleSaveCategory = useCallback((categoryId: string) => {
        setSavedCategories(prev => {
            const newSaved = prev.includes(categoryId)
                ? prev.filter(id => id !== categoryId)
                : [...prev, categoryId];
            const uniqueSaved = uniqueValues(newSaved);
            setStoredValue(STORAGE_KEYS.SAVED_CATEGORIES, uniqueSaved);
            return uniqueSaved;
        });
    }, []);

    // Check if category saved
    const isCategorySaved = useCallback((categoryId: string): boolean => {
        return savedCategories.includes(categoryId);
    }, [savedCategories]);

    // Toggle liked post
    const toggleLikePost = useCallback((postId: string) => {
        setLikedPosts(prev => {
            const newLiked = prev.includes(postId)
                ? prev.filter(id => id !== postId)
                : [...prev, postId];
            const uniqueLiked = uniqueValues(newLiked);
            setStoredValue(STORAGE_KEYS.LIKED_POSTS, uniqueLiked);
            return uniqueLiked;
        });
    }, []);

    // Check if post liked
    const isPostLiked = useCallback((postId: string): boolean => {
        return likedPosts.includes(postId);
    }, [likedPosts]);

    // Toggle saved post
    const toggleSavePost = useCallback((postId: string) => {
        setSavedPosts(prev => {
            const newSaved = prev.includes(postId)
                ? prev.filter(id => id !== postId)
                : [...prev, postId];
            const uniqueSaved = uniqueValues(newSaved);
            setStoredValue(STORAGE_KEYS.SAVED_POSTS, uniqueSaved);
            return uniqueSaved;
        });
    }, []);

    // Check if post saved
    const isPostSaved = useCallback((postId: string): boolean => {
        return savedPosts.includes(postId);
    }, [savedPosts]);

    // Memoize context value to prevent unnecessary re-renders
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

