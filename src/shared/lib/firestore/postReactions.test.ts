import { beforeEach, describe, expect, it, vi } from 'vitest';
import { doc, getDocFromServer, runTransaction } from 'firebase/firestore';
import { likePostWithSync, isPostLiked } from './postEngagement';
import { savePostWithSync, isPostSaved } from './savedItems';
import { getPost } from './posts';

vi.mock('./posts', () => ({ getPost: vi.fn(async () => null) }));
vi.mock('./profile', () => ({ getUserProfile: vi.fn(async () => null) }));

describe('idempotent post reactions', () => {
  let documents: Map<string, Record<string, unknown>>;
  const writes = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    documents = new Map([['posts/p1', { status: 'ready' }]]);
    vi.mocked(doc).mockImplementation(((...args: unknown[]) => ({
      path: args.slice(1).join('/'),
    })) as typeof doc);
    vi.mocked(runTransaction).mockImplementation(async (_db, operation) => {
      const tx = {
        get: async (ref: { path: string }) => {
          const data = documents.get(ref.path);
          return { exists: () => data !== undefined, data: () => data };
        },
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          writes(ref.path);
          documents.set(ref.path, data);
        },
      };
      return operation(tx as unknown as Parameters<typeof operation>[0]);
    });
  });

  it('preserves the like timestamp and only repairs a missing private index', async () => {
    await likePostWithSync('p1', 'ana');
    const like = documents.get('posts/p1/likes/ana');
    const index = documents.get('users/ana/likes/p1');
    await likePostWithSync('p1', 'ana');
    expect(writes).toHaveBeenCalledTimes(2);
    expect(documents.get('posts/p1/likes/ana')).toBe(like);
    expect(documents.get('users/ana/likes/p1')).toBe(index);
    expect(getPost).toHaveBeenCalledTimes(1);
    documents.delete('users/ana/likes/p1');
    await likePostWithSync('p1', 'ana');
    expect(documents.get('posts/p1/likes/ana')).toBe(like);
    expect(documents.has('users/ana/likes/p1')).toBe(true);
    expect(writes).toHaveBeenCalledTimes(3);
  });

  it('preserves the saved timestamp and ordering on retry', async () => {
    await savePostWithSync('p1', 'ana');
    const saved = documents.get('users/ana/savedPosts/p1');
    await savePostWithSync('p1', 'ana');
    expect(writes).toHaveBeenCalledTimes(1);
    expect(documents.get('users/ana/savedPosts/p1')).toBe(saved);
  });

  it.each([undefined, 'uploading', 'failed'])(
    'rejects reactions to a missing or unfinished post: %s',
    async (status) => {
      if (status) documents.set('posts/p1', { status });
      else documents.delete('posts/p1');
      await expect(likePostWithSync('p1', 'ana')).rejects.toThrow('disponible');
      await expect(savePostWithSync('p1', 'ana')).rejects.toThrow('disponible');
      expect(writes).not.toHaveBeenCalled();
    },
  );

  it('does not treat a server read error as an absent reaction', async () => {
    vi.mocked(getDocFromServer).mockRejectedValueOnce(new Error('offline'));
    await expect(isPostLiked('p1', 'ana')).rejects.toThrow('offline');
    vi.mocked(getDocFromServer).mockRejectedValueOnce(new Error('offline'));
    await expect(isPostSaved('p1', 'ana')).rejects.toThrow('offline');
  });
});
