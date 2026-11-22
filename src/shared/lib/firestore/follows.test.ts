import { beforeEach, describe, expect, it, vi } from 'vitest';

const docs = new Map<string, Record<string, unknown>>();
const batchDeletes: string[] = [];
const updateDocMock = vi.fn();
const setDocMock = vi.fn();
const deleteDocMock = vi.fn();

const docRef = (path: string) => ({ id: path.split('/').pop() ?? '', path });

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  doc: vi.fn((_db, ...segments: string[]) => docRef(segments.join('/'))),
  getDoc: vi.fn(async (ref: { id: string; path: string }) => {
    const data = docs.get(ref.path);
    return {
      id: ref.id,
      exists: () => data !== undefined,
      data: () => (data ? { ...data } : undefined),
    };
  }),
  getDocs: vi.fn(async () => ({ size: 0, docs: [] })),
  setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
    setDocMock(ref.path, data);
    docs.set(ref.path, data);
  }),
  updateDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
    updateDocMock(ref.path, data);
    const prev = docs.get(ref.path) ?? {};
    docs.set(ref.path, { ...prev, ...data });
  }),
  deleteDoc: vi.fn(async (ref: { path: string }) => {
    deleteDocMock(ref.path);
    docs.delete(ref.path);
  }),
  writeBatch: vi.fn(() => {
    const ops: Array<() => void> = [];
    return {
      delete: (ref: { path: string }) => {
        ops.push(() => {
          batchDeletes.push(ref.path);
          docs.delete(ref.path);
        });
      },
      commit: async () => {
        for (const op of ops) op();
      },
    };
  }),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
}));

vi.mock('firebase/firestore/lite', () => ({
  doc: vi.fn((_db, ...segments: string[]) => docRef(segments.join('/'))),
  getDoc: vi.fn(),
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

vi.mock('@/shared/lib/firebase', () => ({
  db: {},
  dbLite: {},
}));

vi.mock('@/shared/lib/devMetrics', () => ({
  trackFirestoreRead: vi.fn(),
  trackFirestoreWrite: vi.fn(),
}));

import { getFollowStatus, sendFollowRequest, unfollowUser } from '@/shared/lib/firestore/follows';

describe('follows firestore client helpers', () => {
  beforeEach(() => {
    docs.clear();
    batchDeletes.length = 0;
    vi.clearAllMocks();
  });

  it('preserves pending incoming follow requests when already following or viewing a public user', async () => {
    docs.set('users/user_b/followers/user_a', { uid: 'user_a' });
    docs.set('follow_requests/user_b_user_a', { status: 'pending' });

    await expect(getFollowStatus('user_a', 'user_b', 'public')).resolves.toEqual({
      status: 'following',
      isMutual: false,
      hasIncomingRequest: true,
      incomingRequestId: 'user_b_user_a',
    });

    docs.delete('users/user_b/followers/user_a');
    await expect(getFollowStatus('user_a', 'user_b', 'public')).resolves.toEqual({
      status: 'pending_received',
      requestId: 'user_b_user_a',
      hasIncomingRequest: true,
      incomingRequestId: 'user_b_user_a',
    });
  });

  it('skips duplicate writes on already pending follow requests and rejects self-requests', async () => {
    await expect(sendFollowRequest('user_a', 'user_a')).rejects.toThrow(/mismo/i);

    docs.set('follow_requests/user_a_user_b', { status: 'pending' });
    await expect(sendFollowRequest('user_a', 'user_b')).resolves.toBe('user_a_user_b');
    expect(updateDocMock).not.toHaveBeenCalled();

    docs.set('follow_requests/user_a_user_b', { status: 'declined' });
    await expect(sendFollowRequest('user_a', 'user_b')).resolves.toBe('user_a_user_b');
    expect(updateDocMock).toHaveBeenCalledWith(
      'follow_requests/user_a_user_b',
      expect.objectContaining({ status: 'pending' }),
    );
  });

  it('removes follow edges and cleans up any prior accepted follow request on unfollow', async () => {
    docs.set('users/user_b/followers/user_a', { uid: 'user_a' });
    docs.set('users/user_a/following/user_b', { uid: 'user_b' });
    docs.set('follow_requests/user_a_user_b', { status: 'accepted' });

    await unfollowUser('user_a', 'user_b');

    expect(batchDeletes).toEqual([
      'users/user_b/followers/user_a',
      'users/user_a/following/user_b',
    ]);
    expect(deleteDocMock).toHaveBeenCalledWith('follow_requests/user_a_user_b');
    expect(docs.has('follow_requests/user_a_user_b')).toBe(false);
  });
});
