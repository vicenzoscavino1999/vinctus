import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'firebase/compat/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';

import {
  cancelFollowRequest,
  createContribution,
  followPublicUser,
  getOrCreateDirectConversation,
  saveCategoryWithSync,
  sendFollowRequest,
  unfollowUser,
  unsaveCategoryWithSync,
  updateContributionFile,
  updateUserProfile,
} from '@/features/profile/api/mutations';
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

describe('Profile API (emulator) - mutations', () => {
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

  it('updates private and public profile fields', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await seedDoc(`users/${uid}`, {
      displayName: 'Old',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await seedDoc(`users_public/${uid}`, {
      displayName: 'Old',
      username: 'old_user',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await updateUserProfile(uid, {
      displayName: 'Nuevo Nombre',
      bio: 'Bio corta',
      location: 'Lima',
      username: 'nuevo_usuario',
    });

    const userDoc = await readDoc(`users/${uid}`);
    const publicDoc = await readDoc(`users_public/${uid}`);

    expect(userDoc?.displayName).toBe('Nuevo Nombre');
    expect(userDoc?.displayNameLowercase).toBe('nuevo nombre');
    expect(userDoc?.bio).toBe('Bio corta');
    expect(userDoc?.location).toBe('Lima');

    expect(publicDoc?.displayName).toBe('Nuevo Nombre');
    expect(publicDoc?.displayNameLowercase).toBe('nuevo nombre');
    expect(publicDoc?.username).toBe('nuevo_usuario');
  });

  it('creates contribution and updates contribution file metadata', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const contributionId = await createContribution({
      userId: uid,
      type: 'project',
      title: 'Proyecto de prueba',
      description: 'Descripcion',
      link: 'https://example.com',
      categoryId: 'cat_1',
    });

    const created = await readDoc(`contributions/${contributionId}`);
    expect(created).not.toBeNull();
    expect(created?.userId).toBe(uid);
    expect(created?.fileUrl ?? null).toBeNull();

    await updateContributionFile(contributionId, {
      fileUrl: 'https://files.example.com/cv.pdf',
      filePath: `contributions/${uid}/${contributionId}/cv.pdf`,
      fileName: 'cv.pdf',
      fileSize: 1024,
      fileType: 'application/pdf',
    });

    const updated = await readDoc(`contributions/${contributionId}`);
    expect(updated?.fileUrl).toBe('https://files.example.com/cv.pdf');
    expect(updated?.fileName).toBe('cv.pdf');
    expect(updated?.fileSize).toBe(1024);
  });

  it('saves and unsaves categories', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await saveCategoryWithSync('cat_1', uid);
    const saved = await readDoc(`users/${uid}/savedCategories/cat_1`);
    expect(saved).not.toBeNull();
    expect(saved?.categoryId).toBe('cat_1');

    await unsaveCategoryWithSync('cat_1', uid);
    await expect(readDoc(`users/${uid}/savedCategories/cat_1`)).resolves.toBeNull();
  });

  it('sends and cancels private follow requests', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;
    const targetUid = 'private_target';

    await seedDoc(`users_public/${targetUid}`, {
      displayName: 'Private Target',
      username: 'private_target',
      accountVisibility: 'private',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    const requestId = await sendFollowRequest(uid, targetUid);
    expect(requestId).toBe(`${uid}_${targetUid}`);
    const requestDoc = await readDoc(`follow_requests/${requestId}`);
    expect(requestDoc?.status).toBe('pending');

    await cancelFollowRequest(uid, targetUid);
    await expect(readDoc(`follow_requests/${requestId}`)).resolves.toBeNull();
  });

  it('follows and unfollows public users', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;
    const targetUid = 'public_target';

    await seedDoc(`users_public/${targetUid}`, {
      displayName: 'Public Target',
      username: 'public_target',
      accountVisibility: 'public',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await followPublicUser(uid, targetUid);
    const followerDoc = await readDoc(`users/${targetUid}/followers/${uid}`);
    const followingDoc = await readDoc(`users/${uid}/following/${targetUid}`);
    expect(followerDoc?.uid).toBe(uid);
    expect(followingDoc?.uid).toBe(targetUid);

    await unfollowUser(uid, targetUid);
    await expect(readDoc(`users/${targetUid}/followers/${uid}`)).resolves.toBeNull();
    await expect(readDoc(`users/${uid}/following/${targetUid}`)).resolves.toBeNull();
  });

  it('creates direct conversation idempotently', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;
    const otherUid = 'user_other';

    const conversationId = await getOrCreateDirectConversation(uid, otherUid);
    const expectedConversationId = `dm_${[uid, otherUid].sort().join('_')}`;
    expect(conversationId).toBe(expectedConversationId);

    const conversationDoc = await readDoc(`conversations/${conversationId}`);
    expect(conversationDoc).not.toBeNull();
    expect(conversationDoc?.type).toBe('direct');

    const member1 = await readDoc(`conversations/${conversationId}/members/${uid}`);
    const member2 = await readDoc(`conversations/${conversationId}/members/${otherUid}`);
    expect(member1?.uid).toBe(uid);
    expect(member2?.uid).toBe(otherUid);
  });

  it('validates profile mutation inputs with AppError', async () => {
    await expect(updateUserProfile('', {})).rejects.toSatisfy(isAppError);
    await expect(sendFollowRequest('uid_1', 'uid_1')).rejects.toSatisfy(isAppError);
  });
});
