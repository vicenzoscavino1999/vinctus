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
const { FieldValue, getFirestore } = requireFunctions('firebase-admin/firestore');
const { getStorage } = requireFunctions('firebase-admin/storage');

const app = initializeApp(
  { projectId: 'vinctus-dev', storageBucket: 'vinctus-dev.appspot.com' },
  'collection-cleanup-tests',
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

test('onCollectionItemWritten reconciles itemCount and deletes Storage file, and onCollectionDeleted purges items and files', async () => {
  const uid = randomUUID();
  const otherUid = randomUUID();
  const collectionId = randomUUID();
  const fileItem1 = randomUUID();
  const fileItem2 = randomUUID();

  const filePath1 = `collections/${uid}/${collectionId}/${fileItem1}/paper1.pdf`;
  const filePath2 = `collections/${uid}/${collectionId}/${fileItem2}/paper2.pdf`;
  const victimPath = `collections/${otherUid}/${collectionId}/keep/keep.pdf`;

  const collectionRef = db.doc(`users/${uid}/collections/${collectionId}`);

  await Promise.all([
    bucket.file(filePath1).save(Buffer.from('%PDF-1.4 one'), { contentType: 'application/pdf' }),
    bucket.file(filePath2).save(Buffer.from('%PDF-1.4 two'), { contentType: 'application/pdf' }),
    bucket.file(victimPath).save(Buffer.from('%PDF-1.4 keep'), { contentType: 'application/pdf' }),
    collectionRef.set({
      name: 'Investigación',
      icon: 'book',
      // Intentionally drifted count to verify reconciliation.
      itemCount: 99,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
  ]);

  await Promise.all([
    collectionRef.collection('items').doc(fileItem1).set({
      ownerId: uid,
      collectionId,
      collectionName: 'Investigación',
      type: 'file',
      title: 'Paper 1',
      url: 'https://example.com/paper1.pdf',
      text: null,
      fileName: 'paper1.pdf',
      fileSize: 12,
      contentType: 'application/pdf',
      storagePath: filePath1,
      createdAt: FieldValue.serverTimestamp(),
    }),
    collectionRef.collection('items').doc(fileItem2).set({
      ownerId: uid,
      collectionId,
      collectionName: 'Investigación',
      type: 'file',
      title: 'Paper 2',
      url: 'https://example.com/paper2.pdf',
      text: null,
      fileName: 'paper2.pdf',
      fileSize: 12,
      contentType: 'application/pdf',
      storagePath: filePath2,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);

  await waitFor(async () => {
    const snap = await collectionRef.get();
    return snap.data()?.itemCount === 2;
  }, 'reconciled itemCount == 2 after creating two items');

  // Deleting item 1 should clean up filePath1 and reconcile itemCount to 1.
  await collectionRef.collection('items').doc(fileItem1).delete();

  await waitFor(async () => {
    const [exists1] = await bucket.file(filePath1).exists();
    const snap = await collectionRef.get();
    return !exists1 && snap.data()?.itemCount === 1;
  }, 'item 1 storage cleanup and itemCount == 1');

  // Defense-in-depth: even if a legacy doc carries a foreign storagePath, deleting it must NOT touch another user's object.
  const poisonedItem = randomUUID();
  await collectionRef.collection('items').doc(poisonedItem).set({
    ownerId: uid,
    collectionId,
    collectionName: 'Investigación',
    type: 'file',
    title: 'Legacy poisoned',
    url: 'https://example.com/keep.pdf',
    text: null,
    fileName: 'keep.pdf',
    fileSize: 12,
    contentType: 'application/pdf',
    storagePath: victimPath,
    createdAt: FieldValue.serverTimestamp(),
  });
  await waitFor(async () => {
    const snap = await collectionRef.get();
    return snap.data()?.itemCount === 2;
  }, 'reconciled itemCount == 2 after adding poisoned item');
  await collectionRef.collection('items').doc(poisonedItem).delete();
  await waitFor(async () => {
    const snap = await collectionRef.get();
    return snap.data()?.itemCount === 1;
  }, 'reconciled itemCount == 1 after deleting poisoned item');
  const [victimAfterPoisonDelete] = await bucket.file(victimPath).exists();
  assert.equal(victimAfterPoisonDelete, true);

  // Deleting the collection should purge item 2 and filePath2 without touching otherUid's file.
  await collectionRef.delete();

  await waitFor(async () => {
    const [exists2] = await bucket.file(filePath2).exists();
    const item2Snap = await collectionRef.collection('items').doc(fileItem2).get();
    return !exists2 && !item2Snap.exists;
  }, 'collection deletion cleanup of remaining item and storage file');

  const [victimExists] = await bucket.file(victimPath).exists();
  assert.equal(victimExists, true);
  const collectionAfter = await collectionRef.get();
  assert.equal(collectionAfter.exists, false);
});
