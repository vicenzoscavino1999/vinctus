// AppState Context - Integrates with Firestore for authenticated users
// Features: real-time sync, optimistic UI with rollback, localStorage fallback

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import type { AppStateContextType } from '@/shared/types';
import { useAuth } from '@/app/providers/AuthContext';
import { db } from '@/shared/lib/firebase';
import { joinGroupWithSync, leaveGroupWithSync } from '@/features/groups/api';
import {
  likePostWithSync,
  savePostWithSync,
  unlikePostWithSync,
  unsavePostWithSync,
} from '@/features/posts/api';
import {
  saveCategoryWithSync,
  unsaveCategoryWithSync,
  followCategoryWithSync as followCategoryWithSyncProfile,
  unfollowCategoryWithSync as unfollowCategoryWithSyncProfile,
} from '@/features/profile/api';

// Create the context with proper typing
const AppStateContext = createContext<AppStateContextType | null>(null);

// LocalStorage keys (fallback for anonymous users)
const STORAGE_KEYS = {
  JOINED_GROUPS: 'vinctus_joined_groups',
  SAVED_CATEGORIES: 'vinctus_saved_categories',
  FOLLOWED_CATEGORIES: 'vinctus_followed_categories',
  LIKED_POSTS: 'vinctus_liked_posts',
  SAVED_POSTS: 'vinctus_saved_posts',
} as const;

