import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { reconcileUserPostCount } from '../functions/lib/postCounts.js';

// This suite starts real triggers and must never run against a remote project.
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):8080$/);
assert.equal(process.env.GCLOUD_PROJECT, 'vinctus-dev');
const app = initializeApp({ projectId: 'vinctus-dev' }, 'post-count-tests');
const db = getFirestore(app);
after(() => deleteApp(app));

async function makeProfile() {
  const uid = randomUUID();
  const profile = { displayName: 'Prueba de publicaciones', postsCount: 99 };
  await db.doc(`users/${uid}`).set(profile);
  await db.doc(`users_public/${uid}`).set(profile);
  return uid;
}

function post(authorId, status = 'ready') {
  return {
    authorId,
    authorSnapshot: { displayName: 'Prueba', photoURL: null },
    text: 'Publicación de prueba',
    content: 'Publicación de prueba',
    media: [],
    status,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: null,
  };
}

async function expectCounts(uid, expected) {
  let actual;
  for (let attempt = 0; attempt < 100; attempt++) {
    const snapshots = await db.getAll(db.doc(`users/${uid}`), db.doc(`users_public/${uid}`));
    actual = snapshots.map((snapshot) => snapshot.data()?.postsCount);
    if (actual.every((count) => count === expected)) return;
    await delay(200);
  }
  assert.deepEqual(actual, [expected, expected]);
}

test('real triggers count only completed and legacy posts through retry and deletion', async () => {
  const uid = await makeProfile();
  const ref = db.collection('posts').doc();
  await ref.set(post(uid, 'uploading'));
  // Starting at 99 proves the creation trigger ran rather than observing initial zero.
  await expectCounts(uid, 0);
  await ref.update({ status: 'failed' });
  await ref.update({ status: 'ready' });
  await expectCounts(uid, 1);
  await ref.update({ status: 'ready', updatedAt: FieldValue.serverTimestamp() });
  await reconcileUserPostCount(db, uid);
  await reconcileUserPostCount(db, uid);
  await expectCounts(uid, 1);
  await ref.update({ status: 'failed' });
  await expectCounts(uid, 0);

  const legacy = post(uid);
  delete legacy.status;
  const legacyRef = await db.collection('posts').add(legacy);
  const nullRef = await db.collection('posts').add(post(uid, null));
  const hiddenRef = await db.collection('posts').add(post(uid, 'unknown'));
  await expectCounts(uid, 2);
  await Promise.all([ref.delete(), hiddenRef.delete()]);
  await reconcileUserPostCount(db, uid);
  await expectCounts(uid, 2);
  await Promise.all([legacyRef.delete(), nullRef.delete()]);
  await expectCounts(uid, 0);
});

test('late/repeated reconciliation uses current data and keeps authors separate', async () => {
  const a = await makeProfile();
  const b = await makeProfile();
  const batch = db.batch();
  const removed = [];
  for (let i = 0; i < 8; i++) {
    const ref = db.collection('posts').doc();
    batch.set(ref, post(a));
    if (i < 3) removed.push(ref);
  }
  const other = db.collection('posts').doc();
  batch.set(other, post(b));
  await batch.commit();
  await expectCounts(a, 8);
  await expectCounts(b, 1);
  await Promise.all(removed.map((ref) => ref.delete()));
  // Represents delayed create/update/delete events arriving after newer state.
  await Promise.all(Array.from({ length: 4 }, () => reconcileUserPostCount(db, a)));
  await expectCounts(a, 5);
  await expectCounts(b, 1);
  await other.update({ authorId: a });
  await expectCounts(a, 6);
  await expectCounts(b, 0);
  const before = await db.doc(`users/${a}`).get();
  await reconcileUserPostCount(db, a);
  const after = await db.doc(`users/${a}`).get();
  assert.ok(
    before.updateTime.isEqual(after.updateTime),
    'unchanged count must not rewrite the user',
  );
});

test('late events do not recreate deleted account documents', async () => {
  const uid = await makeProfile();
  const ref = await db.collection('posts').add(post(uid));
  await expectCounts(uid, 1);
  await db.doc(`users_public/${uid}`).delete();
  await reconcileUserPostCount(db, uid);
  assert.equal((await db.doc(`users_public/${uid}`).get()).exists, false);
  await db.doc(`users/${uid}`).delete();
  await ref.delete();
  await reconcileUserPostCount(db, uid);
  assert.equal((await db.doc(`users/${uid}`).get()).exists, false);
  assert.equal((await db.doc(`users_public/${uid}`).get()).exists, false);
});
