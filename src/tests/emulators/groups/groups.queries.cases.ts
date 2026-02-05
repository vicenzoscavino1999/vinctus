import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'firebase/compat/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';

import {
  getGroup,
  getGroupJoinStatus,
  getGroupMemberCount,
  getGroupMembersPage,
  getGroupPostsWeekCount,
  getGroupsByCategoryPage,
  getGroupsPage,
  getPostsByGroup,
} from '@/features/groups/api/queries';
import { auth } from '@/shared/lib/firebase';
import { isAppError } from '@/shared/lib/errors';
import { cleanupRulesTestEnv, clearRulesTestData, getRulesTestEnv } from '@/tests/rules/testEnv';

async function seedDoc(path: string, data: Record<string, unknown>) {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(path).set(data);
  });
}

describe('Groups API (emulator) - queries', () => {
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

  it('paginates groups ordered by memberCount desc', async () => {
    await seedDoc('groups/group_a', {
      name: 'A',
      memberCount: 10,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await seedDoc('groups/group_b', {
      name: 'B',
      memberCount: 5,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await seedDoc('groups/group_c', {
      name: 'C',
      memberCount: 12,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    const first = await getGroupsPage(2);
    expect(first.items.map((g) => g.id)).toEqual(['group_c', 'group_a']);
    expect(first.hasMore).toBe(true);
    expect(first.lastDoc?.id).toBe('group_a');

    const second = await getGroupsPage(2, first.lastDoc);
    expect(second.items.map((g) => g.id)).toEqual(['group_b']);
    expect(second.hasMore).toBe(false);
  });

  it('paginates groups by category', async () => {
    await seedDoc('groups/aaa', { name: 'AAA', categoryId: 'cat_1', memberCount: 1 });
    await seedDoc('groups/aab', { name: 'AAB', categoryId: 'cat_1', memberCount: 1 });
    await seedDoc('groups/aac', { name: 'AAC', categoryId: 'cat_1', memberCount: 1 });
    await seedDoc('groups/bbb', { name: 'BBB', categoryId: 'cat_2', memberCount: 1 });

    const first = await getGroupsByCategoryPage('cat_1', 2);
    expect(first.items.map((g) => g.id)).toEqual(['aaa', 'aab']);
    expect(first.hasMore).toBe(true);
    expect(first.lastDoc?.id).toBe('aab');

    const second = await getGroupsByCategoryPage('cat_1', 2, first.lastDoc);
    expect(second.items.map((g) => g.id)).toEqual(['aac']);
    expect(second.hasMore).toBe(false);
  });

  it('returns group data or null', async () => {
    await seedDoc('groups/group_read', {
      name: 'Grupo',
      description: 'Test',
      memberCount: 7,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });

    const found = await getGroup('group_read');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('group_read');
    expect(found?.name).toBe('Grupo');
    expect(found?.memberCount).toBe(7);

    await expect(getGroup('missing_group')).resolves.toBeNull();
  });

  it('computes join status member/pending/none', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;
    const memberGroupId = 'group_join_member';
    const pendingGroupId = 'group_join_pending';
    const noneGroupId = 'group_join_none';

    await seedDoc(`groups/${memberGroupId}`, { name: 'Join', memberCount: 1 });
    await seedDoc(`groups/${memberGroupId}/members/${uid}`, {
      uid,
      groupId: memberGroupId,
      role: 'member',
      joinedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await expect(getGroupJoinStatus(memberGroupId, uid)).resolves.toBe('member');

    await seedDoc(`groups/${pendingGroupId}`, { name: 'Join', memberCount: 1 });
    await seedDoc('group_requests/req_1', {
      groupId: pendingGroupId,
      groupName: 'Join',
      fromUid: uid,
      toUid: 'owner_1',
      status: 'pending',
      message: null,
      fromUserName: null,
      fromUserPhoto: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await expect(getGroupJoinStatus(pendingGroupId, uid)).resolves.toBe('pending');

    await seedDoc(`groups/${noneGroupId}`, { name: 'Join', memberCount: 1 });
    await expect(getGroupJoinStatus(noneGroupId, uid)).resolves.toBe('none');
  });

  it('paginates group members ordered by joinedAt desc', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;
    const groupId = 'group_members';

    await seedDoc(`groups/${groupId}`, { name: 'Members', memberCount: 3 });
    await seedDoc(`groups/${groupId}/members/${uid}_old`, {
      uid: `${uid}_old`,
      groupId,
      role: 'member',
      joinedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await seedDoc(`groups/${groupId}/members/${uid}_mid`, {
      uid: `${uid}_mid`,
      groupId,
      role: 'member',
      joinedAt: new Date('2026-01-02T00:00:00Z'),
    });
    await seedDoc(`groups/${groupId}/members/${uid}_new`, {
      uid: `${uid}_new`,
      groupId,
      role: 'admin',
      joinedAt: new Date('2026-01-03T00:00:00Z'),
    });

    const first = await getGroupMembersPage(groupId, 2);
    expect(first.items.map((m) => m.uid)).toEqual([`${uid}_new`, `${uid}_mid`]);
    expect(first.hasMore).toBe(true);

    const second = await getGroupMembersPage(groupId, 2, first.lastDoc);
    expect(second.items.map((m) => m.uid)).toEqual([`${uid}_old`]);
    expect(second.hasMore).toBe(false);
  });

  it('counts group members and recent posts', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;
    const groupId = 'group_counts';

    await seedDoc(`groups/${groupId}`, { name: 'Counts', memberCount: 2 });
    await seedDoc(`groups/${groupId}/members/${uid}_1`, {
      uid: `${uid}_1`,
      groupId,
      role: 'member',
      joinedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await seedDoc(`groups/${groupId}/members/${uid}_2`, {
      uid: `${uid}_2`,
      groupId,
      role: 'member',
      joinedAt: new Date('2026-01-02T00:00:00Z'),
    });

    const now = Date.now();
    await seedDoc('posts/post_recent', {
      authorId: uid,
      groupId,
      createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
    });
    await seedDoc('posts/post_old', {
      authorId: uid,
      groupId,
      createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
    });

    await expect(getGroupMemberCount(groupId)).resolves.toBe(2);
    await expect(getGroupPostsWeekCount(groupId)).resolves.toBe(1);
  });

  it('paginates posts by group ordered by createdAt desc', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;
    const groupId = 'group_posts';

    await seedDoc('posts/post_new', {
      authorId: uid,
      groupId,
      createdAt: new Date('2026-01-03T00:00:00Z'),
      updatedAt: new Date('2026-01-03T00:00:00Z'),
    });
    await seedDoc('posts/post_mid', {
      authorId: uid,
      groupId,
      createdAt: new Date('2026-01-02T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });
    await seedDoc('posts/post_old', {
      authorId: uid,
      groupId,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    const first = await getPostsByGroup(groupId, 2);
    expect(first.items.map((p) => p.id)).toEqual(['post_new', 'post_mid']);
    expect(first.hasMore).toBe(true);

    const second = await getPostsByGroup(groupId, 2, first.lastDoc);
    expect(second.items.map((p) => p.id)).toEqual(['post_old']);
    expect(second.hasMore).toBe(false);
  });

  it('validates inputs with AppError', async () => {
    await expect(getGroupsPage(0)).rejects.toSatisfy(isAppError);

    try {
      await getGroup('');
      throw new Error('Expected getGroup to throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) {
        expect(error.code).toBe('VALIDATION_FAILED');
      }
    }
  });
});
