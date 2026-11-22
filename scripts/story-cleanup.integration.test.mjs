import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

for (const [key, port] of [
  ['FIRESTORE_EMULATOR_HOST', 8080],
  ['FIREBASE_STORAGE_EMULATOR_HOST', 9199],
]) {
  assert.match(process.env[key] ?? '', new RegExp(`^(127\\.0\\.0\\.1|localhost):${port}$`));
}
assert.equal(process.env.GCLOUD_PROJECT, 'vinctus-dev');

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
const { FieldValue, getFirestore, Timestamp } = requireFunctions('firebase-admin/firestore');
const { getStorage } = requireFunctions('firebase-admin/storage');

const app = initializeApp(
  { projectId: 'vinctus-dev', storageBucket: 'vinctus-dev.appspot.com' },
  'story-cleanup-tests',
);
const db = getFirestore(app);
const bucket = getStorage(app).bucket();
after(() => deleteApp(app));

async function waitFor(check, description) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await delay(200);
  }
  assert.fail(`Timed out waiting for: ${description}`);
}

test('onStoryDeleted removes owned Storage files and onUserBlockedCreated clears symmetric friend indexes', async () => {
  const ownerId = randomUUID();
  const viewerId = randomUUID();
  const storyId = randomUUID();
  const victimId = randomUUID();

  const mediaPath = `stories/${ownerId}/${storyId}/original/story.jpg`;
  const thumbPath = `stories/${ownerId}/${storyId}/thumb/thumb.webp`;
  const victimPath = `stories/${victimId}/other/original/keep.jpg`;

  await Promise.all([
    bucket.file(mediaPath).save(Buffer.from('image-bytes'), { contentType: 'image/jpeg' }),
    bucket.file(thumbPath).save(Buffer.from('thumb-bytes'), { contentType: 'image/webp' }),
    bucket.file(victimPath).save(Buffer.from('keep-bytes'), { contentType: 'image/jpeg' }),
    db.doc(`users/${ownerId}/friends/${viewerId}`).set({ uid: viewerId, createdAt: FieldValue.serverTimestamp() }),
    db.doc(`users/${viewerId}/friends/${ownerId}`).set({ uid: ownerId, createdAt: FieldValue.serverTimestamp() }),
  ]);

  await db.doc(`stories/${storyId}`).set({
    ownerId,
    ownerSnapshot: { displayName: 'Owner', photoURL: null },
    mediaType: 'image',
    mediaUrl: 'https://example.com/story.jpg',
    mediaPath,
    thumbUrl: 'https://example.com/thumb.webp',
    thumbPath,
    visibility: 'friends',
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
  });

  await db.doc(`stories/${storyId}`).delete();

  await waitFor(async () => {
    const [mediaExists] = await bucket.file(mediaPath).exists();
    const [thumbExists] = await bucket.file(thumbPath).exists();
    return !mediaExists && !thumbExists;
  }, 'story media and thumbnail deletion');

  const [victimExists] = await bucket.file(victimPath).exists();
  assert.equal(victimExists, true);

  await db.doc(`users/${ownerId}/blockedUsers/${viewerId}`).set({
    blockedUid: viewerId,
    status: 'active',
    blockedAt: FieldValue.serverTimestamp(),
  });

  await waitFor(async () => {
    const [a, b] = await Promise.all([
      db.doc(`users/${ownerId}/friends/${viewerId}`).get(),
      db.doc(`users/${viewerId}/friends/${ownerId}`).get(),
    ]);
    return !a.exists && !b.exists;
  }, 'symmetric friend index deletion on block');
});
