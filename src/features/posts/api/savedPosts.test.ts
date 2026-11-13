import { beforeEach, expect, it, vi } from 'vitest';
import {
  doc,
  getDocFromServer,
  getDocsFromServer,
  startAfter,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { getSavedPostsRaw } from './savedPosts';

vi.mock('firebase/firestore', async (original) => ({
  ...(await original<typeof import('firebase/firestore')>()),
  collection: vi.fn(),
  doc: vi.fn(),
  getDocFromServer: vi.fn(),
  getDocsFromServer: vi.fn(),
  query: vi.fn((...args) => args[0]),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(doc).mockImplementation(((...args: unknown[]) => ({
    id: args[args.length - 1],
  })) as typeof doc);
});

it('uses the original saved index cursor even if every post in a page was removed', async () => {
  const removed = { id: 'removed' };
  const remaining = { id: 'p1' };
  vi.mocked(getDocsFromServer).mockResolvedValueOnce({
    docs: [removed, remaining],
    size: 2,
  } as never);
  vi.mocked(getDocFromServer).mockResolvedValueOnce({ exists: () => false } as never);
  const first = await getSavedPostsRaw('ana', 1);
  expect(first.items).toEqual([]);
  expect(first.hasMore).toBe(true);
  expect(first.lastDoc).toBe(removed);
  vi.mocked(getDocsFromServer).mockResolvedValueOnce({ docs: [remaining], size: 1 } as never);
  vi.mocked(getDocFromServer).mockResolvedValueOnce({
    id: 'p1',
    exists: () => true,
    data: () => ({ content: 'Hola', authorId: 'a', createdAt: new Date() }),
  } as never);
  const second = await getSavedPostsRaw('ana', 1, first.lastDoc as DocumentSnapshot);
  expect(second.items.map((post) => post.postId)).toEqual(['p1']);
  expect(second.hasMore).toBe(false);
  expect(startAfter).toHaveBeenCalledWith(removed);
});

it('hides unfinished posts and propagates lookup failures instead of silently dropping them', async () => {
  vi.mocked(getDocsFromServer).mockResolvedValue({ docs: [{ id: 'p1' }], size: 1 } as never);
  vi.mocked(getDocFromServer).mockResolvedValueOnce({
    id: 'p1',
    exists: () => true,
    data: () => ({ status: 'failed' }),
  } as never);
  expect((await getSavedPostsRaw('ana')).items).toEqual([]);
  vi.mocked(getDocFromServer).mockRejectedValueOnce(new Error('permission-denied'));
  await expect(getSavedPostsRaw('ana')).rejects.toThrow('permission-denied');
});
