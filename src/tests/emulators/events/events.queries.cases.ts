import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'firebase/compat/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';

import {
  getEventAttendeeCount,
  getUpcomingEvents,
  isEventAttendee,
} from '@/features/events/api/queries';
import { isAppError } from '@/shared/lib/errors';
import { auth } from '@/shared/lib/firebase';
import { cleanupRulesTestEnv, clearRulesTestData, getRulesTestEnv } from '@/tests/rules/testEnv';

async function seedDoc(path: string, data: Record<string, unknown>) {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(path).set(data);
  });
}

describe('Events API (emulator) - queries', () => {
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

  it('returns upcoming public events ordered by startAt asc', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await seedDoc('events/event_b', {
      title: 'Event B',
      description: null,
      startAt: new Date('2099-01-02T00:00:00Z'),
      endAt: null,
      city: null,
      venue: null,
      capacity: null,
      visibility: 'public',
      createdBy: uid,
      coverUrl: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await seedDoc('events/event_a', {
      title: 'Event A',
      description: null,
      startAt: new Date('2099-01-01T00:00:00Z'),
      endAt: null,
      city: null,
      venue: null,
      capacity: null,
      visibility: 'public',
      createdBy: uid,
      coverUrl: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await seedDoc('events/event_private', {
      title: 'Private',
      description: null,
      startAt: new Date('2099-01-03T00:00:00Z'),
      endAt: null,
      city: null,
      venue: null,
      capacity: null,
      visibility: 'private',
      createdBy: uid,
      coverUrl: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    const events = await getUpcomingEvents(5);
    expect(events.map((event) => event.id)).toEqual(['event_a', 'event_b']);
  });

  it('falls back to recent public events when there are no future events', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await seedDoc('events/past_1', {
      title: 'Past 1',
      startAt: new Date('2020-01-01T00:00:00Z'),
      visibility: 'public',
      createdBy: uid,
    });
    await seedDoc('events/past_2', {
      title: 'Past 2',
      startAt: new Date('2020-01-02T00:00:00Z'),
      visibility: 'public',
      createdBy: uid,
    });
    await seedDoc('events/past_3', {
      title: 'Past 3',
      startAt: new Date('2020-01-03T00:00:00Z'),
      visibility: 'public',
      createdBy: uid,
    });

    const events = await getUpcomingEvents(2);
    expect(events.map((event) => event.id)).toEqual(['past_2', 'past_3']);
  });

  it('checks attendance status and attendee count', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;
    const eventId = 'event_attendance';

    await seedDoc(`events/${eventId}`, {
      title: 'Event',
      startAt: new Date('2099-02-01T00:00:00Z'),
      visibility: 'public',
      createdBy: uid,
    });
    await seedDoc(`events/${eventId}/attendees/${uid}`, {
      uid,
      joinedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await seedDoc(`events/${eventId}/attendees/user_x`, {
      uid: 'user_x',
      joinedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await expect(isEventAttendee(eventId, uid)).resolves.toBe(true);
    await expect(isEventAttendee(eventId, 'missing_uid')).resolves.toBe(false);
    await expect(getEventAttendeeCount(eventId)).resolves.toBe(2);
  });

  it('validates inputs with AppError', async () => {
    await expect(getUpcomingEvents(0)).rejects.toSatisfy(isAppError);
    await expect(isEventAttendee('', 'uid')).rejects.toSatisfy(isAppError);
    await expect(getEventAttendeeCount('')).rejects.toSatisfy(isAppError);
  });
});
