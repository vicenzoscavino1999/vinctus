import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@/shared/lib/firebase';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { AppError, toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate, z } from '@/shared/lib/validators';

import type { CreateEventInput } from './types';

const WRITE_TIMEOUT_MS = 5000;
const READ_TIMEOUT_MS = 5000;

const firestoreIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !value.includes('/'), { message: 'Invalid Firestore ID' });

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable();

const createEventInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: nullableText(2000).optional(),
    startAt: z.date(),
    endAt: z.date().nullable().optional(),
    city: nullableText(80).optional(),
    venue: nullableText(120).optional(),
    capacity: z.number().int().min(0).max(100_000).nullable().optional(),
    visibility: z.enum(['public', 'private']),
    coverUrl: z
      .string()
      .trim()
      .max(500)
      .transform((value) => (value.length > 0 ? value : null))
      .nullable()
      .optional(),
  })
  .refine((input) => !input.endAt || input.endAt.getTime() >= input.startAt.getTime(), {
    message: 'endAt must be greater than or equal to startAt',
    path: ['endAt'],
  });

export const createEvent = async (ownerId: string, input: CreateEventInput): Promise<string> => {
  const safeOwnerId = validate(firestoreIdSchema, ownerId, { context: { ownerId } });
  const safeInput = validate(createEventInputSchema, input, {
    context: { op: 'events.createEvent', ownerId: safeOwnerId },
  });

  const eventRef = doc(collection(db, 'events'));
  const eventId = eventRef.id;
  const attendeeRef = doc(db, 'events', eventId, 'attendees', safeOwnerId);

  try {
    await withTimeout(
      withRetry(
        () =>
          setDoc(
            eventRef,
            {
              title: safeInput.title,
              description: safeInput.description ?? null,
              startAt: safeInput.startAt,
              endAt: safeInput.endAt ?? null,
              city: safeInput.city ?? null,
              venue: safeInput.venue ?? null,
              capacity: safeInput.capacity ?? null,
              visibility: safeInput.visibility,
              createdBy: safeOwnerId,
              coverUrl: safeInput.coverUrl ?? null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: false },
          ),
        { context: { op: 'events.createEvent.event', eventId, ownerId: safeOwnerId } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'events.createEvent.event', eventId, ownerId: safeOwnerId } },
    );

    await withTimeout(
      withRetry(
        () =>
          setDoc(
            attendeeRef,
            {
              uid: safeOwnerId,
              joinedAt: serverTimestamp(),
            },
            { merge: false },
          ),
        { context: { op: 'events.createEvent.attendee', eventId, ownerId: safeOwnerId } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'events.createEvent.attendee', eventId, ownerId: safeOwnerId } },
    );

    trackFirestoreWrite('events.createEvent', 2);
    return eventId;
  } catch (error) {
    await deleteDoc(eventRef).catch(() => {});
    throw toAppError(error, {
      context: { op: 'events.createEvent', eventId, ownerId: safeOwnerId },
    });
  }
};

export const updateEvent = async (eventId: string, input: CreateEventInput): Promise<void> => {
  const safeEventId = validate(firestoreIdSchema, eventId, { context: { eventId } });
  const safeInput = validate(createEventInputSchema, input, {
    context: { op: 'events.updateEvent', eventId: safeEventId },
  });

  try {
    await withTimeout(
      withRetry(
        () =>
          updateDoc(doc(db, 'events', safeEventId), {
            title: safeInput.title,
            description: safeInput.description ?? null,
            startAt: safeInput.startAt,
            endAt: safeInput.endAt ?? null,
            city: safeInput.city ?? null,
            venue: safeInput.venue ?? null,
            capacity: safeInput.capacity ?? null,
            visibility: safeInput.visibility,
            coverUrl: safeInput.coverUrl ?? null,
            updatedAt: serverTimestamp(),
          }),
        { context: { op: 'events.updateEvent', eventId: safeEventId } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'events.updateEvent', eventId: safeEventId } },
    );
    trackFirestoreWrite('events.updateEvent');
  } catch (error) {
    throw toAppError(error, { context: { op: 'events.updateEvent', eventId: safeEventId } });
  }
};

export const joinEvent = async (eventId: string, uid: string): Promise<void> => {
  const safeEventId = validate(firestoreIdSchema, eventId, { context: { eventId } });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });

  const eventRef = doc(db, 'events', safeEventId);
  const attendeeRef = doc(db, 'events', safeEventId, 'attendees', safeUid);

  try {
    const eventSnap = await withTimeout(
      withRetry(() => getDoc(eventRef), {
        context: { op: 'events.joinEvent.getEvent', eventId: safeEventId, uid: safeUid },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'events.joinEvent.getEvent', eventId: safeEventId, uid: safeUid } },
    );
    trackFirestoreRead('events.joinEvent.getEvent');

    if (!eventSnap.exists()) {
      throw new AppError('NOT_FOUND', 'Event not found', { context: { eventId: safeEventId } });
    }

    const visibility = (eventSnap.data()?.visibility as string | undefined) ?? 'public';
    if (visibility !== 'public') {
      throw new AppError('PERMISSION_DENIED', 'This event is private', {
        context: { eventId: safeEventId, uid: safeUid },
      });
    }

    const attendeeSnap = await withTimeout(
      withRetry(() => getDoc(attendeeRef), {
        context: { op: 'events.joinEvent.getAttendee', eventId: safeEventId, uid: safeUid },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'events.joinEvent.getAttendee', eventId: safeEventId, uid: safeUid } },
    );
    trackFirestoreRead('events.joinEvent.getAttendee');

    if (attendeeSnap.exists()) return;

    await withTimeout(
      withRetry(
        () =>
          setDoc(
            attendeeRef,
            {
              uid: safeUid,
              joinedAt: serverTimestamp(),
            },
            { merge: false },
          ),
        { context: { op: 'events.joinEvent.setAttendee', eventId: safeEventId, uid: safeUid } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'events.joinEvent.setAttendee', eventId: safeEventId, uid: safeUid } },
    );
    trackFirestoreWrite('events.joinEvent');
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'events.joinEvent', eventId: safeEventId, uid: safeUid },
    });
  }
};

export const leaveEvent = async (eventId: string, uid: string): Promise<void> => {
  const safeEventId = validate(firestoreIdSchema, eventId, { context: { eventId } });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });

  try {
    await withTimeout(
      withRetry(() => deleteDoc(doc(db, 'events', safeEventId, 'attendees', safeUid)), {
        context: { op: 'events.leaveEvent', eventId: safeEventId, uid: safeUid },
      }),
      WRITE_TIMEOUT_MS,
      { context: { op: 'events.leaveEvent', eventId: safeEventId, uid: safeUid } },
    );
    trackFirestoreWrite('events.leaveEvent');
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'events.leaveEvent', eventId: safeEventId, uid: safeUid },
    });
  }
};

export const deleteEvent = async (eventId: string): Promise<void> => {
  const safeEventId = validate(firestoreIdSchema, eventId, { context: { eventId } });

  try {
    await withTimeout(
      withRetry(() => deleteDoc(doc(db, 'events', safeEventId)), {
        context: { op: 'events.deleteEvent', eventId: safeEventId },
      }),
      WRITE_TIMEOUT_MS,
      { context: { op: 'events.deleteEvent', eventId: safeEventId } },
    );
    trackFirestoreWrite('events.deleteEvent');
  } catch (error) {
    throw toAppError(error, { context: { op: 'events.deleteEvent', eventId: safeEventId } });
  }
};
