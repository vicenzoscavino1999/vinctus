import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signInAnonymously, signOut } from 'firebase/auth';

import {
  acceptGroupJoinRequest,
  addGroupMember,
  createGroup,
  joinPublicGroup,
  leaveGroupWithSync,
  rejectGroupJoinRequest,
  removeGroupMember,
  sendGroupJoinRequest,
  updateGroup,
  updateGroupMemberRole,
} from '@/features/groups/api/mutations';
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

describe('Groups API (emulator) - mutations', () => {
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

  it('creates and updates a group', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const groupId = await createGroup(uid, {
      name: 'Grupo',
      description: 'Descripcion',
      categoryId: null,
      visibility: 'public',
      iconUrl: null,
    });

    const group = await readDoc(`groups/${groupId}`);
    expect(group).not.toBeNull();
    expect(group?.ownerId).toBe(uid);
    expect(group?.name).toBe('Grupo');

    expect(await readDoc(`groups/${groupId}/members/${uid}`)).not.toBeNull();
    expect(await readDoc(`users/${uid}/memberships/${groupId}`)).not.toBeNull();

    await updateGroup(groupId, {
      name: 'Grupo 2',
      description: 'Descripcion 2',
      categoryId: 'cat_1',
      visibility: 'private',
      iconUrl: 'https://example.com/icon.png',
    });

    const updated = await readDoc(`groups/${groupId}`);
    expect(updated?.name).toBe('Grupo 2');
    expect(updated?.visibility).toBe('private');
    expect(updated?.iconUrl).toBe('https://example.com/icon.png');
  });

  it('joins and leaves a public group', async () => {
    await seedDoc('groups/group_public', {
      name: 'Publico',
      description: 'Test',
      categoryId: null,
      visibility: 'public',
      ownerId: 'owner_1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await joinPublicGroup('group_public', uid);

    expect(await readDoc(`groups/group_public/members/${uid}`)).not.toBeNull();
    expect(await readDoc(`users/${uid}/memberships/group_public`)).not.toBeNull();

    await leaveGroupWithSync('group_public', uid);

    expect(await readDoc(`groups/group_public/members/${uid}`)).toBeNull();
    expect(await readDoc(`users/${uid}/memberships/group_public`)).toBeNull();
  });

  it('adds/updates/removes a group member as owner', async () => {
    const cred = await signInAnonymously(auth);
    const ownerUid = cred.user.uid;

    const groupId = await createGroup(ownerUid, {
      name: 'Grupo',
      description: 'Descripcion',
      categoryId: null,
      visibility: 'public',
      iconUrl: null,
    });

    const memberUid = 'member_user';
    await addGroupMember(groupId, memberUid, 'member');

    const member = await readDoc(`groups/${groupId}/members/${memberUid}`);
    expect(member).not.toBeNull();
    expect(member?.uid).toBe(memberUid);
    expect(member?.role).toBe('member');

    expect(await readDoc(`users/${memberUid}/memberships/${groupId}`)).not.toBeNull();

    await updateGroupMemberRole(groupId, memberUid, 'moderator');
    const updated = await readDoc(`groups/${groupId}/members/${memberUid}`);
    expect(updated?.role).toBe('moderator');

    await removeGroupMember(groupId, memberUid);
    expect(await readDoc(`groups/${groupId}/members/${memberUid}`)).toBeNull();
    expect(await readDoc(`users/${memberUid}/memberships/${groupId}`)).toBeNull();
  });

  it('sends a private group join request', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await seedDoc('groups/group_private', {
      name: 'Privado',
      description: 'Test',
      categoryId: null,
      visibility: 'private',
      ownerId: 'owner_private',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    const requestId = await sendGroupJoinRequest({
      groupId: 'group_private',
      groupName: 'Privado',
      fromUid: uid,
      toUid: 'owner_private',
      message: null,
      fromUserName: 'Anon',
      fromUserPhoto: null,
    });

    const req = await readDoc(`group_requests/${requestId}`);
    expect(req).not.toBeNull();
    expect(req?.groupId).toBe('group_private');
    expect(req?.fromUid).toBe(uid);
    expect(req?.toUid).toBe('owner_private');
    expect(req?.status).toBe('pending');
  });

  it('accepts and rejects join requests as owner', async () => {
    const cred = await signInAnonymously(auth);
    const ownerUid = cred.user.uid;

    const groupId = await createGroup(ownerUid, {
      name: 'Privado',
      description: 'Test',
      categoryId: null,
      visibility: 'private',
      iconUrl: null,
    });

    await seedDoc('group_requests/req_accept', {
      groupId,
      groupName: 'Privado',
      fromUid: 'joiner_uid',
      toUid: ownerUid,
      status: 'pending',
      message: null,
      fromUserName: null,
      fromUserPhoto: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await acceptGroupJoinRequest('req_accept');

    const accepted = await readDoc('group_requests/req_accept');
    expect(accepted?.status).toBe('accepted');
    expect(await readDoc(`groups/${groupId}/members/joiner_uid`)).not.toBeNull();
    expect(await readDoc(`users/joiner_uid/memberships/${groupId}`)).not.toBeNull();

    await seedDoc('group_requests/req_reject', {
      groupId,
      groupName: 'Privado',
      fromUid: 'joiner_uid_2',
      toUid: ownerUid,
      status: 'pending',
      message: null,
      fromUserName: null,
      fromUserPhoto: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await rejectGroupJoinRequest('req_reject');
    const rejected = await readDoc('group_requests/req_reject');
    expect(rejected?.status).toBe('rejected');
  });
});
