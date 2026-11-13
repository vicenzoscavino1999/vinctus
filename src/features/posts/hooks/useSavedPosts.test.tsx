import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  getBlockedUsers,
  getSavedPosts,
  type PostRead,
  type PaginatedResult,
} from '@/features/posts/api';
import { useSavedPosts } from './useSavedPosts';

vi.mock('@/features/posts/api', () => ({ getSavedPosts: vi.fn(), getBlockedUsers: vi.fn() }));
const cursor = { id: 'gone' } as unknown as NonNullable<PaginatedResult<PostRead>['lastDoc']>;
const post = (id: string, authorId = 'ana') => ({ postId: id, authorId }) as PostRead;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getBlockedUsers).mockResolvedValue([]);
});

it('advances an empty page and retries a failed older page with its original cursor', async () => {
  vi.mocked(getSavedPosts).mockResolvedValueOnce({ items: [], lastDoc: cursor, hasMore: true });
  const { result } = renderHook(() => useSavedPosts('ana'));
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  vi.mocked(getSavedPosts).mockRejectedValueOnce(new Error('offline'));
  await act(() => result.current.load(true));
  expect(result.current.error).toBeTruthy();
  vi.mocked(getBlockedUsers).mockResolvedValue(['blocked']);
  vi.mocked(getSavedPosts).mockResolvedValueOnce({
    items: [post('p1'), post('hidden', 'blocked')],
    lastDoc: null,
    hasMore: false,
  });
  await act(() => result.current.retry());
  expect(result.current.items.map((item) => item.postId)).toEqual(['p1']);
  expect(
    vi
      .mocked(getSavedPosts)
      .mock.calls.slice(1)
      .map((call) => call[2]),
  ).toEqual([cursor, cursor]);
  expect(result.current.hasMore).toBe(false);
});

it('invalidates an older page on refresh and preserves visible posts when refresh fails', async () => {
  vi.mocked(getSavedPosts).mockResolvedValueOnce({
    items: [post('old')],
    lastDoc: cursor,
    hasMore: true,
  });
  const { result } = renderHook(() => useSavedPosts('ana'));
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  let resolve!: (page: PaginatedResult<PostRead>) => void;
  vi.mocked(getSavedPosts).mockReturnValueOnce(
    new Promise((yes) => {
      resolve = yes;
    }),
  );
  let older!: Promise<void>;
  act(() => {
    older = result.current.load(true);
  });
  await act(() => result.current.load(true));
  expect(getSavedPosts).toHaveBeenCalledTimes(2);
  vi.mocked(getSavedPosts).mockResolvedValueOnce({
    items: [post('fresh')],
    lastDoc: null,
    hasMore: false,
  });
  await act(() => result.current.load());
  await act(async () => {
    resolve({ items: [post('stale')], lastDoc: cursor, hasMore: true });
    await older;
  });
  expect(result.current.items.map((item) => item.postId)).toEqual(['fresh']);
  expect(result.current.hasMore).toBe(false);
  vi.mocked(getSavedPosts).mockRejectedValueOnce(new Error('offline'));
  await act(() => result.current.load());
  expect(result.current.items.map((item) => item.postId)).toEqual(['fresh']);
});
