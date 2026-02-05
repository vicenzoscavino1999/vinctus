import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  limitToLast,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';

import { db } from '@/shared/lib/firebase';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { safeLimitSchema, validate, z } from '@/shared/lib/validators';

import type { FirestoreEvent } from './types';

const DEFAULT_LIMIT = 30;
const READ_TIMEOUT_MS = 5000;

const firestoreIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !value.includes('/'), { message: 'Invalid Firestore ID' });

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return null;
};

const nullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  return value;
};

const nullableNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
};

const buildFirestoreEvent = (eventId: string, data: unknown): FirestoreEvent => {
  const record: Record<string, unknown> =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

  return {
    id: eventId,
    title: typeof record.title === 'string' ? record.title : '',
    description: nullableString(record.description),
    startAt: toDate(record.startAt),
    endAt: toDate(record.endAt),
    city: nullableString(record.city),
    venue: nullableString(record.venue),
    capacity: nullableNumber(record.capacity),
    attendeesCount: nullableNumber(record.attendeesCount),
    visibility: record.visibility === 'private' ? 'private' : 'public',
    createdBy: typeof record.createdBy === 'string' ? record.createdBy : '',
    coverUrl: nullableString(record.coverUrl),
    createdAt: toDate(record.createdAt),
    updatedAt: toDate(record.updatedAt),
  };
};

const mapSnapshot = (docs: Array<{ id: string; data: () => unknown }>): FirestoreEvent[] =>
  docs.map((docSnap) => buildFirestoreEvent(docSnap.id, docSnap.data()));

export const getUpcomingEvents = async (
  limitCount: number = DEFAULT_LIMIT,
): Promise<FirestoreEvent[]> => {
  const safeLimit = validate(safeLimitSchema, limitCount, { context: { limitCount } });
  const now = Timestamp.now();

  const upcomingQuery = query(
    collection(db, 'events'),
    where('visibility', '==', 'public'),
    where('startAt', '>=', now),
    orderBy('startAt', 'asc'),
    limit(safeLimit),
  );

  try {
    const upcomingSnap = await withTimeout(
      withRetry(() => getDocs(upcomingQuery), {
        context: { op: 'events.getUpcomingEvents.upcoming' },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'events.getUpcomingEvents.upcoming' } },
    );
    trackFirestoreRead('events.getUpcomingEvents.upcoming', upcomingSnap.size);

    if (!upcomingSnap.empty) {
      return mapSnapshot(upcomingSnap.docs);
    }

    const recentSnap = await withTimeout(
      withRetry(
        () =>
          getDocs(
            query(
              collection(db, 'events'),
              where('visibility', '==', 'public'),
              orderBy('startAt', 'asc'),
              limitToLast(safeLimit),
            ),
          ),
        { context: { op: 'events.getUpcomingEvents.recent' } },
      ),
      READ_TIMEOUT_MS,
      { context: { op: 'events.getUpcomingEvents.recent' } },
    );
    trackFirestoreRead('events.getUpcomingEvents.recent', recentSnap.size);
    return mapSnapshot(recentSnap.docs);
  } catch (error) {
    const appError = toAppError(error, { context: { op: 'events.getUpcomingEvents' } });
    const externalCode =
      typeof appError.context?.externalCode === 'string' ? appError.context.externalCode : null;

    if (externalCode !== 'failed-precondition') {
      throw appError;
    }

    try {
      const fallbackScanLimit = Math.max(safeLimit * 3, safeLimit);
      const fallbackSnap = await withTimeout(
        withRetry(
          () =>
            getDocs(
              query(
                collection(db, 'events'),
                where('startAt', '>=', now),
                orderBy('startAt', 'asc'),
                limit(fallbackScanLimit),
              ),
            ),
          { context: { op: 'events.getUpcomingEvents.fallback' } },
        ),
        READ_TIMEOUT_MS,
        { context: { op: 'events.getUpcomingEvents.fallback' } },
      );
      trackFirestoreRead('events.getUpcomingEvents.fallback', fallbackSnap.size);

      return mapSnapshot(fallbackSnap.docs)
        .filter((event) => event.visibility === 'public')
        .slice(0, safeLimit);
    } catch (fallbackError) {
      throw toAppError(fallbackError, { context: { op: 'events.getUpcomingEvents.fallback' } });
    }
  }
};

export const isEventAttendee = async (eventId: string, uid: string): Promise<boolean> => {
  const safeEventId = validate(firestoreIdSchema, eventId, { context: { eventId } });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });

  try {
    const snap = await withTimeout(
      withRetry(() => getDoc(doc(db, 'events', safeEventId, 'attendees', safeUid)), {
        context: { op: 'events.isEventAttendee', eventId: safeEventId, uid: safeUid },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'events.isEventAttendee', eventId: safeEventId, uid: safeUid } },
    );
    trackFirestoreRead('events.isEventAttendee');
    return snap.exists();
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'events.isEventAttendee', eventId: safeEventId, uid: safeUid },
    });
  }
};

export const getEventAttendeeCount = async (eventId: string): Promise<number> => {
  const safeEventId = validate(firestoreIdSchema, eventId, { context: { eventId } });

  try {
    const snap = await withTimeout(
      withRetry(() => getCountFromServer(collection(db, 'events', safeEventId, 'attendees')), {
        context: { op: 'events.getEventAttendeeCount', eventId: safeEventId },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'events.getEventAttendeeCount', eventId: safeEventId } },
    );
    trackFirestoreRead('events.getEventAttendeeCount');
    return snap.data().count;
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'events.getEventAttendeeCount', eventId: safeEventId },
    });
  }
};
