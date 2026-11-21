import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';

const firestoreSdkMock = vi.hoisted(() => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('firebase/firestore', () => firestoreSdkMock);
vi.mock('@/shared/lib/firebase', () => ({ db: { name: 'mock-db' } }));

const {
  NOTIFICATIONS_UPDATED_EVENT,
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
  notifyNotificationsUpdated,
} = await import('@/features/notifications/api/mutations');

describe('notifications api mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks a notification as read or unread and validates notificationId', async () => {
    firestoreSdkMock.updateDoc.mockResolvedValue(undefined);

    await markNotificationRead('notif-1');
    expect(firestoreSdkMock.updateDoc).toHaveBeenCalledWith(
      { path: 'notifications/notif-1' },
      { read: true },
    );

    await markNotificationRead('notif-2', false);
    expect(firestoreSdkMock.updateDoc).toHaveBeenCalledWith(
      { path: 'notifications/notif-2' },
      { read: false },
    );

    const invalidTask = markNotificationRead('   ');
    await expect(invalidTask).rejects.toBeInstanceOf(AppError);
    await expect(invalidTask).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('deduplicates and chunks markAllNotificationsRead writes across batches', async () => {
    const batchInstances: Array<{
      update: ReturnType<typeof vi.fn>;
      commit: ReturnType<typeof vi.fn>;
    }> = [];
    firestoreSdkMock.writeBatch.mockImplementation(() => {
      const batch = {
        update: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      };
      batchInstances.push(batch);
      return batch;
    });

    await markAllNotificationsRead(['   ', '']);
    expect(firestoreSdkMock.writeBatch).not.toHaveBeenCalled();

    await markAllNotificationsRead(['n-1', 'n-2', 'n-1', ' n-2 ']);
    expect(batchInstances).toHaveLength(1);
    expect(batchInstances[0].update).toHaveBeenCalledTimes(2);
    expect(batchInstances[0].commit).toHaveBeenCalledTimes(1);

    // 451 unique IDs should split into 2 batches (450 + 1)
    batchInstances.length = 0;
    const largeList = Array.from({ length: 451 }, (_, index) => `notif-${index}`);
    await markAllNotificationsRead(largeList);
    expect(batchInstances).toHaveLength(2);
    expect(batchInstances[0].update).toHaveBeenCalledTimes(450);
    expect(batchInstances[1].update).toHaveBeenCalledTimes(1);
  });

  it('deletes a notification and maps Firestore errors to AppError', async () => {
    firestoreSdkMock.deleteDoc.mockResolvedValueOnce(undefined);
    await deleteNotification('notif-1');
    expect(firestoreSdkMock.deleteDoc).toHaveBeenCalledWith({ path: 'notifications/notif-1' });

    firestoreSdkMock.deleteDoc.mockRejectedValueOnce({
      code: 'permission-denied',
      message: 'Denied',
    });
    const failedTask = deleteNotification('notif-2');
    await expect(failedTask).rejects.toBeInstanceOf(AppError);
    await expect(failedTask).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('dispatches NOTIFICATIONS_UPDATED_EVENT on window', () => {
    const listener = vi.fn();
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, listener);
    notifyNotificationsUpdated();
    window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
