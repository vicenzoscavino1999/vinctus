import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'firebase/compat/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';

import {
  acceptCollaborationRequest,
  createCollaboration,
  deleteCollaboration,
  rejectCollaborationRequest,
  sendCollaborationRequest,
  updateCollaboration,
} from '@/features/collaborations/api';
import { isAppError } from '@/shared/lib/errors';
import { auth } from '@/shared/lib/firebase';
import { cleanupRulesTestEnv, clearRulesTestData, getRulesTestEnv } from '@/tests/rules/testEnv';

async function seedDoc(path: string, data: Record<string, unknown>) {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(path).set(data);
  });
}

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  const env = await getRulesTestEnv();
  let result: Record<string, unknown> | null = null;

  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx.firestore().doc(path).get();
    result = snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
  });

  return result;
}

describe('Collaborations API (emulator) - mutations', () => {
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

  it('creates and updates a collaboration', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const collaborationId = await createCollaboration(
      uid,
      {
        displayName: 'Autor',
        photoURL: null,
      },
      {
        title: 'Busco coautor',
        context: 'Proyecto IA',
        seekingRole: 'Backend',
        mode: 'virtual',
        location: null,
        level: 'intermedio',
        topic: 'RAG',
        tags: ['ia', 'typescript'],
      },
    );

    const created = await readDoc(`collaborations/${collaborationId}`);
    expect(created).not.toBeNull();
    expect(created?.authorId).toBe(uid);
    expect(created?.status).toBe('open');

    await updateCollaboration(collaborationId, {
      title: 'Busco coautor senior',
      context: 'Proyecto IA',
      seekingRole: 'Backend',
      mode: 'presencial',
      location: 'Lima',
      level: 'experto',
      topic: 'RAG',
      tags: ['ia', 'firestore'],
    });

    const updated = await readDoc(`collaborations/${collaborationId}`);
    expect(updated?.title).toBe('Busco coautor senior');
    expect(updated?.mode).toBe('presencial');
    expect(updated?.location).toBe('Lima');
  });

  it('sends a collaboration request and blocks duplicate pending request', async () => {
    const senderCred = await signInAnonymously(auth);
    const fromUid = senderCred.user.uid;
    const toUid = 'owner_uid';

    await seedDoc('collaborations/coll_seed', {
      title: 'Proyecto abierto',
      context: 'Contexto',
      seekingRole: 'Frontend',
      mode: 'virtual',
      location: null,
      level: 'intermedio',
      topic: null,
      tags: ['react'],
      authorId: toUid,
      authorSnapshot: { displayName: 'Owner', photoURL: null },
      status: 'open',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    const requestId = await sendCollaborationRequest({
      collaborationId: 'coll_seed',
      collaborationTitle: 'Proyecto abierto',
      fromUid,
      toUid,
      message: 'Quiero participar',
      fromUserName: 'Invitado',
      fromUserPhoto: null,
    });

    const request = await readDoc(`collaboration_requests/${requestId}`);
    expect(request).not.toBeNull();
    expect(request?.status).toBe('pending');

    await expect(
      sendCollaborationRequest({
        collaborationId: 'coll_seed',
        collaborationTitle: 'Proyecto abierto',
        fromUid,
        toUid,
        message: 'Segundo intento',
        fromUserName: 'Invitado',
        fromUserPhoto: null,
      }),
    ).rejects.toSatisfy(isAppError);
  });

  it('accepts and rejects pending requests as collaboration owner', async () => {
    const ownerCred = await signInAnonymously(auth);
    const ownerUid = ownerCred.user.uid;

    await seedDoc('collaboration_requests/req_accept', {
      collaborationId: 'coll_accept',
      collaborationTitle: 'Proyecto A',
      fromUid: 'sender_a',
      toUid: ownerUid,
      status: 'pending',
      message: null,
      fromUserName: 'A',
      fromUserPhoto: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await seedDoc('collaboration_requests/req_reject', {
      collaborationId: 'coll_reject',
      collaborationTitle: 'Proyecto B',
      fromUid: 'sender_b',
      toUid: ownerUid,
      status: 'pending',
      message: null,
      fromUserName: 'B',
      fromUserPhoto: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await acceptCollaborationRequest('req_accept');
    await rejectCollaborationRequest('req_reject');

    const accepted = await readDoc('collaboration_requests/req_accept');
    const rejected = await readDoc('collaboration_requests/req_reject');

    expect(accepted?.status).toBe('accepted');
    expect(rejected?.status).toBe('rejected');
  });

  it('deletes collaboration and rejects pending requests', async () => {
    const ownerCred = await signInAnonymously(auth);
    const ownerUid = ownerCred.user.uid;

    const collaborationId = await createCollaboration(
      ownerUid,
      { displayName: 'Owner', photoURL: null },
      {
        title: 'Proyecto para eliminar',
        context: 'Contexto',
        seekingRole: 'QA',
        mode: 'virtual',
        location: null,
        level: 'intermedio',
        topic: null,
        tags: ['qa'],
      },
    );

    const requestId = 'req_delete_1';
    await seedDoc(`collaboration_requests/${requestId}`, {
      collaborationId,
      collaborationTitle: 'Proyecto para eliminar',
      fromUid: 'sender_uid',
      toUid: ownerUid,
      status: 'pending',
      message: null,
      fromUserName: 'Sender',
      fromUserPhoto: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await deleteCollaboration(ownerUid, collaborationId);

    await expect(readDoc(`collaborations/${collaborationId}`)).resolves.toBeNull();
    const request = await readDoc(`collaboration_requests/${requestId}`);
    expect(request?.status).toBe('rejected');
  });
});
