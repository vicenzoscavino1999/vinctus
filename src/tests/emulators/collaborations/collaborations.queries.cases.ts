import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'firebase/compat/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';

import { getCollaborations, getPendingCollaborationRequests } from '@/features/collaborations/api';
import { isAppError } from '@/shared/lib/errors';
import { auth } from '@/shared/lib/firebase';
import { cleanupRulesTestEnv, clearRulesTestData, getRulesTestEnv } from '@/tests/rules/testEnv';

async function seedDoc(path: string, data: Record<string, unknown>) {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(path).set(data);
  });
}

describe('Collaborations API (emulator) - queries', () => {
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

  it('gets only open collaborations sorted by createdAt desc', async () => {
    await seedDoc('collaborations/c1', {
      title: 'Proyecto viejo',
      context: 'Contexto',
      seekingRole: 'Frontend',
      mode: 'virtual',
      location: null,
      level: 'intermedio',
      topic: null,
      tags: ['react'],
      authorId: 'author_1',
      authorSnapshot: { displayName: 'Autor 1', photoURL: null },
      status: 'open',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await seedDoc('collaborations/c2', {
      title: 'Proyecto cerrado',
      context: 'Contexto',
      seekingRole: 'Backend',
      mode: 'virtual',
      location: null,
      level: 'experto',
      topic: null,
      tags: ['node'],
      authorId: 'author_2',
      authorSnapshot: { displayName: 'Autor 2', photoURL: null },
      status: 'closed',
      createdAt: new Date('2026-01-02T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });
    await seedDoc('collaborations/c3', {
      title: 'Proyecto nuevo',
      context: 'Contexto',
      seekingRole: 'Data',
      mode: 'presencial',
      location: 'Lima',
      level: 'principiante',
      topic: null,
      tags: ['ia'],
      authorId: 'author_3',
      authorSnapshot: { displayName: 'Autor 3', photoURL: null },
      status: 'open',
      createdAt: new Date('2026-01-03T00:00:00Z'),
      updatedAt: new Date('2026-01-03T00:00:00Z'),
    });

    const items = await getCollaborations(10);

    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some((item) => item.id === 'c3')).toBe(true);
    expect(items.every((item) => item.status === 'open')).toBe(true);
  });

  it('gets pending collaboration requests for owner', async () => {
    const cred = await signInAnonymously(auth);
    const ownerUid = cred.user.uid;

    await seedDoc('collaboration_requests/r1', {
      collaborationId: 'c_a',
      collaborationTitle: 'Proyecto A',
      fromUid: 'user_from_1',
      toUid: ownerUid,
      status: 'pending',
      message: 'Me interesa',
      fromUserName: 'Ana',
      fromUserPhoto: null,
      createdAt: new Date('2026-01-02T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });
    await seedDoc('collaboration_requests/r2', {
      collaborationId: 'c_b',
      collaborationTitle: 'Proyecto B',
      fromUid: 'user_from_2',
      toUid: ownerUid,
      status: 'pending',
      message: null,
      fromUserName: 'Luis',
      fromUserPhoto: null,
      createdAt: new Date('2026-01-03T00:00:00Z'),
      updatedAt: new Date('2026-01-03T00:00:00Z'),
    });
    await seedDoc('collaboration_requests/r3', {
      collaborationId: 'c_c',
      collaborationTitle: 'Proyecto C',
      fromUid: 'user_from_3',
      toUid: ownerUid,
      status: 'accepted',
      message: null,
      fromUserName: 'Sol',
      fromUserPhoto: null,
      createdAt: new Date('2026-01-04T00:00:00Z'),
      updatedAt: new Date('2026-01-04T00:00:00Z'),
    });

    const pending = await getPendingCollaborationRequests(ownerUid, 10);

    expect(pending).toHaveLength(2);
    expect(pending[0]?.id).toBe('r2');
    expect(pending[1]?.id).toBe('r1');
    expect(pending.every((item) => item.status === 'pending')).toBe(true);
  });

  it('validates pending request query input', async () => {
    await expect(getPendingCollaborationRequests('', 10)).rejects.toSatisfy(isAppError);
  });
});
