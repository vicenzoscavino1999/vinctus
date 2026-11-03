import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'firebase/compat/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';

import {
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_PRIVACY_SETTINGS,
  getUserSettings,
} from '@/features/settings/api/queries';
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

describe('Settings API (emulator) - queries', () => {
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

  it('returns defaults when settings are missing', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const settings = await getUserSettings(uid);
    expect(settings.notifications).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    expect(settings.privacy).toEqual(DEFAULT_PRIVACY_SETTINGS);
  });

  it('normalizes stored settings and fills missing fields', async () => {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await seedDoc(`users/${uid}`, {
      settings: {
        notifications: { pushEnabled: false, mentionsOnly: true },
        privacy: {
          accountVisibility: 'private',
          showOnlineStatus: false,
          blockedUsers: ['user_a', 123],
        },
      },
    });

    const settings = await getUserSettings(uid);
    expect(settings.notifications.pushEnabled).toBe(false);
    expect(settings.notifications.mentionsOnly).toBe(true);
    expect(settings.notifications.emailEnabled).toBe(true);

    expect(settings.privacy.accountVisibility).toBe('private');
    expect(settings.privacy.showOnlineStatus).toBe(false);
    expect(settings.privacy.allowDirectMessages).toBe(true);
    expect(settings.privacy.blockedUsers).toEqual(['user_a']);
  });

  it('validates inputs with AppError', async () => {
    await expect(getUserSettings('')).rejects.toSatisfy(isAppError);
  });
});
