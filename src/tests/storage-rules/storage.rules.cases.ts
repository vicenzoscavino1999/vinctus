import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import 'firebase/compat/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import { cleanupRulesTestEnv, clearRulesTestData, getRulesTestEnv } from '@/tests/rules/testEnv';

describe('Storage Rules - upload security', () => {
  beforeAll(async () => {
    await getRulesTestEnv();
  });

  beforeEach(async () => {
    await clearRulesTestData();
  });

  afterAll(async () => {
    await cleanupRulesTestEnv();
  });

  it('allows owner to upload a valid post image', async () => {
    const env = await getRulesTestEnv();
    const storage = env.authenticatedContext('user_a').storage();
    const fileRef = storage.ref('posts/user_a/post_alpha/images/cover.jpg');

    await assertSucceeds(
      (async () => {
        await fileRef.putString('image-bytes', 'raw', { contentType: 'image/jpeg' });
      })(),
    );
  });

  it('denies upload when auth user does not match path owner', async () => {
    const env = await getRulesTestEnv();
    const storage = env.authenticatedContext('user_b').storage();
    const fileRef = storage.ref('posts/user_a/post_alpha/images/cover.jpg');

    await assertFails(
      (async () => {
        await fileRef.putString('image-bytes', 'raw', { contentType: 'image/jpeg' });
      })(),
    );
  });

  it('denies invalid content type for post image path', async () => {
    const env = await getRulesTestEnv();
    const storage = env.authenticatedContext('user_a').storage();
    const fileRef = storage.ref('posts/user_a/post_alpha/images/readme.txt');

    await assertFails(
      (async () => {
        await fileRef.putString('plain text', 'raw', { contentType: 'text/plain' });
      })(),
    );
  });
});
