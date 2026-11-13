import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { getDocs } from 'firebase/firestore';
import { AppStateProvider, useAppState } from './AppState';
import { publishPostReaction } from '@/features/posts/model/postEngagementEvents';

const auth = vi.hoisted(() => ({ uid: 'ana' }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({ user: { uid: auth.uid } }) }));
const wrapper = ({ children }: { children: ReactNode }) => (
  <AppStateProvider>{children}</AppStateProvider>
);
beforeEach(() => {
  vi.clearAllMocks();
  auth.uid = 'ana';
  localStorage.clear();
  vi.mocked(getDocs).mockResolvedValue({ docs: [] } as never);
});

it('keeps confirmed reactions when a stale bootstrap query finishes afterwards', async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(getDocs)
    .mockResolvedValueOnce({ docs: [] } as never)
    .mockResolvedValueOnce({ docs: [] } as never)
    .mockResolvedValueOnce({ docs: [] } as never)
    .mockReturnValueOnce(
      new Promise((yes) => {
        resolve = yes;
      }) as never,
    );
  const { result } = renderHook(() => useAppState(), { wrapper });
  act(() => publishPostReaction({ uid: 'ana', postId: 'p1', kind: 'like', value: true }));
  expect(result.current.likedPosts).toEqual(['p1']);
  await act(async () => {
    resolve({ docs: [{ id: 'remote' }] });
  });
  await waitFor(() => expect(result.current.likedPosts).toEqual(['remote', 'p1']));
  act(() => publishPostReaction({ uid: 'ana', postId: 'remote', kind: 'like', value: false }));
  expect(result.current.likedPosts).toEqual(['p1']);
});

it('shares confirmed saved state across screens and ignores events from a previous account', async () => {
  const { result, rerender } = renderHook(() => useAppState(), { wrapper });
  await act(async () => {});
  act(() => publishPostReaction({ uid: 'ana', postId: 'p1', kind: 'save', value: true }));
  expect(result.current.savedPosts).toEqual(['p1']);
  auth.uid = 'bruno';
  rerender();
  await waitFor(() => expect(result.current.savedPosts).toEqual([]));
  act(() => publishPostReaction({ uid: 'ana', postId: 'old', kind: 'save', value: true }));
  expect(result.current.savedPosts).toEqual([]);
  act(() => publishPostReaction({ uid: 'bruno', postId: 'p2', kind: 'save', value: true }));
  expect(result.current.savedPosts).toEqual(['p2']);
});
