import {
  createEvent as createEventRaw,
  deleteEvent as deleteEventRaw,
  joinEvent as joinEventRaw,
  leaveEvent as leaveEventRaw,
  updateEvent as updateEventRaw,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate } from '@/shared/lib/validators';
import {
  createEventInputSchema,
  eventIdSchema,
  uidSchema,
  type CreateEventInput,
} from '@/features/events/api/types';

const WRITE_TIMEOUT_MS = 7000;
const WRITE_RETRYABLE_CODES = [
  'TIMEOUT',
  'NETWORK',
  'deadline-exceeded',
  'unavailable',
  'aborted',
  'resource-exhausted',
] as const;

const runWrite = async <T>(operation: string, fn: () => Promise<T>): Promise<T> => {
  try {
    return await withRetry(() => withTimeout(fn(), WRITE_TIMEOUT_MS, { operation }), {
      retries: 1,
      backoffMs: 200,
      retryableCodes: WRITE_RETRYABLE_CODES,
    });
  } catch (error) {
    throw toAppError(error, { operation });
  }
};

const normalizeNullableText = (value: string | null): string | null => {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeCreateEventInput = (input: CreateEventInput): CreateEventInput => ({
  ...input,
  title: input.title.trim(),
  description: normalizeNullableText(input.description),
  city: normalizeNullableText(input.city),
  venue: normalizeNullableText(input.venue),
  endAt: input.endAt ?? null,
  coverUrl: input.coverUrl ?? null,
});

export const createEvent = async (ownerId: string, input: CreateEventInput): Promise<string> => {
  const safeOwnerId = validate(uidSchema, ownerId, { field: 'ownerId' });
  const normalizedInput = normalizeCreateEventInput(input);
  const safeInput = validate(createEventInputSchema, normalizedInput, { field: 'input' });
  return runWrite('events.createEvent', () => createEventRaw(safeOwnerId, safeInput));
};

export const updateEvent = async (eventId: string, input: CreateEventInput): Promise<void> => {
  const safeEventId = validate(eventIdSchema, eventId, { field: 'eventId' });
  const normalizedInput = normalizeCreateEventInput(input);
  const safeInput = validate(createEventInputSchema, normalizedInput, { field: 'input' });
  return runWrite('events.updateEvent', () => updateEventRaw(safeEventId, safeInput));
};

export const joinEvent = async (eventId: string, uid: string): Promise<void> => {
  const safeEventId = validate(eventIdSchema, eventId, { field: 'eventId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runWrite('events.joinEvent', () => joinEventRaw(safeEventId, safeUid));
};

export const leaveEvent = async (eventId: string, uid: string): Promise<void> => {
  const safeEventId = validate(eventIdSchema, eventId, { field: 'eventId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runWrite('events.leaveEvent', () => leaveEventRaw(safeEventId, safeUid));
};

export const deleteEvent = async (eventId: string): Promise<void> => {
  const safeEventId = validate(eventIdSchema, eventId, { field: 'eventId' });
  return runWrite('events.deleteEvent', () => deleteEventRaw(safeEventId));
};
