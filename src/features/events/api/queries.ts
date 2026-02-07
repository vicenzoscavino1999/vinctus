import {
  getEventAttendeeCount as getEventAttendeeCountRaw,
  getUpcomingEvents as getUpcomingEventsRaw,
  isEventAttendee as isEventAttendeeRaw,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { safeLimit, validate } from '@/shared/lib/validators';
import {
  eventIdSchema,
  eventPageLimitSchema,
  uidSchema,
  type FirestoreEvent,
} from '@/features/events/api/types';

const READ_TIMEOUT_MS = 5000;
const READ_RETRYABLE_CODES = [
  'TIMEOUT',
  'NETWORK',
  'deadline-exceeded',
  'unavailable',
  'aborted',
] as const;

const runRead = async <T>(operation: string, fn: () => Promise<T>): Promise<T> => {
  try {
    return await withRetry(() => withTimeout(fn(), READ_TIMEOUT_MS, { operation }), {
      retries: 2,
      backoffMs: 150,
      retryableCodes: READ_RETRYABLE_CODES,
    });
  } catch (error) {
    throw toAppError(error, { operation });
  }
};

export const getUpcomingEvents = async (limitCount: number = 30): Promise<FirestoreEvent[]> => {
  const safeLimitCount = validate(eventPageLimitSchema, safeLimit(limitCount, 30), {
    field: 'limitCount',
  });
  return runRead('events.getUpcomingEvents', () => getUpcomingEventsRaw(safeLimitCount));
};

export const isEventAttendee = async (eventId: string, uid: string): Promise<boolean> => {
  const safeEventId = validate(eventIdSchema, eventId, { field: 'eventId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runRead('events.isEventAttendee', () => isEventAttendeeRaw(safeEventId, safeUid));
};

export const getEventAttendeeCount = async (eventId: string): Promise<number> => {
  const safeEventId = validate(eventIdSchema, eventId, { field: 'eventId' });
  return runRead('events.getEventAttendeeCount', () => getEventAttendeeCountRaw(safeEventId));
};
