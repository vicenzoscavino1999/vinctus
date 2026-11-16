import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

for (const [key, port] of [
  ['FIRESTORE_EMULATOR_HOST', 8080],
  ['FIREBASE_AUTH_EMULATOR_HOST', 9099],
  ['FIREBASE_STORAGE_EMULATOR_HOST', 9199],
]) {
  assert.match(process.env[key] ?? '', new RegExp(`^(127\\.0\\.0\\.1|localhost):${port}$`));
}
assert.equal(process.env.GCLOUD_PROJECT, 'vinctus-dev');

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
const { getFirestore, Timestamp } = requireFunctions('firebase-admin/firestore');
const { getStorage } = requireFunctions('firebase-admin/storage');
const {
  ABANDONED_POST_STATUS,
  ABANDONED_UPLOAD_AFTER_MS,
  LATE_UPLOAD_GRACE_MS,
  cleanupAbandonedPostUploads,
  reserveDeletedUnfinishedPost,
} = await import('../functions/lib/postUploadCleanup.js');

const app = initializeApp(
  { projectId: 'vinctus-dev', storageBucket: 'vinctus-dev.appspot.com' },
  'post-upload-cleanup-tests',
);
const db = getFirestore(app);
const bucket = getStorage(app).bucket();
const id = () => randomUUID();
after(() => deleteApp(app));

async function makeAuthor() {
  const uid = `cleanup_author_${id()}`;
  await db.doc(`users/${uid}`).set({ displayName: 'Autor', postsCount: 0 });
  await db.doc(`users_public/${uid}`).set({
    displayName: 'Autor',
    accountVisibility: 'public',
    postsCount: 0,
  });
  return uid;
}

async function putObject(path, contentType = 'image/webp', bytes = 'media-bytes') {
  await bucket.file(path).save(Buffer.from(bytes), {
    contentType,
    metadata: { cacheControl: 'private,no-store,max-age=0' },
  });
}

async function objectExists(path) {
  const [exists] = await bucket.file(path).exists();
  return exists;
}

test('cleanup preserves accepted posts and recoverable unfinished drafts within the recovery window or with recent uploads', async () => {
  const authorId = await makeAuthor();
  const baseNow = new Date('2026-11-16T00:00:00.000Z');
  const staleCreatedAt = Timestamp.fromMillis(
    baseNow.getTime() - ABANDONED_UPLOAD_AFTER_MS - 3_600_000,
  );
  const recentCreatedAt = Timestamp.fromMillis(baseNow.getTime() - 2 * 24 * 3_600_000);

  // 1. Accepted ready post (even old, e.g. after a lost client acknowledgement)
  const readyId = `ready_${id()}`;
  const readyPath = `posts/${authorId}/${readyId}/images/f1_photo.webp`;
  await putObject(readyPath);
  await db.doc(`posts/${readyId}`).set({
    postId: readyId,
    authorId,
    authorSnapshot: { displayName: 'Autor', photoURL: null },
    title: 'Aceptado',
    text: 'Nunca debe limpiarse',
    status: 'ready',
    media: [{ type: 'image', path: readyPath, url: `post-media:${readyPath}` }],
    createdAt: staleCreatedAt,
    updatedAt: staleCreatedAt,
  });

  // 2. Unfinished post within the 7-day local draft recovery window
  const recentUploadingId = `recent_uploading_${id()}`;
  const recentUploadingPath = `posts/${authorId}/${recentUploadingId}/videos/v1_clip.mp4`;
  await putObject(recentUploadingPath, 'video/mp4');
  await db.doc(`posts/${recentUploadingId}`).set({
    postId: recentUploadingId,
    authorId,
    authorSnapshot: { displayName: 'Autor', photoURL: null },
    title: 'Reciente',
    text: 'Borrador recuperable',
    status: 'uploading',
    media: [],
    createdAt: recentCreatedAt,
    updatedAt: null,
  });

  // 3. Old unfinished post whose Storage folder has a recent object (active retry)
  const activeRetryId = `active_retry_${id()}`;
  const activeRetryPath = `posts/${authorId}/${activeRetryId}/files/d1_notes.pdf`;
  await putObject(activeRetryPath, 'application/pdf');
  await db.doc(`posts/${activeRetryId}`).set({
    postId: activeRetryId,
    authorId,
    authorSnapshot: { displayName: 'Autor', photoURL: null },
    title: 'Reintento activo',
    text: 'Subió un archivo hoy',
    status: 'uploading',
    media: [],
    createdAt: staleCreatedAt,
    updatedAt: null,
  });

  const report = await cleanupAbandonedPostUploads(db, bucket, { now: baseNow, limit: 100 });
  assert.ok(report.skippedActive >= 1);

  const [readySnap, recentSnap, activeSnap] = await db.getAll(
    db.doc(`posts/${readyId}`),
    db.doc(`posts/${recentUploadingId}`),
    db.doc(`posts/${activeRetryId}`),
  );
  assert.equal(readySnap.data()?.status, 'ready');
  assert.equal(recentSnap.data()?.status, 'uploading');
  assert.equal(activeSnap.data()?.status, 'uploading');
  assert.equal(await objectExists(readyPath), true);
  assert.equal(await objectExists(recentUploadingPath), true);
  assert.equal(await objectExists(activeRetryPath), true);
});

