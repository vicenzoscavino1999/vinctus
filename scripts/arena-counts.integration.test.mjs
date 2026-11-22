import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):8080$/);
assert.equal(process.env.GCLOUD_PROJECT, 'vinctus-dev');

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
const { FieldValue, getFirestore } = requireFunctions('firebase-admin/firestore');

const app = initializeApp({ projectId: 'vinctus-dev' }, 'arena-counts-tests');
const db = getFirestore(app);
after(() => deleteApp(app));

async function waitFor(check, description) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await delay(200);
  }
  assert.fail(`Timed out waiting for: ${description}`);
}

test('onArenaDebateLikeCreated and onArenaDebateLikeDeleted reconcile drifted likesCount accurately', async () => {
  const debateId = randomUUID();
  const debateRef = db.doc(`arenaDebates/${debateId}`);

  await debateRef.set({
    createdAt: FieldValue.serverTimestamp(),
    createdBy: 'user_a',
    topic: 'Debate de prueba para reconciliación',
    mode: 'debate',
    personaA: 'scientist',
    personaB: 'philosopher',
    status: 'done',
    visibility: 'public',
    language: 'es',
    // Intentionally drifted count to confirm reconciliation from .count().
    likesCount: 42,
  });

  await Promise.all([
    debateRef.collection('likes').doc('user_a').set({
      uid: 'user_a',
      debateId,
      createdAt: FieldValue.serverTimestamp(),
    }),
    debateRef.collection('likes').doc('user_b').set({
      uid: 'user_b',
      debateId,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);

  await waitFor(async () => {
    const snap = await debateRef.get();
    return snap.data()?.likesCount === 2;
  }, 'reconciled likesCount == 2 after two likes');

  await debateRef.collection('likes').doc('user_a').delete();

  await waitFor(async () => {
    const snap = await debateRef.get();
    return snap.data()?.likesCount === 1;
  }, 'reconciled likesCount == 1 after one unlike');

  await debateRef.collection('likes').doc('user_b').delete();

  await waitFor(async () => {
    const snap = await debateRef.get();
    return snap.data()?.likesCount === 0;
  }, 'reconciled likesCount == 0 after removing last like');
});
