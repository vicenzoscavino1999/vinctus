import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):8080$/);
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):9099$/);
assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):9199$/);
assert.equal(process.env.GCLOUD_PROJECT, 'vinctus-dev');

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
const { getAuth: getAdminAuth } = requireFunctions('firebase-admin/auth');
const { FieldValue, getFirestore } = requireFunctions('firebase-admin/firestore');
const { getStorage } = requireFunctions('firebase-admin/storage');

const adminApp = initializeApp(
  { projectId: 'vinctus-dev', storageBucket: 'vinctus-dev.appspot.com' },
  'account-security-integration-admin',
);
const db = getFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);
const bucket = getStorage(adminApp).bucket();

const clientApp = initializeClientApp(
  {
    apiKey: 'demo-api-key',
    authDomain: 'vinctus-dev.firebaseapp.com',
    projectId: 'vinctus-dev',
    storageBucket: 'vinctus-dev.appspot.com',
    appId: '1:1234567890:web:accountsecuritytest',
  },
  'account-security-integration-client',
);
const clientAuth = getAuth(clientApp);
const clientFunctions = getFunctions(clientApp, 'us-central1');
connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFunctionsEmulator(clientFunctions, '127.0.0.1', 5001);

after(async () => {
  await deleteClientApp(clientApp);
  await deleteApp(adminApp);
});

async function waitFor(check, description) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await check()) return;
    await delay(200);
  }
  assert.fail(`Timed out waiting for: ${description}`);
}

test('onUserBlockedCreated cleans up follow edges, follow/friend requests, and DM inbox indexes', async () => {
  const uidA = `blk_a_${randomUUID().slice(0, 8)}`;
  const uidB = `blk_b_${randomUUID().slice(0, 8)}`;
  const dmId = `dm_${[uidA, uidB].sort().join('_')}`;
  const friendReqId = `fr_${uidA}_${uidB}`;

  await Promise.all([
    db.doc(`users/${uidA}`).set({ uid: uidA, followersCount: 1, followingCount: 1 }),
    db.doc(`users/${uidB}`).set({ uid: uidB, followersCount: 1, followingCount: 1 }),
    db.doc(`users/${uidA}/followers/${uidB}`).set({ uid: uidB, createdAt: FieldValue.serverTimestamp() }),
    db.doc(`users/${uidA}/following/${uidB}`).set({ uid: uidB, createdAt: FieldValue.serverTimestamp() }),
    db.doc(`users/${uidB}/followers/${uidA}`).set({ uid: uidA, createdAt: FieldValue.serverTimestamp() }),
    db.doc(`users/${uidB}/following/${uidA}`).set({ uid: uidA, createdAt: FieldValue.serverTimestamp() }),
    db.doc(`follow_requests/${uidA}_${uidB}`).set({ fromUid: uidA, toUid: uidB, status: 'pending' }),
    db.doc(`friend_requests/${friendReqId}`).set({ fromUid: uidA, toUid: uidB, status: 'pending' }),
    db.doc(`users/${uidA}/directConversations/${dmId}`).set({ conversationId: dmId, otherUid: uidB }),
    db.doc(`users/${uidB}/directConversations/${dmId}`).set({ conversationId: dmId, otherUid: uidA }),
  ]);

  await db.doc(`users/${uidA}/blockedUsers/${uidB}`).set({
    blockedUid: uidB,
    status: 'active',
    blockedAt: FieldValue.serverTimestamp(),
  });

  await waitFor(async () => {
    const snaps = await Promise.all([
      db.doc(`users/${uidA}/followers/${uidB}`).get(),
      db.doc(`users/${uidB}/following/${uidA}`).get(),
      db.doc(`follow_requests/${uidA}_${uidB}`).get(),
      db.doc(`friend_requests/${friendReqId}`).get(),
      db.doc(`users/${uidA}/directConversations/${dmId}`).get(),
      db.doc(`users/${uidB}/directConversations/${dmId}`).get(),
    ]);
    return snaps.every((snap) => !snap.exists);
  }, 'block trigger cleans follow, friend request, and DM index docs');
});