const uniqueValues = (items: string[]): string[] => Array.from(new Set(items));
const APP_STATE_REMOTE_LIMIT = 50;

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
    uniqueValues(getStoredValue<string[]>(STORAGE_KEYS.JOINED_GROUPS, [])),
  );
  const [savedCategories, setSavedCategories] = useState<string[]>(() =>
    uniqueValues(getStoredValue<string[]>(STORAGE_KEYS.SAVED_CATEGORIES, [])),
  );
  const [followedCategories, setFollowedCategories] = useState<string[]>(() =>
    uniqueValues(getStoredValue<string[]>(STORAGE_KEYS.FOLLOWED_CATEGORIES, [])),
  );
  const [likedPosts, setLikedPosts] = useState<string[]>(() =>
    uniqueValues(getStoredValue<string[]>(STORAGE_KEYS.LIKED_POSTS, [])),
  );
  const [savedPosts, setSavedPosts] = useState<string[]>(() =>
    uniqueValues(getStoredValue<string[]>(STORAGE_KEYS.SAVED_POSTS, [])),
  );

  // ==================== Firestore bootstrap sync ====================

  useEffect(() => {
    if (!uid) {
      // Anonymous user - use localStorage (already loaded in initial state)
      return;
    }

    let isActive = true;

    const loadRemoteState = async () => {
      try {
        const [membershipsSnap, categoriesSnap, followedCategoriesSnap, likesSnap, savedSnap] =
          await Promise.all([
            getDocs(
              query(collection(db, 'users', uid, 'memberships'), limit(APP_STATE_REMOTE_LIMIT)),
            ),
            getDocs(
              query(collection(db, 'users', uid, 'savedCategories'), limit(APP_STATE_REMOTE_LIMIT)),
            ),
            getDocs(
              query(
                collection(db, 'users', uid, 'followedCategories'),
                limit(APP_STATE_REMOTE_LIMIT),
              ),
            ),
            getDocs(query(collection(db, 'users', uid, 'likes'), limit(APP_STATE_REMOTE_LIMIT))),
            getDocs(
              query(collection(db, 'users', uid, 'savedPosts'), limit(APP_STATE_REMOTE_LIMIT)),
            ),
          ]);

        if (!isActive) return;

        setJoinedGroups(uniqueValues(membershipsSnap.docs.map((docSnap) => docSnap.id)));
        setSavedCategories(uniqueValues(categoriesSnap.docs.map((docSnap) => docSnap.id)));
        setFollowedCategories(
          uniqueValues(followedCategoriesSnap.docs.map((docSnap) => docSnap.id)),
        );
        setLikedPosts(uniqueValues(likesSnap.docs.map((docSnap) => docSnap.id)));
        setSavedPosts(uniqueValues(savedSnap.docs.map((docSnap) => docSnap.id)));
      } catch (error) {
        console.error('Failed to load app state from Firestore:', error);
      }
    };

    void loadRemoteState();

    return () => {
      isActive = false;
    };
  }, [uid]);

  // ==================== Optimistic UI Helpers ====================

  /**
   * Execute action with optimistic update and rollback on failure
   */
  const executeOptimistic = useCallback(
    async function executeOptimistic<T>(
      setState: Dispatch<SetStateAction<T>>,
      optimisticValue: T,
      rollbackValue: T,
      action: () => Promise<void>,
      storageKey?: string,
    ): Promise<void> {
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
    },
    [uid],
  );

  // ==================== Group Actions ====================

  const toggleJoinGroup = useCallback(
    (groupId: string) => {
      const isJoined = joinedGroups.includes(groupId);
      const optimistic = isJoined
        ? joinedGroups.filter((id) => id !== groupId)
        : [...joinedGroups, groupId];

      executeOptimistic(
        setJoinedGroups,
        uniqueValues(optimistic),
        joinedGroups,
        () =>
          uid
            ? isJoined
              ? leaveGroupWithSync(groupId, uid)
              : joinGroupWithSync(groupId, uid)
            : Promise.resolve(),
        STORAGE_KEYS.JOINED_GROUPS,
      );
    },
    [joinedGroups, uid, executeOptimistic],
  );

  const isGroupJoined = useCallback(
    (groupId: string): boolean => {
      return joinedGroups.includes(groupId);
    },
    [joinedGroups],
  );

  // ==================== Category Actions ====================

  const toggleSaveCategory = useCallback(
    (categoryId: string) => {
      const isSaved = savedCategories.includes(categoryId);
      const optimistic = isSaved
        ? savedCategories.filter((id) => id !== categoryId)
        : [...savedCategories, categoryId];

      executeOptimistic(
        setSavedCategories,
        uniqueValues(optimistic),
        savedCategories,
        () =>
          uid
            ? isSaved
              ? unsaveCategoryWithSync(categoryId, uid)
              : saveCategoryWithSync(categoryId, uid)
            : Promise.resolve(),
        STORAGE_KEYS.SAVED_CATEGORIES,
      );
    },
    [savedCategories, uid, executeOptimistic],
  );

  const isCategorySaved = useCallback(
    (categoryId: string): boolean => {
      return savedCategories.includes(categoryId);
    },
    [savedCategories],
  );

  // ==================== Follow Category Actions ====================

  const toggleFollowCategory = useCallback(
    (categoryId: string) => {
      const isFollowed = followedCategories.includes(categoryId);
      const optimistic = isFollowed
        ? followedCategories.filter((id) => id !== categoryId)
        : [...followedCategories, categoryId];

      executeOptimistic(
        setFollowedCategories,
        uniqueValues(optimistic),
        followedCategories,
        () =>
          uid
            ? isFollowed
              ? unfollowCategoryWithSyncProfile(categoryId, uid)
              : followCategoryWithSyncProfile(categoryId, uid)
            : Promise.resolve(),
        STORAGE_KEYS.FOLLOWED_CATEGORIES,
      );
    },
    [followedCategories, uid, executeOptimistic],
  );

  const isCategoryFollowed = useCallback(
    (categoryId: string): boolean => {
      return followedCategories.includes(categoryId);
    },
    [followedCategories],
  );

  // ==================== Like Actions ====================

  const toggleLikePost = useCallback(
    (postId: string) => {
      const isLiked = likedPosts.includes(postId);
      const optimistic = isLiked
        ? likedPosts.filter((id) => id !== postId)
        : [...likedPosts, postId];

      executeOptimistic(
        setLikedPosts,
        uniqueValues(optimistic),
        likedPosts,
        () =>
          uid
            ? isLiked
              ? unlikePostWithSync(postId, uid)
              : likePostWithSync(postId, uid)
            : Promise.resolve(),
        STORAGE_KEYS.LIKED_POSTS,
      );
    },
    [likedPosts, uid, executeOptimistic],
  );

  const isPostLiked = useCallback(
    (postId: string): boolean => {
      return likedPosts.includes(postId);
    },
    [likedPosts],
  );

  // ==================== Save Post Actions ====================

  const toggleSavePost = useCallback(
    (postId: string) => {
      const isSaved = savedPosts.includes(postId);
      const optimistic = isSaved
        ? savedPosts.filter((id) => id !== postId)
        : [...savedPosts, postId];

      executeOptimistic(
        setSavedPosts,
        uniqueValues(optimistic),
        savedPosts,
        () =>
          uid
            ? isSaved
              ? unsavePostWithSync(postId, uid)
              : savePostWithSync(postId, uid)
            : Promise.resolve(),
        STORAGE_KEYS.SAVED_POSTS,
      );
    },
    [savedPosts, uid, executeOptimistic],
  );

  const isPostSaved = useCallback(
    (postId: string): boolean => {
      return savedPosts.includes(postId);
    },
    [savedPosts],
  );

  // ==================== Context Value ====================

  const value = useMemo<AppStateContextType>(
    () => ({
      // Groups
      joinedGroups,
      toggleJoinGroup,
      isGroupJoined,

      // Categories
      savedCategories,
      toggleSaveCategory,
      isCategorySaved,
      followedCategories,
      toggleFollowCategory,
      isCategoryFollowed,

      // Liked posts
      likedPosts,
      toggleLikePost,
      isPostLiked,

      // Saved posts
      savedPosts,
      toggleSavePost,
      isPostSaved,
    }),
    [
      joinedGroups,
      toggleJoinGroup,
      isGroupJoined,
      savedCategories,
      toggleSaveCategory,
      isCategorySaved,
      followedCategories,
      toggleFollowCategory,
      isCategoryFollowed,
      likedPosts,
      toggleLikePost,
      isPostLiked,
      savedPosts,
      toggleSavePost,
      isPostSaved,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
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
