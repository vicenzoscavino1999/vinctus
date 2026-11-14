import { beforeEach, expect, it, vi } from 'vitest';
import { getSavedPostsRaw } from './savedPosts';
import { readPostRecords } from '@/shared/lib/post-reads-client';

vi.mock('@/shared/lib/firebase', () => ({ auth: { currentUser: { uid: 'ana' } } }));
vi.mock('@/shared/lib/post-reads-client', () => ({ readPostRecords: vi.fn() }));
vi.mock('@/shared/lib/firestore/posts', () => ({
  normalizePostRead: (id: string, data: Record<string, unknown>) => ({ ...data, postId: id }),
}));
const page = { items: [], lastDoc: null, hasMore: false, weeklyPosts: 0 };
beforeEach(() => vi.clearAllMocks());

it('advances an opaque cursor even when a page has no visible saved posts', async () => {
  const cursor = 'a'.repeat(32);
  vi.mocked(readPostRecords).mockResolvedValueOnce({ ...page, lastDoc: cursor, hasMore: true });
  const first = await getSavedPostsRaw('ana', 1);
  expect(first).toEqual({ items: [], lastDoc: cursor, hasMore: true });
  vi.mocked(readPostRecords).mockResolvedValueOnce({
    ...page,
    items: [{ id: 'p1', authorId: 'a', content: 'Hola' }],
  });
  const second = await getSavedPostsRaw('ana', 1, first.lastDoc!);
  expect(second.items.map((post) => post.postId)).toEqual(['p1']);
  expect(readPostRecords).toHaveBeenLastCalledWith({ view: 'saved', limit: 1, cursor });
});

it('does not request another account and does not fall back to direct Firestore after an error', async () => {
  await expect(getSavedPostsRaw('other')).rejects.toThrow();
  expect(readPostRecords).not.toHaveBeenCalled();
  vi.mocked(readPostRecords).mockRejectedValueOnce(new Error('permission-denied'));
  await expect(getSavedPostsRaw('ana')).rejects.toThrow('permission-denied');
});
