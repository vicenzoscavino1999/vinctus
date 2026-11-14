import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runTransaction } from 'firebase/firestore';
import { createPostUploading, updatePost } from './firestore-post-upload';

describe('post upload transaction invariants', () => {
  let data: Record<string, unknown> | null;
  const set = vi.fn();
  const update = vi.fn();
  const input = {
    postId: 'p1',
    authorId: 'ana',
    authorSnapshot: { displayName: 'Ana', photoURL: null },
    text: 'Hola',
    groupId: 'g1',
  };
  beforeEach(() => {
    vi.clearAllMocks();
    data = null;
    vi.mocked(runTransaction).mockImplementation(async (_db, operation) => {
      const tx = {
        get: async () => ({ exists: () => data !== null, data: () => data }),
        set: (_ref: unknown, value: Record<string, unknown>) => {
          set(value);
          data = value;
        },
        update: (_ref: unknown, patch: Record<string, unknown>) => {
          update(patch);
          data = { ...data, ...patch };
        },
      };
      return operation(tx as unknown as Parameters<typeof operation>[0]);
    });
  });

  it('creation retries preserve counters, timestamps and accepted media', async () => {
    await createPostUploading(input);
    const created = data;
    data = { ...data, status: 'ready', likeCount: 7, commentCount: 9, media: [{ path: 'photo' }] };
    const accepted = data;
    await createPostUploading(input);
    expect(set).toHaveBeenCalledTimes(1);
    expect(data).toBe(accepted);
    expect(data?.createdAt).toBe(created?.createdAt);
  });

  it('a late failure or repeated finalization cannot downgrade ready', async () => {
    await createPostUploading(input);
    await updatePost('p1', { status: 'ready', media: [{ path: 'photo' }] });
    const accepted = data;
    await updatePost('p1', { status: 'failed', media: [] });
    await updatePost('p1', { status: 'ready', media: [] });
    expect(update).toHaveBeenCalledTimes(1);
    expect(data).toBe(accepted);
    expect(data?.media).toEqual([{ path: 'photo' }]);
  });

  it.each([{ authorId: 'bruno' }, { groupId: 'g2' }, { text: 'Otro' }, { title: 'Otro' }])(
    'rejects a changed immutable draft: %j',
    async (changed) => {
      await createPostUploading(input);
      await expect(createPostUploading({ ...input, ...changed })).rejects.toThrow('no coincide');
      expect(set).toHaveBeenCalledTimes(1);
    },
  );
});
