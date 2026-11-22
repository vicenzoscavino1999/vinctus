import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { isPostLiked, isPostSaved, likePostWithSync } from '@/features/posts/api';
import { usePostEngagement } from './usePostEngagement';

vi.mock('@/features/posts/api', () => ({
  isPostLiked: vi.fn(),
  isPostSaved: vi.fn(),
  likePostWithSync: vi.fn(),
  unlikePostWithSync: vi.fn(),
  savePostWithSync: vi.fn(),
  unsavePostWithSync: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isPostLiked).mockResolvedValue(false);
  vi.mocked(isPostSaved).mockResolvedValue(false);
  vi.mocked(likePostWithSync).mockResolvedValue();
});

it('survives StrictMode effect replay and retains a pending choice across count updates', async () => {
  const { result, rerender } = renderHook(({ count }) => usePostEngagement('p1', 'ana', count), {
    initialProps: { count: 2 },
    wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
  });
  await waitFor(() => expect(result.current.like.loaded).toBe(true));
  vi.mocked(likePostWithSync).mockRejectedValueOnce(new Error('timeout'));
  await act(() => result.current.act('like'));
  rerender({ count: 3 });
  expect(result.current.like.pending).toBe(true);
  await act(() => result.current.act('like'));
  expect(vi.mocked(likePostWithSync).mock.calls).toEqual([
    ['p1', 'ana'],
    ['p1', 'ana'],
  ]);
  expect(result.current.like.value).toBe(true);
  expect(result.current.like.count).toBe(3);
});

it('isolates delayed mutations and errors from another account or post', async () => {
  let reject!: (error: Error) => void;
  const { result, rerender } = renderHook(({ uid, post }) => usePostEngagement(post, uid, 2), {
    initialProps: { uid: 'ana', post: 'p1' },
  });
  await waitFor(() => expect(result.current.like.loaded).toBe(true));
  vi.mocked(likePostWithSync).mockReturnValueOnce(
    new Promise((_yes, no) => {
      reject = no;
    }),
  );
  let sending: Promise<void>;
  act(() => {
    sending = result.current.act('like');
  });
  rerender({ uid: 'bruno', post: 'p2' });
  await waitFor(() => expect(result.current.like.loaded).toBe(true));
  await act(async () => {
    reject(new Error('old account'));
    await sending;
  });
  expect(result.current.like).toMatchObject({ value: false, count: 2, error: null });
  expect(likePostWithSync).toHaveBeenCalledWith('p1', 'ana');
});
