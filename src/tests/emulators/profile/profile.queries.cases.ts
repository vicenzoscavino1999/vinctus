import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'firebase/compat/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';

import { getUserProfile } from '@/features/profile/api/queries';
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

describe('Profile API (emulator) - queries', () => {
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

  it('returns public-only profile for other users (no private leakage)', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;
    const otherUid = `other_${uid}`;

    await seedDoc(`users/${otherUid}`, {
      displayName: 'Private Name',
      email: 'private@example.com',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      settings: { privacy: { accountVisibility: 'private' } },
    });
    await seedDoc(`users_public/${otherUid}`, {
      displayName: 'Public Name',
      username: 'public_user',
      photoURL: null,
      followersCount: 3,
      followingCount: 1,
      postsCount: 2,
      accountVisibility: 'public',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });

    const profile = await getUserProfile(otherUid);
    expect(profile).not.toBeNull();
    expect(profile?.uid).toBe(otherUid);
    expect(profile?.displayName).toBe('Public Name');
    expect(profile?.email).toBeNull();
  });

  it('returns merged private + public profile for current user', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await seedDoc(`users/${uid}`, {
      displayName: 'Me (private)',
      email: 'me@example.com',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      settings: { privacy: { accountVisibility: 'private' } },
      reputation: 10,
    });
    await seedDoc(`users_public/${uid}`, {
      displayName: 'Me (public)',
      photoURL: null,
      followersCount: 7,
      followingCount: 4,
      postsCount: 2,
      accountVisibility: 'public',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });

    const profile = await getUserProfile(uid);
    expect(profile).not.toBeNull();
    expect(profile?.uid).toBe(uid);
    expect(profile?.displayName).toBe('Me (private)');
    expect(profile?.email).toBe('me@example.com');
    expect(profile?.accountVisibility).toBe('private');
    expect(profile?.followersCount).toBe(7);
  });

  it('validates inputs with AppError', async () => {
    await expect(getUserProfile('')).rejects.toSatisfy(isAppError);
  });
});
