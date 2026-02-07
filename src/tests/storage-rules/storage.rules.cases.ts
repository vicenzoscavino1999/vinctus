import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import 'firebase/compat/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import { cleanupRulesTestEnv, clearRulesTestData, getRulesTestEnv } from '@/tests/rules/testEnv';

async function seedDirectConversation(conversationId = 'dm_user_b_user_c') {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`conversations/${conversationId}`).set({
      type: 'direct',
      memberIds: ['user_b', 'user_c'],
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await db.doc(`conversations/${conversationId}/members/user_b`).set({
      uid: 'user_b',
      role: 'member',
      joinedAt: new Date('2026-01-01T00:00:00Z'),
      lastReadClientAt: Date.now(),
      lastReadAt: new Date('2026-01-01T00:00:00Z'),
      muted: false,
    });
    await db.doc(`conversations/${conversationId}/members/user_c`).set({
      uid: 'user_c',
      role: 'member',
      joinedAt: new Date('2026-01-01T00:00:00Z'),
      lastReadClientAt: Date.now(),
      lastReadAt: new Date('2026-01-01T00:00:00Z'),
      muted: false,
    });
  });
}

async function seedFriendIndex(uid = 'user_a', friendUid = 'user_b') {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`users/${uid}/friends/${friendUid}`).set({
      uid: friendUid,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    await db.doc(`users/${friendUid}/friends/${uid}`).set({
      uid,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
  });
}

async function seedStory(storyId = 'story_alpha', ownerId = 'user_b') {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`stories/${storyId}`).set({
      ownerId,
      ownerSnapshot: {
        displayName: 'User B',
        photoURL: null,
      },
      mediaType: 'image',
      mediaUrl: `https://example.com/${storyId}.jpg`,
      mediaPath: `stories/${ownerId}/${storyId}/original/story.jpg`,
      thumbUrl: null,
      thumbPath: null,
      visibility: 'friends',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: new Date('2026-01-02T00:00:00Z'),
    });
  });
}

async function seedStorageFile(path: string, contentType: string) {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const storage = ctx.storage();
    await storage.ref(path).putString('seed-bytes', 'raw', { contentType });
  });
}

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

  it('allows conversation attachment upload only for conversation members', async () => {
    await seedDirectConversation('dm_user_b_user_c');
    const env = await getRulesTestEnv();

    const memberStorage = env.authenticatedContext('user_b').storage();
    await assertSucceeds(
      (async () => {
        await memberStorage
          .ref('conversations/dm_user_b_user_c/attachments/user_b/msg_1/file.pdf')
          .putString('file-bytes', 'raw', { contentType: 'application/pdf' });
      })(),
    );

    const outsiderStorage = env.authenticatedContext('user_a').storage();
    await assertFails(
      (async () => {
        await outsiderStorage
          .ref('conversations/dm_user_b_user_c/attachments/user_a/msg_1/file.pdf')
          .putString('file-bytes', 'raw', { contentType: 'application/pdf' });
      })(),
    );
  });

  it('denies conversation attachment read for non-members', async () => {
    await seedDirectConversation('dm_user_b_user_c');
    await seedStorageFile(
      'conversations/dm_user_b_user_c/attachments/user_b/msg_1/file.pdf',
      'application/pdf',
    );
    const env = await getRulesTestEnv();

    const memberStorage = env.authenticatedContext('user_c').storage();
    await assertSucceeds(
      memberStorage
        .ref('conversations/dm_user_b_user_c/attachments/user_b/msg_1/file.pdf')
        .getMetadata(),
    );

    const outsiderStorage = env.authenticatedContext('user_a').storage();
    await assertFails(
      outsiderStorage
        .ref('conversations/dm_user_b_user_c/attachments/user_b/msg_1/file.pdf')
        .getMetadata(),
    );
  });

  it('denies story media read for non-friend users', async () => {
    await seedStory('story_friend_only', 'user_b');
    await seedStorageFile('stories/user_b/story_friend_only/original/story.jpg', 'image/jpeg');
    const env = await getRulesTestEnv();

    const outsiderStorage = env.authenticatedContext('user_c').storage();
    await assertFails(
      outsiderStorage.ref('stories/user_b/story_friend_only/original/story.jpg').getMetadata(),
    );
  });

  it('allows story media read for friends and owner', async () => {
    await seedStory('story_visible', 'user_b');
    await seedFriendIndex('user_a', 'user_b');
    await seedStorageFile('stories/user_b/story_visible/original/story.jpg', 'image/jpeg');
    const env = await getRulesTestEnv();

    const ownerStorage = env.authenticatedContext('user_b').storage();
    await assertSucceeds(
      ownerStorage.ref('stories/user_b/story_visible/original/story.jpg').getMetadata(),
    );

    const friendStorage = env.authenticatedContext('user_a').storage();
    await assertSucceeds(
      friendStorage.ref('stories/user_b/story_visible/original/story.jpg').getMetadata(),
    );
  });
});
