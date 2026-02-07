import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import {
  getEventAttendeeCount,
  getUpcomingEvents,
  isEventAttendee,
} from '@/features/events/api/queries';

vi.mock('@/shared/lib/firestore', () => ({
  getEventAttendeeCount: vi.fn(),
  getUpcomingEvents: vi.fn(),
  isEventAttendee: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

describe('events api queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sanitizes upcoming events limit before querying', async () => {
    vi.mocked(firestore.getUpcomingEvents).mockResolvedValueOnce([]);

    await expect(getUpcomingEvents(999)).resolves.toEqual([]);
    expect(firestore.getUpcomingEvents).toHaveBeenCalledWith(50);
  });

  it('validates ids before attendee checks', async () => {
    const task = isEventAttendee('', 'user_1');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.isEventAttendee).not.toHaveBeenCalled();
  });

  it('returns attendee status with validated ids', async () => {
    vi.mocked(firestore.isEventAttendee).mockResolvedValueOnce(true);

    await expect(isEventAttendee('event_1', 'user_1')).resolves.toBe(true);
    expect(firestore.isEventAttendee).toHaveBeenCalledWith('event_1', 'user_1');
  });

  it('maps source errors to AppError', async () => {
    vi.mocked(firestore.getEventAttendeeCount).mockRejectedValueOnce({
      code: 'permission-denied',
      message: 'Denied',
    });

    const task = getEventAttendeeCount('event_1');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
