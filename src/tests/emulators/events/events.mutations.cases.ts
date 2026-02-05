import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'firebase/compat/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';

import {
  createEvent,
  deleteEvent,
  joinEvent,
  leaveEvent,
  updateEvent,
} from '@/features/events/api/mutations';
import { isAppError } from '@/shared/lib/errors';
import { auth } from '@/shared/lib/firebase';
import { cleanupRulesTestEnv, clearRulesTestData, getRulesTestEnv } from '@/tests/rules/testEnv';

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  const env = await getRulesTestEnv();
  let result: Record<string, unknown> | null = null;

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const snap = await db.doc(path).get();
    result = snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
  });

  return result;
}

describe('Events API (emulator) - mutations', () => {
  beforeAll(async () => {
    await getRulesTestEnv();
  });

  beforeEach(async () => {
    await clearRulesTestData();
    if (auth.currentUser) {
      await signOut(auth);
    }
  });

  afterAll(async () => {
    if (auth.currentUser) {
      await signOut(auth);
    }
    await cleanupRulesTestEnv();
  });

  it('creates an event and owner attendee', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const eventId = await createEvent(uid, {
      title: 'Evento',
      description: 'Descripcion',
      startAt: new Date('2099-01-01T00:00:00Z'),
      endAt: new Date('2099-01-01T02:00:00Z'),
      city: 'Lima',
      venue: 'Centro',
      capacity: 100,
      visibility: 'public',
      coverUrl: null,
    });

    const eventDoc = await readDoc(`events/${eventId}`);
    expect(eventDoc).not.toBeNull();
    expect(eventDoc?.title).toBe('Evento');
    expect(eventDoc?.createdBy).toBe(uid);

    const attendeeDoc = await readDoc(`events/${eventId}/attendees/${uid}`);
    expect(attendeeDoc).not.toBeNull();
    expect(attendeeDoc?.uid).toBe(uid);
  });

  it('updates event metadata', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const eventId = await createEvent(uid, {
      title: 'Evento',
      description: null,
      startAt: new Date('2099-01-01T00:00:00Z'),
      endAt: null,
      city: null,
      venue: null,
      capacity: null,
      visibility: 'public',
      coverUrl: null,
    });

    await updateEvent(eventId, {
      title: 'Evento Actualizado',
      description: 'Nueva descripcion',
      startAt: new Date('2099-01-01T00:00:00Z'),
      endAt: null,
      city: 'Cusco',
      venue: 'Auditorio',
      capacity: 80,
      visibility: 'public',
      coverUrl: null,
    });

    const updated = await readDoc(`events/${eventId}`);
    expect(updated?.title).toBe('Evento Actualizado');
    expect(updated?.city).toBe('Cusco');
    expect(updated?.capacity).toBe(80);
  });

  it('joins and leaves a public event', async () => {
    const ownerCred = await signInAnonymously(auth);
    const ownerUid = ownerCred.user.uid;
    const eventId = await createEvent(ownerUid, {
      title: 'Public Event',
      description: null,
      startAt: new Date('2099-02-01T00:00:00Z'),
      endAt: null,
      city: null,
      venue: null,
      capacity: null,
      visibility: 'public',
      coverUrl: null,
    });

    await signOut(auth);
    const userCred = await signInAnonymously(auth);
    const userUid = userCred.user.uid;

    await joinEvent(eventId, userUid);
    const attendee = await readDoc(`events/${eventId}/attendees/${userUid}`);
    expect(attendee).not.toBeNull();
    expect(attendee?.uid).toBe(userUid);

    await leaveEvent(eventId, userUid);
    await expect(readDoc(`events/${eventId}/attendees/${userUid}`)).resolves.toBeNull();
  });

  it('rejects join on private events', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const eventId = await createEvent(uid, {
      title: 'Private Event',
      description: null,
      startAt: new Date('2099-03-01T00:00:00Z'),
      endAt: null,
      city: null,
      venue: null,
      capacity: null,
      visibility: 'private',
      coverUrl: null,
    });

    await expect(joinEvent(eventId, uid)).rejects.toSatisfy(isAppError);
    try {
      await joinEvent(eventId, uid);
      throw new Error('Expected joinEvent to throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) {
        expect(error.code).toBe('PERMISSION_DENIED');
      }
    }
  });

  it('deletes event by owner', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const eventId = await createEvent(uid, {
      title: 'Delete Event',
      description: null,
      startAt: new Date('2099-04-01T00:00:00Z'),
      endAt: null,
      city: null,
      venue: null,
      capacity: null,
      visibility: 'public',
      coverUrl: null,
    });

    await deleteEvent(eventId);
    await expect(readDoc(`events/${eventId}`)).resolves.toBeNull();
  });

  it('validates createEvent input', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await expect(
      createEvent(uid, {
        title: '',
        description: null,
        startAt: new Date('2099-01-01T00:00:00Z'),
        endAt: null,
        city: null,
        venue: null,
        capacity: null,
        visibility: 'public',
      }),
    ).rejects.toSatisfy(isAppError);
  });
});
