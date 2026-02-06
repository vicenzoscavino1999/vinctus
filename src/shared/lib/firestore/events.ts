import {
  collection,
  deleteDoc as _deleteDoc,
  doc,
  getCountFromServer as _getCountFromServer,
  getDoc as _getDoc,
  getDocs as _getDocs,
  limit,
  limitToLast,
  orderBy,
  query,
  serverTimestamp,
  setDoc as _setDoc,
  Timestamp,
  updateDoc as _updateDoc,
  where,
  type FieldValue,
} from 'firebase/firestore';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { db } from '@/shared/lib/firebase';

const DEFAULT_LIMIT = 30;

type EventVisibility = 'public' | 'private';

interface FirestoreEvent {
  id: string;
  title: string;
  description: string | null;
  startAt: Date | null;
  endAt: Date | null;
  city: string | null;
  venue: string | null;
  capacity: number | null;
  attendeesCount: number | null;
  visibility: EventVisibility;
  createdBy: string;
  coverUrl: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface CreateEventInput {
  title: string;
  description: string | null;
  startAt: Date;
  endAt?: Date | null;
  city: string | null;
  venue: string | null;
  capacity: number | null;
  visibility: EventVisibility;
  coverUrl?: string | null;
}

interface EventWrite {
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date | null;
  city: string | null;
  venue: string | null;
  capacity: number | null;
  visibility: EventVisibility;
  createdBy: string;
  coverUrl: string | null;
  createdAt: FieldValue;
  updatedAt: FieldValue;
}

interface EventAttendeeWrite {
  uid: string;
  joinedAt: FieldValue;
}

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
};

