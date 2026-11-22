import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { reconcileGroupMemberCount } from '../functions/lib/groupCounts.js';

// Runs against the local emulators alongside post-counts; must never point to production.
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):8080$/);
assert.equal(process.env.GCLOUD_PROJECT, 'vinctus-dev');
const app = initializeApp({ projectId: 'vinctus-dev' }, 'group-count-tests');
const db = getFirestore(app);
after(() => deleteApp(app));

async function expectGroupMemberCount(groupId, expectedCount) {
  let actual;
  for (let attempt = 0; attempt < 100; attempt++) {
    const snap = await db.doc(`groups/${groupId}`).get();
    actual = snap.data()?.memberCount;
    if (actual === expectedCount) return;
    await delay(200);
  }
  assert.equal(actual, expectedCount, `Expected group ${groupId} memberCount=${expectedCount}`);
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

test('group member triggers reconcile counts without double counting and clean up on group delete', async () => {
  const groupId = randomUUID();
  const ownerId = randomUUID();
  const bobId = randomUUID();
  const carolId = randomUUID();
  const outsiderId = randomUUID();
  const reqId = randomUUID();

  await db.doc(`groups/${groupId}`).set({
    name: 'Fisica Experimental',
    description: 'Grupo de prueba',
    categoryId: 'science',
    visibility: 'private',
    ownerId,
    iconUrl: null,
    memberCount: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Owner membership created right after group doc must keep memberCount at 1, not 2.
  await Promise.all([
    db.doc(`groups/${groupId}/members/${ownerId}`).set({
      uid: ownerId,
      groupId,
      role: 'admin',
      joinedAt: FieldValue.serverTimestamp(),
    }),
    db.doc(`users/${ownerId}/memberships/${groupId}`).set({
      groupId,
      joinedAt: FieldValue.serverTimestamp(),
    }),
  ]);

  await waitForDocExists(`conversations/grp_${groupId}/members/${ownerId}`, true);
  await delay(800);
  await expectGroupMemberCount(groupId, 1);

  // Add Bob & Carol -> memberCount should reconcile cleanly to 3.
  await Promise.all([
    db.doc(`groups/${groupId}/members/${bobId}`).set({
      uid: bobId,
      groupId,
      role: 'member',
      joinedAt: FieldValue.serverTimestamp(),
    }),
    db.doc(`users/${bobId}/memberships/${groupId}`).set({
      groupId,
      joinedAt: FieldValue.serverTimestamp(),
    }),
    db.doc(`groups/${groupId}/members/${carolId}`).set({
      uid: carolId,
      groupId,
      role: 'moderator',
      joinedAt: FieldValue.serverTimestamp(),
    }),
    db.doc(`users/${carolId}/memberships/${groupId}`).set({
      groupId,
      joinedAt: FieldValue.serverTimestamp(),
    }),
  ]);

  await waitForDocExists(`conversations/grp_${groupId}/members/${bobId}`, true);
  await expectGroupMemberCount(groupId, 3);

  // Simulate duplicated reconciliations and removing Bob.
  await Promise.all([
    reconcileGroupMemberCount(db, groupId),
    reconcileGroupMemberCount(db, groupId),
    db.doc(`groups/${groupId}/members/${bobId}`).delete(),
    db.doc(`users/${bobId}/memberships/${groupId}`).delete(),
  ]);

  await expectGroupMemberCount(groupId, 2);
  await waitForDocExists(`conversations/grp_${groupId}/members/${bobId}`, false);

  // Seed a pending join request for the group, then delete the group itself.
  await db.doc(`group_requests/${reqId}`).set({
    groupId,
    groupName: 'Fisica Experimental',
    fromUid: outsiderId,
    toUid: ownerId,
    status: 'pending',
    message: null,
    fromUserName: 'Outsider',
    fromUserPhoto: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db.doc(`groups/${groupId}`).delete();

  await waitForDocExists(`groups/${groupId}/members/${ownerId}`, false);
  await waitForDocExists(`groups/${groupId}/members/${carolId}`, false);
  await waitForDocExists(`users/${ownerId}/memberships/${groupId}`, false);
  await waitForDocExists(`users/${carolId}/memberships/${groupId}`, false);
  await waitForDocExists(`group_requests/${reqId}`, false);
  await waitForDocExists(`conversations/grp_${groupId}`, false);

  // Late reconciliation after group deletion must not recreate the group document.
  await delay(600);
  await reconcileGroupMemberCount(db, groupId);
  const deletedGroup = await db.doc(`groups/${groupId}`).get();
  assert.equal(deletedGroup.exists, false);
});
