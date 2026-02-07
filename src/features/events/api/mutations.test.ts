import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import {
  createEvent,
  deleteEvent,
  joinEvent,
  leaveEvent,
  updateEvent,
} from '@/features/events/api/mutations';
import type { CreateEventInput } from '@/features/events/api/types';

vi.mock('@/shared/lib/firestore', () => ({
  createEvent: vi.fn(),
  deleteEvent: vi.fn(),
  joinEvent: vi.fn(),
  leaveEvent: vi.fn(),
  updateEvent: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

const validEventInput: CreateEventInput = {
  title: 'Evento de prueba',
  description: 'Descripcion',
  startAt: new Date('2026-02-06T10:00:00.000Z'),
  endAt: new Date('2026-02-06T11:00:00.000Z'),
  city: 'Lima',
  venue: 'Barranco',
  capacity: 100,
  visibility: 'public',
  coverUrl: null,
};

describe('events api mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates and normalizes create event payload', async () => {
    vi.mocked(firestore.createEvent).mockResolvedValueOnce('event_1');

    await expect(
      createEvent('user_1', {
        ...validEventInput,
        title: '  Evento de prueba  ',
        description: '   ',
        city: '  Lima  ',
        venue: '   ',
      }),
    ).resolves.toBe('event_1');

    expect(firestore.createEvent).toHaveBeenCalledWith('user_1', {
      ...validEventInput,
      title: 'Evento de prueba',
      description: null,
      city: 'Lima',
      venue: null,
      coverUrl: null,
    });
  });

  it('retries transient update failures', async () => {
    vi.mocked(firestore.updateEvent)
      .mockRejectedValueOnce({ code: 'network-request-failed', message: 'offline' })
      .mockResolvedValueOnce();

    await expect(updateEvent('event_1', validEventInput)).resolves.toBeUndefined();
    expect(firestore.updateEvent).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid create event payload', async () => {
    const task = createEvent('user_1', {
      ...validEventInput,
      title: '   ',
    });

    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.createEvent).not.toHaveBeenCalled();
  });

  it('validates ids for join and delete operations', async () => {
    const joinTask = joinEvent('', 'user_1');
    const deleteTask = deleteEvent('');

    await expect(joinTask).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(deleteTask).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.joinEvent).not.toHaveBeenCalled();
    expect(firestore.deleteEvent).not.toHaveBeenCalled();
  });

  it('normalizes nullable fields and optional endAt', async () => {
    vi.mocked(firestore.createEvent).mockResolvedValueOnce('event_2');
    vi.mocked(firestore.leaveEvent).mockResolvedValueOnce();

    await expect(
      createEvent('user_1', {
        title: 'Evento sin fin',
        description: null,
        startAt: new Date('2026-02-06T10:00:00.000Z'),
        city: null,
        venue: null,
        capacity: null,
        visibility: 'public',
      }),
    ).resolves.toBe('event_2');

    expect(firestore.createEvent).toHaveBeenCalledWith('user_1', {
      title: 'Evento sin fin',
      description: null,
      startAt: new Date('2026-02-06T10:00:00.000Z'),
      endAt: null,
      city: null,
      venue: null,
      capacity: null,
      visibility: 'public',
      coverUrl: null,
    });

    await expect(leaveEvent('event_2', 'user_1')).resolves.toBeUndefined();
    expect(firestore.leaveEvent).toHaveBeenCalledWith('event_2', 'user_1');
  });
});