const getDoc = ((...args: unknown[]) => {
  trackFirestoreRead('firestore.getDoc');
  return (_getDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _getDoc;

const getDocs = ((...args: unknown[]) => {
  const result = (_getDocs as (...innerArgs: unknown[]) => unknown)(...args);
  if (
    typeof result === 'object' &&
    result !== null &&
    'then' in result &&
    typeof (result as Promise<unknown>).then === 'function'
  ) {
    return (result as Promise<unknown>).then((snapshot) => {
      const size = (snapshot as { size?: unknown }).size;
      const safeSize =
        typeof size === 'number' && Number.isFinite(size) && size >= 0 ? Math.floor(size) : 1;
      trackFirestoreRead('firestore.getDocs', Math.max(1, safeSize));
      return snapshot;
    });
  }

  const size = (result as { size?: unknown }).size;
  const safeSize =
    typeof size === 'number' && Number.isFinite(size) && size >= 0 ? Math.floor(size) : 1;
  trackFirestoreRead('firestore.getDocs', Math.max(1, safeSize));
  return result;
}) as typeof _getDocs;

const getCountFromServer = ((...args: unknown[]) => {
  trackFirestoreRead('firestore.getCountFromServer');
  return (_getCountFromServer as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _getCountFromServer;

const setDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.setDoc');
  return (_setDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _setDoc;

const updateDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.updateDoc');
  return (_updateDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _updateDoc;

const deleteDoc = ((...args: unknown[]) => {
  trackFirestoreWrite('firestore.deleteDoc');
  return (_deleteDoc as (...innerArgs: unknown[]) => unknown)(...args);
}) as typeof _deleteDoc;

export async function createEvent(ownerId: string, input: CreateEventInput): Promise<string> {
  const eventRef = doc(collection(db, 'events'));
  await setDoc(
    eventRef,
    {
      title: input.title,
      description: input.description,
      startAt: input.startAt,
      endAt: input.endAt ?? null,
      city: input.city,
      venue: input.venue,
      capacity: input.capacity,
      visibility: input.visibility,
      createdBy: ownerId,
      coverUrl: input.coverUrl ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as EventWrite,
    { merge: false },
  );

  try {
    const attendeeRef = doc(db, 'events', eventRef.id, 'attendees', ownerId);
    await setDoc(
      attendeeRef,
      {
        uid: ownerId,
        joinedAt: serverTimestamp(),
      } as EventAttendeeWrite,
      { merge: false },
    );
  } catch (error) {
    await deleteDoc(eventRef).catch(() => {});
    throw error;
  }
  return eventRef.id;
}

export async function updateEvent(eventId: string, input: CreateEventInput): Promise<void> {
  await updateDoc(doc(db, 'events', eventId), {
    title: input.title,
    description: input.description,
    startAt: input.startAt,
    endAt: input.endAt ?? null,
    city: input.city,
    venue: input.venue,
    capacity: input.capacity,
    visibility: input.visibility,
    coverUrl: input.coverUrl ?? null,
    updatedAt: serverTimestamp(),
  });
}

export async function getEvent(eventId: string): Promise<FirestoreEvent | null> {
  const snap = await getDoc(doc(db, 'events', eventId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    title: data.title,
    description: data.description ?? null,
    startAt: toDate(data.startAt) ?? null,
    endAt: toDate(data.endAt) ?? null,
    city: data.city ?? null,
    venue: data.venue ?? null,
    capacity: typeof data.capacity === 'number' ? data.capacity : null,
    attendeesCount: typeof data.attendeesCount === 'number' ? data.attendeesCount : null,
    visibility: (data.visibility as EventVisibility) ?? 'public',
    createdBy: data.createdBy,
    coverUrl: data.coverUrl ?? null,
    createdAt: toDate(data.createdAt) ?? null,
    updatedAt: toDate(data.updatedAt) ?? null,
  };
}

export async function getUpcomingEvents(
  limitCount: number = DEFAULT_LIMIT,
): Promise<FirestoreEvent[]> {
  const now = Timestamp.now();
  const upcomingQuery = query(
    collection(db, 'events'),
    where('visibility', '==', 'public'),
    where('startAt', '>=', now),
    orderBy('startAt', 'asc'),
    limit(limitCount),
  );
  const upcomingSnap = await getDocs(upcomingQuery);
  const mapSnap = (snap: typeof upcomingSnap) =>
    snap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        title: data.title,
        description: data.description ?? null,
        startAt: toDate(data.startAt) ?? null,
        endAt: toDate(data.endAt) ?? null,
        city: data.city ?? null,
        venue: data.venue ?? null,
        capacity: typeof data.capacity === 'number' ? data.capacity : null,
        attendeesCount: typeof data.attendeesCount === 'number' ? data.attendeesCount : null,
        visibility: (data.visibility as EventVisibility) ?? 'public',
        createdBy: data.createdBy,
        coverUrl: data.coverUrl ?? null,
        createdAt: toDate(data.createdAt) ?? null,
        updatedAt: toDate(data.updatedAt) ?? null,
      };
    });

  if (!upcomingSnap.empty) {
    return mapSnap(upcomingSnap);
  }

  try {
    const recentSnap = await getDocs(
      query(
        collection(db, 'events'),
        where('visibility', '==', 'public'),
        orderBy('startAt', 'asc'),
        limitToLast(limitCount),
      ),
    );
    return mapSnap(recentSnap);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'failed-precondition') {
      const fallbackScanLimit = Math.max(limitCount * 3, limitCount);
      const fallbackSnap = await getDocs(
        query(
          collection(db, 'events'),
          where('startAt', '>=', now),
          orderBy('startAt', 'asc'),
          limit(fallbackScanLimit),
        ),
      );
      return mapSnap(fallbackSnap)
        .filter((event) => event.visibility === 'public')
        .slice(0, limitCount);
    }
    throw error;
  }
}

export async function joinEvent(eventId: string, uid: string): Promise<void> {
  const eventSnap = await getDoc(doc(db, 'events', eventId));
  if (!eventSnap.exists()) {
    throw new Error('Evento no encontrado');
  }
  const visibility = (eventSnap.data().visibility as EventVisibility) ?? 'public';
  if (visibility !== 'public') {
    throw new Error('Este evento es privado');
  }

  const attendeeRef = doc(db, 'events', eventId, 'attendees', uid);
  const attendeeSnap = await getDoc(attendeeRef);
  if (attendeeSnap.exists()) return;
  await setDoc(
    attendeeRef,
    {
      uid,
      joinedAt: serverTimestamp(),
    } as EventAttendeeWrite,
    { merge: false },
  );
}

export async function leaveEvent(eventId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, 'events', eventId, 'attendees', uid));
}

export async function deleteEvent(eventId: string): Promise<void> {
  await deleteDoc(doc(db, 'events', eventId));
}

export async function isEventAttendee(eventId: string, uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'events', eventId, 'attendees', uid));
  return snap.exists();
}

export async function getEventAttendeeCount(eventId: string): Promise<number> {
  const snap = await getCountFromServer(collection(db, 'events', eventId, 'attendees'));
  return snap.data().count;
}
