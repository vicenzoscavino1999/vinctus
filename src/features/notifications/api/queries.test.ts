import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityRead, PaginatedResult } from '@/features/notifications/api/types';
import { AppError } from '@/shared/lib/errors';

const firestoreSdkMock = vi.hoisted(() => ({
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  query: vi.fn((ref: { path: string }) => ({ path: ref.path })),
  where: vi.fn(() => ({ type: 'where' })),
  orderBy: vi.fn(() => ({ type: 'orderBy' })),
  limit: vi.fn(() => ({ type: 'limit' })),
  getDocs: vi.fn(),
}));

vi.mock('firebase/firestore', () => firestoreSdkMock);
vi.mock('@/shared/lib/firebase', () => ({ db: { name: 'mock-db' } }));
vi.mock('@/shared/lib/firestore', () => ({
  getUserActivity: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');
const { getUnreadNotificationBadgeCount, getUserActivity } =
  await import('@/features/notifications/api/queries');

const emptyActivityPage: PaginatedResult<ActivityRead> = {
  items: [],
  lastDoc: null,
  hasMore: false,
};

const makeSnap = (docs: Array<{ id: string; data?: Record<string, unknown> }>) => ({
  size: docs.length,
  docs: docs.map((entry) => ({
    id: entry.id,
    data: () => entry.data ?? {},
  })),
});

describe('notifications api queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sanitizes page size when reading activity', async () => {
    vi.mocked(firestore.getUserActivity).mockResolvedValueOnce(emptyActivityPage);

    await expect(getUserActivity('user_1', 999)).resolves.toEqual(emptyActivityPage);
    expect(firestore.getUserActivity).toHaveBeenCalledWith('user_1', 50, undefined);
  });

  it('rejects invalid uid before querying', async () => {
    const task = getUserActivity('', 20);
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.getUserActivity).not.toHaveBeenCalled();

    const badgeTask = getUnreadNotificationBadgeCount('');
    await expect(badgeTask).rejects.toBeInstanceOf(AppError);
    await expect(badgeTask).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestoreSdkMock.getDocs).not.toHaveBeenCalled();
  });

  it('maps source permission errors to AppError', async () => {
    vi.mocked(firestore.getUserActivity).mockRejectedValueOnce({
      code: 'permission-denied',
      message: 'Denied',
    });

    const task = getUserActivity('user_1', 20);
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('computes unread notification badge count excluding read items and blocked senders', async () => {
    firestoreSdkMock.getDocs.mockImplementation(async (target: { path: string }) => {
      switch (target.path) {
        case 'users/user_1/blockedUsers':
          return makeSnap([{ id: 'blocked_user' }]);
        case 'notifications':
          return makeSnap([
            { id: 'n1', data: { fromUid: 'alice', read: false } },
            { id: 'n2', data: { fromUid: 'alice', read: true } },
            { id: 'n3', data: { fromUid: 'blocked_user', read: false } },
          ]);
        case 'follow_requests':
          return makeSnap([
            { id: 'f1', data: { fromUid: 'bob' } },
            { id: 'f2', data: { fromUid: 'blocked_user' } },
          ]);
        case 'group_requests':
          return makeSnap([{ id: 'g1', data: { fromUid: 'carol' } }]);
        case 'collaboration_requests':
          return makeSnap([
            { id: 'c1', data: { fromUid: 'dave' } },
            { id: 'c2', data: { fromUid: 'blocked_user' } },
          ]);
        default:
          return makeSnap([]);
      }
    });

    await expect(getUnreadNotificationBadgeCount('user_1')).resolves.toBe(4);
  });

  it('returns partial badge counts when one source query fails', async () => {
    firestoreSdkMock.getDocs.mockImplementation(async (target: { path: string }) => {
      if (target.path === 'group_requests') {
        throw new Error('temporary index issue');
      }
      if (target.path === 'notifications') {
        return makeSnap([{ id: 'n1', data: { fromUid: 'alice', read: false } }]);
      }
      if (target.path === 'follow_requests') {
        return makeSnap([{ id: 'f1', data: { fromUid: 'bob' } }]);
      }
      return makeSnap([]);
    });

    await expect(getUnreadNotificationBadgeCount('user_1')).resolves.toBe(2);
  });
});
