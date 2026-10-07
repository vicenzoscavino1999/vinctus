import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'firebase/compat/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';

import { getUserActivity } from '@/features/notifications/api/queries';
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

describe('Notifications API (emulator) - queries', () => {
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

  it('paginates user activity ordered by createdAt desc', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await seedDoc('notifications/notif_a', {
      type: 'post_like',
      toUid: uid,
      fromUid: 'user_a',
      fromUserName: 'Alice',
      fromUserPhoto: null,
      postId: 'post_1',
      postSnippet: 'Hola',
      commentText: null,
      createdAt: new Date('2026-01-03T00:00:00Z'),
      read: false,
    });
    await seedDoc('notifications/notif_b', {
      type: 'post_comment',
      toUid: uid,
      fromUid: 'user_b',
      fromUserName: 'Bob',
      fromUserPhoto: null,
      postId: 'post_2',
      postSnippet: 'Hola',
      commentText: 'Comentario',
      createdAt: new Date('2026-01-02T00:00:00Z'),
      read: true,
    });
    await seedDoc('notifications/notif_c', {
      type: 'post_like',
      toUid: uid,
      fromUid: 'user_c',
      fromUserName: 'Carol',
      fromUserPhoto: null,
      postId: 'post_3',
      postSnippet: null,
      commentText: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      read: false,
    });
    await seedDoc('notifications/notif_other', {
      type: 'post_like',
      toUid: 'someone_else',
      fromUid: 'user_x',
      fromUserName: 'X',
      fromUserPhoto: null,
      postId: 'post_x',
      postSnippet: null,
      commentText: null,
      createdAt: new Date('2026-01-04T00:00:00Z'),
      read: false,
    });

    const first = await getUserActivity(uid, 2);
    expect(first.items.map((n) => n.id)).toEqual(['notif_a', 'notif_b']);
    expect(first.items[0]?.createdAt).toBeInstanceOf(Date);
    expect(first.hasMore).toBe(true);
    expect(first.lastDoc?.id).toBe('notif_b');

    const second = await getUserActivity(uid, 2, first.lastDoc);
    expect(second.items.map((n) => n.id)).toEqual(['notif_c']);
    expect(second.hasMore).toBe(false);
  });

  it('validates inputs with AppError', async () => {
    await expect(getUserActivity('', 20)).rejects.toSatisfy(isAppError);

    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    try {
      await getUserActivity(uid, 0);
      throw new Error('Expected getUserActivity to throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) {
        expect(error.code).toBe('VALIDATION_FAILED');
      }
    }
  });
});
