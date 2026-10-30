import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'firebase/compat/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';

import {
  updateNotificationSettings,
  updatePrivacySettings,
} from '@/features/settings/api/mutations';
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

describe('Settings API (emulator) - mutations', () => {
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

  it('updates notification settings on users/{uid}', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await seedDoc(`users/${uid}`, { createdAt: new Date('2026-01-01T00:00:00Z') });

    await updateNotificationSettings(uid, {
      pushEnabled: false,
      emailEnabled: false,
      mentionsOnly: true,
      weeklyDigest: true,
      productUpdates: false,
    });

    const userDoc = await readDoc(`users/${uid}`);
    expect(userDoc).not.toBeNull();

    const settings = (userDoc?.settings ?? null) as Record<string, unknown> | null;
    expect(settings).not.toBeNull();
    const notifications = (settings?.notifications ?? null) as Record<string, unknown> | null;
    expect(notifications).toEqual({
      pushEnabled: false,
      emailEnabled: false,
      mentionsOnly: true,
      weeklyDigest: true,
      productUpdates: false,
    });
  });

  it('updates privacy settings and mirrors accountVisibility to users_public', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await seedDoc(`users/${uid}`, { createdAt: new Date('2026-01-01T00:00:00Z') });

    await updatePrivacySettings(uid, {
      accountVisibility: 'private',
      allowDirectMessages: false,
      showOnlineStatus: false,
      showLastActive: false,
      allowFriendRequests: false,
      blockedUsers: ['user_a', 'user_b'],
    });

    const userDoc = await readDoc(`users/${uid}`);
    const settings = (userDoc?.settings ?? null) as Record<string, unknown> | null;
    const privacy = (settings?.privacy ?? null) as Record<string, unknown> | null;
    expect(privacy?.accountVisibility).toBe('private');
    expect(privacy?.allowDirectMessages).toBe(false);
    expect(privacy?.blockedUsers).toEqual(['user_a', 'user_b']);

    const publicDoc = await readDoc(`users_public/${uid}`);
    expect(publicDoc?.accountVisibility).toBe('private');
  });
});
