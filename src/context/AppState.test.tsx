import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppStateProvider, useAppState } from '../context/AppState';
import type { ReactNode } from 'react';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { store = {}; },
    };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Wrapper para proveer contexto
const wrapper = ({ children }: { children: ReactNode }) => (
    <AppStateProvider>{ children } </AppStateProvider>
);

describe('useAppState', () => {
    beforeEach(() => {
        localStorageMock.clear();
    });

    describe('Grupos', () => {
        it('inicialmente no tiene grupos unidos', () => {
            const { result } = renderHook(() => useAppState(), { wrapper });
            expect(result.current.joinedGroups).toEqual([]);
        });

        it('toggleJoinGroup añade un grupo', () => {
            const { result } = renderHook(() => useAppState(), { wrapper });

            act(() => {
                result.current.toggleJoinGroup(1);
            });

            expect(result.current.isGroupJoined(1)).toBe(true);
            expect(result.current.joinedGroups).toContain(1);
        });

        it('toggleJoinGroup quita un grupo si ya esta unido', () => {
            const { result } = renderHook(() => useAppState(), { wrapper });

            // Unir y luego salir
            act(() => {
                result.current.toggleJoinGroup(1);
            });
            act(() => {
                result.current.toggleJoinGroup(1);
            });

            expect(result.current.isGroupJoined(1)).toBe(false);
            expect(result.current.joinedGroups).not.toContain(1);
        });

        it('persiste grupos en localStorage', () => {
            const { result } = renderHook(() => useAppState(), { wrapper });

            act(() => {
                result.current.toggleJoinGroup(5);
            });

            const stored = JSON.parse(localStorageMock.getItem('vinctus_joined_groups') || '[]');
            expect(stored).toContain(5);
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

    describe('Likes', () => {
        it('toggleLikePost da like a un post', () => {
            const { result } = renderHook(() => useAppState(), { wrapper });

            act(() => {
                result.current.toggleLikePost(1);
            });

            expect(result.current.isPostLiked(1)).toBe(true);
        });

        it('toggleLikePost quita el like si ya existe', () => {
            const { result } = renderHook(() => useAppState(), { wrapper });

            act(() => {
                result.current.toggleLikePost(1);
            });
            act(() => {
                result.current.toggleLikePost(1);
            });

            expect(result.current.isPostLiked(1)).toBe(false);
        });
    });

    describe('Posts guardados', () => {
        it('toggleSavePost guarda un post', () => {
            const { result } = renderHook(() => useAppState(), { wrapper });

            act(() => {
                result.current.toggleSavePost(1);
            });

            expect(result.current.isPostSaved(1)).toBe(true);
        });
    });
});
