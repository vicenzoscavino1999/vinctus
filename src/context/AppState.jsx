import { createContext, useContext, useState, useCallback, useMemo } from 'react';

// Create the context
const AppStateContext = createContext(null);

// LocalStorage keys
const STORAGE_KEYS = {
    JOINED_GROUPS: 'vinctus_joined_groups',
    SAVED_CATEGORIES: 'vinctus_saved_categories',
    LIKED_POSTS: 'vinctus_liked_posts',
    SAVED_POSTS: 'vinctus_saved_posts',
};

// Helper to safely parse JSON from localStorage
const getStoredValue = (key, defaultValue = []) => {
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : defaultValue;
    } catch {
        return defaultValue;
    }
};

// Provider component
export const AppStateProvider = ({ children }) => {
    // Joined groups
    const [joinedGroups, setJoinedGroups] = useState(() =>
        getStoredValue(STORAGE_KEYS.JOINED_GROUPS)
    );

    // Saved categories
    const [savedCategories, setSavedCategories] = useState(() =>
        getStoredValue(STORAGE_KEYS.SAVED_CATEGORIES)
    );

    // Liked posts
    const [likedPosts, setLikedPosts] = useState(() =>
        getStoredValue(STORAGE_KEYS.LIKED_POSTS)
    );

    // Saved posts
    const [savedPosts, setSavedPosts] = useState(() =>
        getStoredValue(STORAGE_KEYS.SAVED_POSTS)
    );

    // Toggle joined group
    const toggleJoinGroup = useCallback((groupId) => {
        setJoinedGroups(prev => {
            const newJoined = prev.includes(groupId)
                ? prev.filter(id => id !== groupId)
                : [...prev, groupId];
            localStorage.setItem(STORAGE_KEYS.JOINED_GROUPS, JSON.stringify(newJoined));
            return newJoined;
        });
    }, []);

    // Check if joined
    const isGroupJoined = useCallback((groupId) => {
        return joinedGroups.includes(groupId);
    }, [joinedGroups]);

    // Toggle saved category
    const toggleSaveCategory = useCallback((categoryId) => {
        setSavedCategories(prev => {
            const newSaved = prev.includes(categoryId)
                ? prev.filter(id => id !== categoryId)
                : [...prev, categoryId];
            localStorage.setItem(STORAGE_KEYS.SAVED_CATEGORIES, JSON.stringify(newSaved));
            return newSaved;
        });
    }, []);

    // Check if category saved
    const isCategorySaved = useCallback((categoryId) => {
        return savedCategories.includes(categoryId);
    }, [savedCategories]);

    // Toggle liked post
    const toggleLikePost = useCallback((postId) => {
        setLikedPosts(prev => {
            const newLiked = prev.includes(postId)
                ? prev.filter(id => id !== postId)
                : [...prev, postId];
            localStorage.setItem(STORAGE_KEYS.LIKED_POSTS, JSON.stringify(newLiked));
            return newLiked;
        });
    }, []);

    // Check if post liked
    const isPostLiked = useCallback((postId) => {
        return likedPosts.includes(postId);
    }, [likedPosts]);

    // Toggle saved post
    const toggleSavePost = useCallback((postId) => {
        setSavedPosts(prev => {
            const newSaved = prev.includes(postId)
                ? prev.filter(id => id !== postId)
                : [...prev, postId];
            localStorage.setItem(STORAGE_KEYS.SAVED_POSTS, JSON.stringify(newSaved));
            return newSaved;
        });
    }, []);

    // Check if post saved
    const isPostSaved = useCallback((postId) => {
        return savedPosts.includes(postId);
    }, [savedPosts]);

    // Memoize context value to prevent unnecessary re-renders
    const value = useMemo(() => ({
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
export const useAppState = () => {
    const context = useContext(AppStateContext);
    if (!context) {
        throw new Error('useAppState must be used within an AppStateProvider');
    }
    return context;
};

export default AppStateContext;
