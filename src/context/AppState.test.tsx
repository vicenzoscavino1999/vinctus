import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppStateProvider, useAppState } from '@/context/app-state';
import type { ReactNode } from 'react';

// Mock useAuth to return null user (anonymous)
vi.mock('@/app/providers/AuthContext', async () => {
  const actual = await vi.importActual('@/app/providers/AuthContext');
  return {
    ...actual,
    useAuth: () => ({
      user: null,
      loading: false,
      error: null,
      phoneCodeSent: false,
      signInWithGoogle: vi.fn(),
      signInWithEmail: vi.fn(),
      signUpWithEmail: vi.fn(),
      sendPhoneCode: vi.fn(),
      verifyPhoneCode: vi.fn(),
      signOut: vi.fn(),
      clearError: vi.fn(),
      resetPhoneAuth: vi.fn(),
    }),
  };
});

vi.mock('@/features/groups/api', () => ({
  joinGroupWithSync: vi.fn(() => Promise.resolve()),
  leaveGroupWithSync: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/features/posts/api', () => ({
  likePostWithSync: vi.fn(() => Promise.resolve()),
  unlikePostWithSync: vi.fn(() => Promise.resolve()),
  savePostWithSync: vi.fn(() => Promise.resolve()),
  unsavePostWithSync: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/features/profile/api', () => ({
  saveCategoryWithSync: vi.fn(() => Promise.resolve()),
  unsaveCategoryWithSync: vi.fn(() => Promise.resolve()),
  followCategoryWithSync: vi.fn(() => Promise.resolve()),
  unfollowCategoryWithSync: vi.fn(() => Promise.resolve()),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

// Wrapper para proveer contexto (anonymous user uses localStorage)
const wrapper = ({ children }: { children: ReactNode }) => (
  <AppStateProvider>{children}</AppStateProvider>
);

describe('useAppState', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.stubGlobal('localStorage', localStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Hidratacion', () => {
    it('inicializa estado desde localStorage', () => {
      localStorageMock.setItem('vinctus_joined_groups', JSON.stringify(['1', '2']));
      localStorageMock.setItem('vinctus_saved_categories', JSON.stringify(['science']));
      localStorageMock.setItem('vinctus_followed_categories', JSON.stringify(['technology']));
      localStorageMock.setItem('vinctus_liked_posts', JSON.stringify(['7']));
      localStorageMock.setItem('vinctus_saved_posts', JSON.stringify(['9']));

      const { result } = renderHook(() => useAppState(), { wrapper });

      expect(result.current.joinedGroups).toEqual(['1', '2']);
      expect(result.current.savedCategories).toEqual(['science']);
      expect(result.current.followedCategories).toEqual(['technology']);
      expect(result.current.likedPosts).toEqual(['7']);
      expect(result.current.savedPosts).toEqual(['9']);
    });
  });

  describe('Grupos', () => {
    it('inicialmente no tiene grupos unidos', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });
      expect(result.current.joinedGroups).toEqual([]);
    });

    it('toggleJoinGroup anade un grupo', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });

      act(() => {
        result.current.toggleJoinGroup('1');
      });

      expect(result.current.isGroupJoined('1')).toBe(true);
      expect(result.current.joinedGroups).toContain('1');
    });

    it('toggleJoinGroup quita un grupo si ya esta unido', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });

      // Unir y luego salir
      act(() => {
        result.current.toggleJoinGroup('1');
      });
      act(() => {
        result.current.toggleJoinGroup('1');
      });

      expect(result.current.isGroupJoined('1')).toBe(false);
      expect(result.current.joinedGroups).not.toContain('1');
    });

    it('persiste grupos en localStorage', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });

      act(() => {
        result.current.toggleJoinGroup('5');
      });

      const stored = JSON.parse(localStorageMock.getItem('vinctus_joined_groups') || '[]');
      expect(stored).toContain('5');
    });
  });

  describe('Categorias', () => {
    it('toggleSaveCategory guarda una categoria', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });

      act(() => {
        result.current.toggleSaveCategory('science');
      });

      expect(result.current.isCategorySaved('science')).toBe(true);
    });

    it('persiste categorias guardadas en localStorage', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });

      act(() => {
        result.current.toggleSaveCategory('science');
      });

      const stored = JSON.parse(localStorageMock.getItem('vinctus_saved_categories') || '[]');
      expect(stored).toContain('science');
    });

    it('toggleSaveCategory quita una categoria guardada', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });

      act(() => {
        result.current.toggleSaveCategory('science');
      });
      act(() => {
        result.current.toggleSaveCategory('science');
      });

      expect(result.current.isCategorySaved('science')).toBe(false);
    });
  });

  describe('Categorias seguidas', () => {
    it('toggleFollowCategory sigue una categoria', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });

      act(() => {
        result.current.toggleFollowCategory('science');
      });

      expect(result.current.isCategoryFollowed('science')).toBe(true);
    });

    it('persiste categorias seguidas en localStorage', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });

      act(() => {
        result.current.toggleFollowCategory('science');
      });

      const stored = JSON.parse(localStorageMock.getItem('vinctus_followed_categories') || '[]');
      expect(stored).toContain('science');
    });

    it('toggleFollowCategory deja de seguir categoria si ya estaba seguida', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });

      act(() => {
        result.current.toggleFollowCategory('science');
      });
      act(() => {
        result.current.toggleFollowCategory('science');
      });

      expect(result.current.isCategoryFollowed('science')).toBe(false);
    });
  });

  describe('Likes', () => {
    it('toggleLikePost da like a un post', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });

      act(() => {
        result.current.toggleLikePost('1');
      });

      expect(result.current.isPostLiked('1')).toBe(true);
    });

    it('persiste likes en localStorage', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });

      act(() => {
        result.current.toggleLikePost('1');
      });

      const stored = JSON.parse(localStorageMock.getItem('vinctus_liked_posts') || '[]');
      expect(stored).toContain('1');
    });

    it('toggleLikePost quita el like si ya existe', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });

      act(() => {
        result.current.toggleLikePost('1');
      });
      act(() => {
        result.current.toggleLikePost('1');
      });

      expect(result.current.isPostLiked('1')).toBe(false);
    });
  });

  describe('Posts guardados', () => {
    it('toggleSavePost guarda un post', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });

      act(() => {
        result.current.toggleSavePost('1');
      });

      expect(result.current.isPostSaved('1')).toBe(true);
    });

    it('persiste posts guardados en localStorage', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });

      act(() => {
        result.current.toggleSavePost('1');
      });

      const stored = JSON.parse(localStorageMock.getItem('vinctus_saved_posts') || '[]');
      expect(stored).toContain('1');
    });

    it('toggleSavePost quita un post guardado', () => {
      const { result } = renderHook(() => useAppState(), { wrapper });

      act(() => {
        result.current.toggleSavePost('1');
      });
      act(() => {
        result.current.toggleSavePost('1');
      });

      expect(result.current.isPostSaved('1')).toBe(false);

      const stored = JSON.parse(localStorageMock.getItem('vinctus_saved_posts') || '[]');
      expect(stored).not.toContain('1');
    });
  });
});
