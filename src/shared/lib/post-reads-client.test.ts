import { beforeEach, expect, it, vi } from 'vitest';
import { readPostRecords } from './post-reads-client';
const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'a' } as { uid: string; isAnonymous?: boolean } | null },
  call: vi.fn(),
}));
vi.mock('@/shared/lib/firebase', () => ({ auth: mocks.auth, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => mocks.call }));
vi.mock('firebase/firestore', async (importOriginal) => await importOriginal());
beforeEach(() => {
  mocks.auth.currentUser = { uid: 'a' };
  mocks.call.mockReset();
});
it.each([null, { uid: 'guest', isAnonymous: true }])(
  'requires account login before requesting any public post page',
  async (user) => {
    mocks.auth.currentUser = user;
    await expect(readPostRecords({ view: 'feed' })).rejects.toThrow();
    expect(mocks.call).not.toHaveBeenCalled();
  },
);
it('hydrates timestamp precision and opaque cursors', async () => {
  mocks.call.mockResolvedValue({
    data: {
      items: [{ id: 'p', createdAt: { seconds: 17, nanoseconds: 42 } }],
      cursor: 'b'.repeat(32),
      hasMore: true,
    },
  });
  const result = await readPostRecords({ view: 'feed' });
  expect(result.items[0].createdAt).toMatchObject({ seconds: 17, nanoseconds: 42 });
  expect(result.lastDoc).toBe('b'.repeat(32));
});
it('rejects late data from the previous account', async () => {
  mocks.call.mockImplementation(async () => {
    mocks.auth.currentUser = { uid: 'b' };
    return { data: { items: [{ id: 'private' }], cursor: null, hasMore: false } };
  });
  await expect(readPostRecords({ view: 'feed' })).rejects.toThrow();
});
it.each([
  {},
  { items: [], cursor: 'raw-document-id', hasMore: true },
  { items: [], cursor: null, hasMore: true },
])('rejects malformed pages without a direct Firestore fallback', async (data) => {
  mocks.call.mockResolvedValue({ data });
  await expect(readPostRecords({ view: 'feed' })).rejects.toThrow();
});
