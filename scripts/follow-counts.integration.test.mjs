import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  reconcileUserFollowersCount,
  reconcileUserFollowingCount,
} from '../functions/lib/followCounts.js';

// Runs against the local emulators alongside post-counts; must never point to production.
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):8080$/);
assert.equal(process.env.GCLOUD_PROJECT, 'vinctus-dev');
const app = initializeApp({ projectId: 'vinctus-dev' }, 'follow-count-tests');
const db = getFirestore(app);
after(() => deleteApp(app));

async function makeUser(displayName) {
  const uid = randomUUID();
  const base = {
    uid,
    displayName,
    followersCount: 77,
    followingCount: 66,
    accountVisibility: 'public',
  };
  await db.doc(`users/${uid}`).set(base);
  await db.doc(`users_public/${uid}`).set(base);
  return uid;
}

async function expectFollowCounts(uid, expectedFollowers, expectedFollowing) {
  let actual;
  for (let attempt = 0; attempt < 100; attempt++) {
    const [privSnap, pubSnap] = await db.getAll(
      db.doc(`users/${uid}`),
      db.doc(`users_public/${uid}`),
    );
    actual = [
      privSnap.data()?.followersCount,
      pubSnap.data()?.followersCount,
      privSnap.data()?.followingCount,
      pubSnap.data()?.followingCount,
    ];
    if (
      actual[0] === expectedFollowers &&
      actual[1] === expectedFollowers &&
      actual[2] === expectedFollowing &&
      actual[3] === expectedFollowing
    ) {
      return;
    }
    await delay(200);
  }
  assert.deepEqual(actual, [
    expectedFollowers,
    expectedFollowers,
    expectedFollowing,
    expectedFollowing,
  ]);
}

async function waitForDocExists(path, expectedExists) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const snap = await db.doc(path).get();
    if (snap.exists === expectedExists) return;
    await delay(200);
  }
  const finalSnap = await db.doc(path).get();
  assert.equal(finalSnap.exists, expectedExists, `Expected ${path} exists=${expectedExists}`);
}

test('real triggers reconcile follower and following counts across churn and do not resurrect deleted users', async () => {
  const alice = await makeUser('Alice Follow');
  const bob = await makeUser('Bob Follow');
  const carol = await makeUser('Carol Follow');

  await Promise.all([
    db.doc(`users/${alice}/following/${bob}`).set({ uid: bob, createdAt: FieldValue.serverTimestamp() }),
    db.doc(`users/${bob}/followers/${alice}`).set({ uid: alice, createdAt: FieldValue.serverTimestamp() }),
    db.doc(`users/${alice}/following/${carol}`).set({ uid: carol, createdAt: FieldValue.serverTimestamp() }),
    db.doc(`users/${carol}/followers/${alice}`).set({ uid: alice, createdAt: FieldValue.serverTimestamp() }),
  ]);

  await expectFollowCounts(alice, 0, 2);
  await expectFollowCounts(bob, 1, 0);
  await expectFollowCounts(carol, 1, 0);

  await Promise.all([
    db.doc(`users/${alice}/following/${bob}`).delete(),
    db.doc(`users/${bob}/followers/${alice}`).delete(),
  ]);
  // Simulate late or duplicated reconciliation calls firing out of order.
  await Promise.all([
    reconcileUserFollowingCount(db, alice),
    reconcileUserFollowersCount(db, bob),
    reconcileUserFollowersCount(db, bob),
  ]);

  await expectFollowCounts(alice, 0, 1);
  await expectFollowCounts(bob, 0, 0);

  // Deleting a user's profile before cleaning up follower edges must not recreate users/users_public.
  await Promise.all([db.doc(`users/${carol}`).delete(), db.doc(`users_public/${carol}`).delete()]);
  await db.doc(`users/${carol}/followers/${alice}`).delete();
  await delay(500);
  const [carolPriv, carolPub] = await db.getAll(
    db.doc(`users/${carol}`),
    db.doc(`users_public/${carol}`),
  );
  assert.equal(carolPriv.exists, false);
  assert.equal(carolPub.exists, false);
});

test('onFollowRequestUpdated creates edges and onUserBlockedCreated cleans up follow state', async () => {
  const alice = await makeUser('Alice Req');
  const bob = await makeUser('Bob Req');

  const requestRef = db.doc(`follow_requests/${alice}_${bob}`);
  await requestRef.set({
    fromUid: alice,
    toUid: bob,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await requestRef.update({
    status: 'accepted',
    updatedAt: FieldValue.serverTimestamp(),
  });

  await waitForDocExists(`users/${bob}/followers/${alice}`, true);
  await waitForDocExists(`users/${alice}/following/${bob}`, true);
  await expectFollowCounts(alice, 0, 1);
  await expectFollowCounts(bob, 1, 0);

  // Blocking deletes follow edges + follow request server-side and reconciles counts to zero.
  await db.doc(`users/${bob}/blockedUsers/${alice}`).set({
    blockedUid: alice,
    status: 'active',
    blockedAt: FieldValue.serverTimestamp(),
  });

  await waitForDocExists(`users/${bob}/followers/${alice}`, false);
  await waitForDocExists(`users/${alice}/following/${bob}`, false);
  await waitForDocExists(`follow_requests/${alice}_${bob}`, false);
  await expectFollowCounts(alice, 0, 0);
  await expectFollowCounts(bob, 0, 0);
});