test('onReportCreatedQueue classifies profile reports as user targets and escalates auto-moderation', async () => {
  const userReportId = `rep_profile_${randomUUID().slice(0, 8)}`;
  const autoReportId = `rep_auto_${randomUUID().slice(0, 8)}`;

  await db.doc(`reports/${userReportId}`).set({
    reporterUid: 'user_reporter_1',
    reportedUid: 'user_target_1',
    reason: 'harassment',
    details: 'Perfil abusivo',
    conversationId: null,
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.doc(`reports/${autoReportId}`).set({
    reporterUid: 'system_moderation',
    reportedUid: 'user_target_2',
    reason: 'other',
    details: 'Auto moderation removed content with blocked terms: te voy a matar',
    conversationId: 'post_auto_1',
    status: 'open',
    source: 'post',
    autoAction: 'removed',
    createdAt: FieldValue.serverTimestamp(),
  });

  await waitFor(async () => {
    const [uSnap, aSnap] = await Promise.all([
      db.doc(`moderation_queue/${userReportId}`).get(),
      db.doc(`moderation_queue/${autoReportId}`).get(),
    ]);
    return uSnap.exists && aSnap.exists;
  }, 'moderation_queue docs created for user and auto reports');

  const userQueue = (await db.doc(`moderation_queue/${userReportId}`).get()).data();
  assert.equal(userQueue?.source, 'user_report');
  assert.equal(userQueue?.targetType, 'user');
  assert.equal(userQueue?.priority, 'high');

  const autoQueue = (await db.doc(`moderation_queue/${autoReportId}`).get()).data();
  assert.equal(autoQueue?.source, 'auto_moderation');
  assert.equal(autoQueue?.targetType, 'post');
  assert.equal(autoQueue?.priority, 'high');
});

test('moderationTakeAction removes reported message with attachment, clears preview, and suspends/restores users', async () => {
  const adminEmail = `mod-admin-${randomUUID().slice(0, 8)}@vinctus.local`;
  const targetEmail = `mod-target-${randomUUID().slice(0, 8)}@vinctus.local`;
  const password = 'password123';

  const adminUser = await adminAuth.createUser({ email: adminEmail, password });
  const targetUser = await adminAuth.createUser({ email: targetEmail, password });
  await db.doc(`app_admins/${adminUser.uid}`).set({ role: 'admin' });

  const convId = `dm_${[adminUser.uid, targetUser.uid].sort().join('_')}`;
  const msgId = `msg_${randomUUID().slice(0, 8)}`;
  const attachmentPath = `conversations/${convId}/attachments/${targetUser.uid}/${msgId}/proof.jpg`;
  const clientCreatedAt = Date.now();

  await bucket.file(attachmentPath).save(Buffer.from('fake-jpeg'), { contentType: 'image/jpeg' });
  await db.doc(`conversations/${convId}`).set({
    type: 'direct',
    memberIds: [adminUser.uid, targetUser.uid].sort(),
    lastMessage: {
      text: 'Archivo adjunto',
      senderId: targetUser.uid,
      clientCreatedAt,
    },
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.doc(`conversations/${convId}/messages/${msgId}`).set({
    senderId: targetUser.uid,
    text: '',
    attachments: [{ path: attachmentPath, contentType: 'image/jpeg' }],
    clientCreatedAt,
    clientId: msgId,
    createdAt: FieldValue.serverTimestamp(),
  });

  const itemId = `mod_item_${randomUUID().slice(0, 8)}`;
  await db.doc(`moderation_queue/${itemId}`).set({
    reportId: itemId,
    reporterUid: adminUser.uid,
    reportedUid: targetUser.uid,
    reason: 'abuse',
    details: 'Adjunto abusivo',
    conversationId: `msg|${convId}|${msgId}`,
    status: 'pending',
    source: 'user_report',
    targetType: 'message',
    priority: 'high',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Non-admin must be rejected.
  await signInWithEmailAndPassword(clientAuth, targetEmail, password);
  const moderationTakeAction = httpsCallable(clientFunctions, 'moderationTakeAction');
  await assert.rejects(
    moderationTakeAction({ itemId, action: 'remove_content' }),
    /Solo administradores|permission-denied/i,
  );

  // Admin removes message: Firestore doc deleted, Storage attachment deleted, lastMessage cleared.
  await signInWithEmailAndPassword(clientAuth, adminEmail, password);
  const removeRes = await moderationTakeAction({
    itemId,
    action: 'remove_content',
    note: 'Contenido verificado',
  });
  assert.equal(removeRes.data.reviewAction, 'message_removed');

  const msgSnap = await db.doc(`conversations/${convId}/messages/${msgId}`).get();
  assert.equal(msgSnap.exists, false);
  const [attachmentExists] = await bucket.file(attachmentPath).exists();
  assert.equal(attachmentExists, false);
  const convSnap = await db.doc(`conversations/${convId}`).get();
  assert.equal(convSnap.data()?.lastMessage?.text, 'Mensaje eliminado');

  // Admin suspends and restores target user.
  const suspendRes = await moderationTakeAction({ itemId, action: 'suspend_user' });
  assert.equal(suspendRes.data.reviewAction, 'user_suspended');
  assert.equal((await adminAuth.getUser(targetUser.uid)).disabled, true);

  const restoreRes = await moderationTakeAction({ itemId, action: 'restore_user' });
  assert.equal(restoreRes.data.reviewAction, 'user_restored');
  assert.equal((await adminAuth.getUser(targetUser.uid)).disabled, false);

  // revokeUserSessions callable succeeds for authenticated caller.
  const revokeUserSessions = httpsCallable(clientFunctions, 'revokeUserSessions');
  const revokeRes = await revokeUserSessions();
  assert.equal(revokeRes.data.ok, true);
});

test('requestAccountDeletion removes owned group memberships, arena refs, group lastMessage, aiImageUsage, and Auth user', async () => {
  const email = `del-sec-${randomUUID().slice(0, 8)}@vinctus.local`;
  const password = 'password123';
  const signup = await createUserWithEmailAndPassword(clientAuth, email, password);
  const uid = signup.user.uid;
  const peerUid = `peer_${randomUUID().slice(0, 8)}`;
  const ownedGroupId = `grp_own_${randomUUID().slice(0, 8)}`;
  const otherGroupId = `grp_other_${randomUUID().slice(0, 8)}`;
  const debateId = `deb_own_${randomUUID().slice(0, 8)}`;
  const dmId = `dm_${[uid, peerUid].sort().join('_')}`;
  const groupMsgId = `gmsg_${randomUUID().slice(0, 8)}`;
  const dayKey = '2026-11-19';

  await Promise.all([
    db.doc(`users/${uid}`).set({ uid, displayName: 'Delete Me', createdAt: FieldValue.serverTimestamp() }),
    db.doc(`users_public/${uid}`).set({ uid, displayName: 'Delete Me', updatedAt: FieldValue.serverTimestamp() }),
    db.doc(`users/${peerUid}`).set({ uid: peerUid, displayName: 'Peer', createdAt: FieldValue.serverTimestamp() }),
    // Owned group with another member + join request
    db.doc(`groups/${ownedGroupId}`).set({
      name: 'Owned Group',
      ownerId: uid,
      visibility: 'private',
      memberCount: 2,
    }),
    db.doc(`groups/${ownedGroupId}/members/${uid}`).set({ uid, groupId: ownedGroupId, role: 'admin' }),
    db.doc(`groups/${ownedGroupId}/members/${peerUid}`).set({ uid: peerUid, groupId: ownedGroupId, role: 'member' }),
    db.doc(`users/${peerUid}/memberships/${ownedGroupId}`).set({ groupId: ownedGroupId }),
    db.doc(`group_requests/req_${ownedGroupId}`).set({
      groupId: ownedGroupId,
      fromUid: 'outsider_1',
      toUid: uid,
      status: 'pending',
    }),
    // Owned arena debate saved & liked by peer
    db.doc(`arenaDebates/${debateId}`).set({
      createdBy: uid,
      topic: 'Debate borrable',
      status: 'done',
      visibility: 'public',
    }),
    db.doc(`users/${peerUid}/savedArenaDebates/${debateId}`).set({ debateId, topic: 'Debate borrable' }),
    db.doc(`users/${peerUid}/likedArenaDebates/${debateId}`).set({ debateId }),
    // Direct conversation + peer inbox index
    db.doc(`conversations/${dmId}`).set({ type: 'direct', memberIds: [uid, peerUid].sort() }),
    db.doc(`users/${peerUid}/directConversations/${dmId}`).set({ conversationId: dmId, otherUid: uid }),
    // Remaining group conversation where deleted user sent lastMessage
    db.doc(`conversations/grp_${otherGroupId}`).set({
      type: 'group',
      groupId: otherGroupId,
      lastMessage: { text: 'Ultimo mensaje del usuario borrado', senderId: uid, clientCreatedAt: 12345 },
    }),
    db.doc(`conversations/grp_${otherGroupId}/messages/${groupMsgId}`).set({
      senderId: uid,
      text: 'Ultimo mensaje del usuario borrado',
      clientCreatedAt: 12345,
      clientId: groupMsgId,
    }),
    // AI image usage doc
    db.doc(`aiImageUsage/${dayKey}/users/${uid}`).set({ count: 2 }),
  ]);

  const requestAccountDeletion = httpsCallable(clientFunctions, 'requestAccountDeletion');
  const getAccountDeletionStatus = httpsCallable(clientFunctions, 'getAccountDeletionStatus');

  const reqResult = await requestAccountDeletion();
  assert.equal(reqResult.data.accepted, true);

  await waitFor(async () => {
    const jobSnap = await db.doc(`deletionJobs/${uid}`).get();
    return jobSnap.data()?.status === 'completed';
  }, 'account deletion job completes');

  const finalJobSnap = await db.doc(`deletionJobs/${uid}`).get();
  assert.equal(finalJobSnap.data()?.status, 'completed');
  assert.equal(finalJobSnap.data()?.lastError ?? null, null);

  try {
    const statusResult = await getAccountDeletionStatus();
    assert.equal(statusResult.data.status, 'completed');
    assert.equal(statusResult.data.lastError, null);
  } catch (err) {
    assert.match(String(err?.code ?? err?.message ?? err), /unauthenticated/i);
  }

  const deletedDocs = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`users_public/${uid}`).get(),
    db.doc(`groups/${ownedGroupId}`).get(),
    db.doc(`users/${peerUid}/memberships/${ownedGroupId}`).get(),
    db.doc(`group_requests/req_${ownedGroupId}`).get(),
    db.doc(`arenaDebates/${debateId}`).get(),
    db.doc(`users/${peerUid}/savedArenaDebates/${debateId}`).get(),
    db.doc(`users/${peerUid}/likedArenaDebates/${debateId}`).get(),
    db.doc(`conversations/${dmId}`).get(),
    db.doc(`users/${peerUid}/directConversations/${dmId}`).get(),
    db.doc(`conversations/grp_${otherGroupId}/messages/${groupMsgId}`).get(),
    db.doc(`aiImageUsage/${dayKey}/users/${uid}`).get(),
  ]);
  for (const snap of deletedDocs) {
    assert.equal(snap.exists, false, `Expected ${snap.ref.path} to be deleted`);
  }

  const remainingGroupConv = await db.doc(`conversations/grp_${otherGroupId}`).get();
  assert.equal(remainingGroupConv.data()?.lastMessage?.text, 'Mensaje eliminado');

  await assert.rejects(
    adminAuth.getUser(uid),
    (err) => err && typeof err === 'object' && err.code === 'auth/user-not-found',
  );
});
