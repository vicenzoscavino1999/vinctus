import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostEngagementSession, reactionLabel, type ReactionIO } from './PostEngagementSession';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe('post/account reaction sessions', () => {
  let io: ReactionIO;
  let session: PostEngagementSession;
  beforeEach(() => {
    io = { read: vi.fn(async () => false), write: vi.fn(async () => {}) };
    session = new PostEngagementSession('p1', 'ana', io);
    session.open();
  });

  it('keeps a failed lookup unknown and retries the lookup without writing', async () => {
    vi.mocked(io.read).mockRejectedValueOnce(new Error('offline'));
    await session.load('like', 4);
    expect(session.getSnapshot().like.value).toBeNull();
    expect(reactionLabel('like', session.getSnapshot().like)).toContain('Reintentar consulta');
    vi.mocked(io.read).mockResolvedValueOnce(true);
    await session.act('like');
    expect(io.write).not.toHaveBeenCalled();
    expect(session.getSnapshot().like).toMatchObject({ value: true, count: 4, error: null });
  });

  it('does not add an existing like to the server total a second time', async () => {
    vi.mocked(io.read).mockResolvedValue(true);
    await session.load('like', 4);
    expect(session.getSnapshot().like.count).toBe(4);
    await session.act('like');
    expect(io.write).toHaveBeenCalledWith('like', false, 'p1', 'ana');
    expect(session.getSnapshot().like.count).toBe(3);
  });

  it('blocks double taps and reloads until the pending write finishes', async () => {
    await session.load('like', 2);
    const gate = deferred<void>();
    vi.mocked(io.write).mockReturnValueOnce(gate.promise);
    const first = session.act('like');
    await session.act('like');
    await session.load('like', 99, true);
    expect(io.write).toHaveBeenCalledTimes(1);
    expect(io.read).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().like.count).toBe(3);
    gate.resolve();
    await first;
    expect(session.getSnapshot().like.loading).toBe(false);
  });

  it.each(['like', 'save'] as const)(
    'retries an unconfirmed %s as the same desired state',
    async (kind) => {
      await session.load(kind, 0);
      vi.mocked(io.write).mockRejectedValueOnce(new Error('lost acknowledgement'));
      await session.act(kind);
      expect(session.getSnapshot()[kind]).toMatchObject({
        value: false,
        pending: true,
        loading: false,
      });
      expect(reactionLabel(kind, session.getSnapshot()[kind])).toContain('Reintentar');
      await session.act(kind);
      expect(vi.mocked(io.write).mock.calls.map((call) => call[1])).toEqual([true, true]);
      expect(session.getSnapshot()[kind]).toMatchObject({ value: true, error: null });
      expect(session.getSnapshot()[kind].pending).toBeUndefined();
    },
  );

  it('restores the exact zero total after a failed unlike and retries false', async () => {
    vi.mocked(io.read).mockResolvedValueOnce(true);
    await session.load('like', 0);
    vi.mocked(io.write).mockRejectedValueOnce(new Error('lost acknowledgement'));
    await session.act('like');
    expect(session.getSnapshot().like).toMatchObject({ value: true, count: 0, pending: false });
    expect(reactionLabel('like', session.getSnapshot().like)).toBe('Reintentar quitar me gusta');
    await session.act('like');
    expect(vi.mocked(io.write).mock.calls.map((call) => call[1])).toEqual([false, false]);
    expect(session.getSnapshot().like.count).toBe(0);
  });

  it('keeps likes and saves independent', async () => {
    await Promise.all([session.load('like', 2), session.load('save', 0)]);
    const gate = deferred<void>();
    vi.mocked(io.write).mockReturnValueOnce(gate.promise);
    const like = session.act('like');
    await session.act('save');
    expect(session.getSnapshot().save.value).toBe(true);
    expect(session.getSnapshot().like.loading).toBe(true);
    gate.resolve();
    await like;
  });

  it('ignores late reads and writes from a closed session, including effect replay', async () => {
    const read = deferred<boolean>();
    vi.mocked(io.read).mockReturnValueOnce(read.promise);
    const oldRead = session.load('like', 90);
    session.close();
    session.open();
    await session.load('like', 2);
    read.resolve(true);
    await oldRead;
    expect(session.getSnapshot().like).toMatchObject({ value: false, count: 2 });
    const write = deferred<void>();
    vi.mocked(io.write).mockReturnValueOnce(write.promise);
    const oldWrite = session.act('like');
    session.close();
    session.open();
    await session.load('like', 1);
    write.reject(new Error('old account'));
    await oldWrite;
    expect(session.getSnapshot().like).toMatchObject({ value: false, count: 1, error: null });
  });

  it('never sends anonymous preferences to Firebase', async () => {
    const anonymous = new PostEngagementSession('p1', undefined, io);
    anonymous.open();
    await anonymous.load('like', 4);
    await anonymous.act('like');
    expect(anonymous.getSnapshot().like.count).toBe(4);
    expect(io.read).not.toHaveBeenCalled();
    expect(io.write).not.toHaveBeenCalled();
  });
});