test('two-pass cleanup retires stale unfinished uploads, purges objects and removes the tombstone after grace without race overlap', async () => {
  const authorId = await makeAuthor();
  const staleId = `stale_${id()}`;
  const staleImage = `posts/${authorId}/${staleId}/images/img1.webp`;
  const staleDoc = `posts/${authorId}/${staleId}/files/doc1.pdf`;
  await putObject(staleImage, 'image/webp');
  await putObject(staleDoc, 'application/pdf');

  // Set `now` far enough in the future that both Firestore `createdAt` and Storage `timeCreated` are >7 days old.
  const pass1Now = new Date(Date.now() + ABANDONED_UPLOAD_AFTER_MS + 60_000);
  await db.doc(`posts/${staleId}`).set({
    postId: staleId,
    authorId,
    authorSnapshot: { displayName: 'Autor', photoURL: null },
    title: 'Abandonado',
    text: 'Texto sensible del borrador',
    content: 'Texto sensible del borrador',
    status: 'uploading',
    media: [],
    createdAt: Timestamp.fromMillis(Date.now() - 10_000),
    updatedAt: null,
  });

  // Run two cleanup invocations concurrently to verify lease fencing.
  const [firstRun, secondRun] = await Promise.all([
    cleanupAbandonedPostUploads(db, bucket, { now: pass1Now, limit: 100 }),
    cleanupAbandonedPostUploads(db, bucket, { now: pass1Now, limit: 100 }),
  ]);
  const totalRetired = firstRun.retired + secondRun.retired;
  const totalPurged = firstRun.purged + secondRun.purged;
  assert.ok(totalRetired >= 1);
  assert.equal(totalPurged, totalRetired);
  assert.ok(firstRun.skippedChanged + secondRun.skippedChanged >= 1);
  assert.equal(await objectExists(staleImage), false);
  assert.equal(await objectExists(staleDoc), false);

  const retiredSnap = await db.doc(`posts/${staleId}`).get();
  assert.equal(retiredSnap.exists, true);
  assert.equal(retiredSnap.data()?.status, ABANDONED_POST_STATUS);
  assert.equal(retiredSnap.data()?.title, null);
  assert.equal(retiredSnap.data()?.text, '');
  assert.equal(retiredSnap.data()?.content, undefined);
  assert.equal(retiredSnap.data()?.mediaCleanupPass, 1);

  // Before the 8-day grace expires, the tombstone stays in place.
  const midGraceNow = new Date(pass1Now.getTime() + 1_000);
  await cleanupAbandonedPostUploads(db, bucket, { now: midGraceNow, limit: 100 });
  assert.equal((await db.doc(`posts/${staleId}`).get()).exists, true);

  // Simulate a pre-authorized resumable upload completing late before Pass 2.
  const lateVideo = `posts/${authorId}/${staleId}/videos/late.mp4`;
  await putObject(lateVideo, 'video/mp4');
  assert.equal(await objectExists(lateVideo), true);

  const pass2Now = new Date(pass1Now.getTime() + LATE_UPLOAD_GRACE_MS + 60_000);
  const pass2Report = await cleanupAbandonedPostUploads(db, bucket, { now: pass2Now, limit: 100 });
  assert.ok(pass2Report.tombstonesRemoved >= 1);
  assert.equal(await objectExists(lateVideo), false);
  assert.equal((await db.doc(`posts/${staleId}`).get()).exists, false);
});

test('deleting an unfinished post reserves a tombstone and purges its partial objects unless the account is deleting', async () => {
  const authorId = await makeAuthor();
  const unfinishedId = `deleted_unfinished_${id()}`;
  const orphanPath = `posts/${authorId}/${unfinishedId}/images/partial.webp`;
  await putObject(orphanPath, 'image/webp');

  await db.doc(`posts/${unfinishedId}`).set({
    postId: unfinishedId,
    authorId,
    authorSnapshot: { displayName: 'Autor', photoURL: null },
    title: 'Incompleto',
    text: 'Borrado tras revocación',
    status: 'failed',
    media: [],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  // Delete the unfinished post; onPostDeleted trigger should reserve the tombstone and purge Storage.
  await db.doc(`posts/${unfinishedId}`).delete();

  let tombstoneData = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const snap = await db.doc(`posts/${unfinishedId}`).get();
    const exists = await objectExists(orphanPath);
    if (snap.exists && snap.data()?.status === ABANDONED_POST_STATUS && !exists) {
      tombstoneData = snap.data();
      break;
    }
    await delay(200);
  }
  assert.ok(
    tombstoneData,
    'Expected onPostDeleted to reserve an abandoned tombstone and purge Storage',
  );
  assert.equal(tombstoneData.status, ABANDONED_POST_STATUS);
  assert.equal(await objectExists(orphanPath), false);

  // When an account has an active deletion job, reserveDeletedUnfinishedPost must not create new docs.
  const deletingAuthor = await makeAuthor();
  const deletingPostId = `deleting_account_${id()}`;
  await db.doc(`deletionJobs/${deletingAuthor}`).set({ uid: deletingAuthor, status: 'running' });
  const reserved = await reserveDeletedUnfinishedPost(db, deletingPostId, {
    authorId: deletingAuthor,
    status: 'uploading',
    createdAt: Timestamp.now(),
  });
  assert.equal(reserved, false);
  assert.equal((await db.doc(`posts/${deletingPostId}`).get()).exists, false);
});
