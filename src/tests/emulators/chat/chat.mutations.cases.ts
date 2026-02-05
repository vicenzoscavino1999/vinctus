import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signInAnonymously, signOut } from 'firebase/auth';

import {
  clearConversationMute,
  createGroupReport,
  getOrCreateGroupConversation,
  leaveGroupWithSync,
  markConversationRead,
  sendMessage,
  setConversationMute,
} from '@/features/chat/api/mutations';
import { auth } from '@/shared/lib/firebase';
import { cleanupRulesTestEnv, clearRulesTestData, getRulesTestEnv } from '@/tests/rules/testEnv';

async function seedDoc(path: string, data: Record<string, unknown>) {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(path).set(data);
  });
}

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

describe('Chat API (emulator) - mutations', () => {
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

  it('sends a message and updates lastMessage', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const conversationId = `dm_${uid}_user_b`;

    await seedDoc(`conversations/${conversationId}`, {
      type: 'direct',
      memberIds: [uid, 'user_b'],
      lastMessage: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await sendMessage(conversationId, uid, 'Hola', null, null, undefined, 'client_test');

    const msg = await readDoc(`conversations/${conversationId}/messages/client_test`);
    expect(msg).not.toBeNull();
    expect(msg?.senderId).toBe(uid);
    expect(msg?.text).toBe('Hola');

    const conv = await readDoc(`conversations/${conversationId}`);
    expect(conv).not.toBeNull();
    const lastMessage = (conv?.lastMessage ?? null) as Record<string, unknown> | null;
    expect(lastMessage).not.toBeNull();
    expect(lastMessage?.senderId).toBe(uid);
    expect(lastMessage?.text).toBe('Hola');
    expect(typeof lastMessage?.clientCreatedAt).toBe('number');
  });

  it('marks a conversation as read (creates member if missing)', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const conversationId = `dm_${uid}_user_b`;
    await seedDoc(`conversations/${conversationId}`, {
      type: 'direct',
      memberIds: [uid, 'user_b'],
      lastMessage: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await markConversationRead(conversationId, uid);

    const member = await readDoc(`conversations/${conversationId}/members/${uid}`);
    expect(member).not.toBeNull();
    expect(member?.uid).toBe(uid);
    expect(member?.role).toBe('member');
    expect(typeof member?.lastReadClientAt).toBe('number');
  });

  it('mutes and unmutes a conversation', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const conversationId = `dm_${uid}_user_b`;
    await seedDoc(`conversations/${conversationId}`, {
      type: 'direct',
      memberIds: [uid, 'user_b'],
      lastMessage: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await seedDoc(`conversations/${conversationId}/members/${uid}`, {
      uid,
      role: 'member',
      joinedAt: new Date('2026-01-01T00:00:00Z'),
      lastReadClientAt: 0,
      lastReadAt: new Date('2026-01-01T00:00:00Z'),
      muted: false,
      mutedUntil: null,
    });

    const until = new Date('2026-01-02T00:00:00Z');
    await setConversationMute(conversationId, uid, until);

    const mutedMember = await readDoc(`conversations/${conversationId}/members/${uid}`);
    expect(mutedMember?.muted).toBe(true);

    await clearConversationMute(conversationId, uid);

    const unmutedMember = await readDoc(`conversations/${conversationId}/members/${uid}`);
    expect(unmutedMember?.muted).toBe(false);
    expect(unmutedMember?.mutedUntil ?? null).toBeNull();
  });

  it('creates a group conversation when user is a group member', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const groupId = 'group_test';
    await seedDoc(`groups/${groupId}`, {
      name: 'Grupo',
      description: 'Test',
      categoryId: null,
      visibility: 'public',
      ownerId: uid,
      iconUrl: null,
      memberCount: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await seedDoc(`groups/${groupId}/members/${uid}`, {
      uid,
      groupId,
      role: 'member',
      joinedAt: new Date('2026-01-01T00:00:00Z'),
    });

    const conversationId = await getOrCreateGroupConversation(groupId, uid);
    expect(conversationId).toBe(`grp_${groupId}`);

    expect(await readDoc(`conversations/${conversationId}`)).not.toBeNull();
    expect(await readDoc(`conversations/${conversationId}/members/${uid}`)).not.toBeNull();
  });

  it('leaves a group (deletes membership docs)', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const groupId = 'group_leave';
    await seedDoc(`groups/${groupId}`, {
      name: 'Grupo',
      description: 'Test',
      categoryId: null,
      visibility: 'public',
      ownerId: uid,
      iconUrl: null,
      memberCount: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await seedDoc(`groups/${groupId}/members/${uid}`, {
      uid,
      groupId,
      role: 'member',
      joinedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await seedDoc(`users/${uid}/memberships/${groupId}`, {
      groupId,
      joinedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await leaveGroupWithSync(groupId, uid);

    expect(await readDoc(`groups/${groupId}/members/${uid}`)).toBeNull();
    expect(await readDoc(`users/${uid}/memberships/${groupId}`)).toBeNull();
  });

  it('creates a group report', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const reportId = await createGroupReport({
      reporterUid: uid,
      groupId: 'group_report',
      reason: 'spam',
      details: 'Contenido',
      conversationId: null,
    });

    const report = await readDoc(`reports/${reportId}`);
    expect(report).not.toBeNull();
    expect(report?.reporterUid).toBe(uid);
    expect(report?.reportedUid).toBe('group_report');
    expect(report?.reason).toBe('spam');
    expect(report?.status).toBe('open');
  });
});
