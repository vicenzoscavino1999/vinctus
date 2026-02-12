import assert from 'node:assert/strict';
import process from 'node:process';
import { config as loadEnv } from 'dotenv';
import admin from 'firebase-admin';
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const projectId =
  process.env.SEED_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  process.env.PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  'vinctus-dev';

const emulatorHost = process.env.FIREBASE_EMULATOR_HOST || '127.0.0.1';
process.env.FIRESTORE_EMULATOR_HOST ||= `${emulatorHost}:8080`;
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= `${emulatorHost}:9099`;
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= `${emulatorHost}:9199`;
process.env.GCLOUD_PROJECT = projectId;
process.env.FIREBASE_PROJECT_ID = projectId;

if (!admin.apps.length) {
  admin.initializeApp({
    projectId,
    storageBucket: `${projectId}.appspot.com`,
  });
}

const db = admin.firestore();
const authAdmin = admin.auth();
const bucket = admin.storage().bucket();

const webApp = initializeApp({
  apiKey: 'demo-api-key',
  authDomain: `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: `${projectId}.appspot.com`,
  appId: '1:1234567890:web:deleteaccountharness',
});

const authClient = getAuth(webApp);
const firestoreClient = getFirestore(webApp);
const functionsClient = getFunctions(webApp, 'us-central1');
const storageClient = getStorage(webApp);

connectAuthEmulator(authClient, `http://${emulatorHost}:9099`, { disableWarnings: true });
connectFirestoreEmulator(firestoreClient, emulatorHost, 8080);
connectFunctionsEmulator(functionsClient, emulatorHost, 5001);
connectStorageEmulator(storageClient, emulatorHost, 9199);

const requestAccountDeletion = httpsCallable(functionsClient, 'requestAccountDeletion');
const getAccountDeletionStatus = httpsCallable(functionsClient, 'getAccountDeletionStatus');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDeletionCompletion({ timeoutMs = 90000, intervalMs = 1200 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await getAccountDeletionStatus();
    const data = result.data;
    if (data.status === 'completed') {
      return data;
    }
    if (data.status === 'failed') {
      throw new Error(`Deletion job failed: ${data.lastError || 'unknown error'}`);
    }
    await sleep(intervalMs);
  }
  throw new Error('Timed out waiting for account deletion completion');
}

async function seedUserGraph(uid) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const postId = `post_delete_${uid}`;
  const storyId = `story_delete_${uid}`;
  const contributionId = `contribution_delete_${uid}`;
  const supportTicketId = `support_ticket_delete_${uid}`;
  const dmOtherUid = 'delete_harness_peer';
  const conversationId = `dm_${[uid, dmOtherUid].sort().join('_')}`;
  const messageId = `msg_delete_${uid}`;
  const peerMessageId = `msg_delete_peer_${uid}`;
  const commentId = `comment_delete_${uid}`;
  const peerCommentId = `comment_delete_peer_${uid}`;
  const eventId = `event_delete_${uid}`;

  await db.doc(`users/${dmOtherUid}`).set(
    {
      uid: dmOtherUid,
      displayName: 'Peer',
      email: 'peer@vinctus.local',
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  await db.doc(`users_public/${dmOtherUid}`).set(
    {
      uid: dmOtherUid,
      displayName: 'Peer',
      username: 'peer',
      updatedAt: now,
    },
    { merge: true },
  );

  await db.doc(`users/${uid}`).set(
    {
      uid,
      displayName: 'Delete Harness User',
      email: `delete+harness+${uid}@vinctus.local`,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  await db.doc(`users_public/${uid}`).set(
    {
      uid,
      displayName: 'Delete Harness User',
      username: `deleteharness_${uid.slice(-6)}`,
      updatedAt: now,
    },
    { merge: true },
  );

  await db.doc(`posts/${postId}`).set({
    authorId: uid,
    authorName: 'Delete Harness User',
    authorUsername: `deleteharness_${uid.slice(-6)}`,
    title: 'Delete account harness post',
    content: 'This post should be removed by deletion flow.',
    media: [],
    likeCount: 0,
    commentCount: 2,
    commentsCount: 2,
    createdAt: now,
    updatedAt: now,
  });

  await db.doc(`posts/${postId}/comments/${commentId}`).set({
    postId,
    authorId: uid,
    text: 'This comment should be removed by deletion flow.',
    createdAt: now,
  });

  await db.doc(`posts/${postId}/comments/${peerCommentId}`).set({
    postId,
    authorId: dmOtherUid,
    text: 'Peer comment on user post, should be removed with post recursive delete.',
    createdAt: now,
  });

  await db.doc(`posts/${postId}/likes/${dmOtherUid}`).set({
    uid: dmOtherUid,
    postId,
    createdAt: now,
  });

  await db.doc(`users/${dmOtherUid}/likes/${postId}`).set({
    postId,
    createdAt: now,
  });

  await db.doc(`users/${dmOtherUid}/savedPosts/${postId}`).set({
    postId,
    createdAt: now,
  });

  await db.doc(`stories/${storyId}`).set({
    ownerId: uid,
    ownerSnapshot: { displayName: 'Delete Harness User', photoURL: null },
    mediaType: 'image',
    mediaUrl: 'https://example.com/story.jpg',
    mediaPath: `stories/${uid}/${storyId}/original/story.jpg`,
    createdAt: now,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  await db.doc(`support_tickets/${supportTicketId}`).set({
    uid,
    email: `delete+harness+${uid}@vinctus.local`,
    title: 'Delete harness support ticket',
    message: 'Should be deleted by account deletion flow',
    createdAt: now,
  });

  await db.doc(`contributions/${contributionId}`).set({
    userId: uid,
    title: 'Delete harness contribution',
    filePath: `contributions/${uid}/delete-harness-file.txt`,
    createdAt: now,
    updatedAt: now,
  });

  await db.doc(`conversations/${conversationId}`).set({
    type: 'direct',
    memberIds: [uid, dmOtherUid].sort(),
    createdAt: now,
    updatedAt: now,
  });

  await db.doc(`conversations/${conversationId}/messages/${messageId}`).set({
    senderId: uid,
    senderName: 'Delete Harness User',
    senderPhotoURL: null,
    text: 'Delete harness message',
    attachments: [
      {
        path: `conversations/${conversationId}/attachments/${uid}/${messageId}/sample.txt`,
        contentType: 'text/plain',
        size: 24,
      },
    ],
    createdAt: now,
    clientCreatedAt: Date.now(),
    clientId: messageId,
  });

  await db.doc(`conversations/${conversationId}/messages/${peerMessageId}`).set({
    senderId: dmOtherUid,
    senderName: 'Peer',
    senderPhotoURL: null,
    text: 'Peer message in direct conversation, should be removed with conversation.',
    attachments: [],
    createdAt: now,
    clientCreatedAt: Date.now(),
    clientId: peerMessageId,
  });

  await db.doc(`events/${eventId}`).set({
    title: 'Delete harness event',
    description: 'Owned event for delete-account coverage.',
    createdBy: uid,
    visibility: 'public',
    attendeesCount: 2,
    createdAt: now,
    updatedAt: now,
  });

  await db.doc(`events/${eventId}/attendees/${uid}`).set({
    uid,
    joinedAt: now,
  });

  await db.doc(`events/${eventId}/attendees/${dmOtherUid}`).set({
    uid: dmOtherUid,
    joinedAt: now,
  });

  await db.doc(`users/${uid}/directConversations/${conversationId}`).set({
    conversationId,
    otherUid: dmOtherUid,
    type: 'direct',
    updatedAt: now,
  });

  await bucket.file(`contributions/${uid}/delete-harness-file.txt`).save(
    Buffer.from('delete-harness-contribution-file'),
    { contentType: 'text/plain' },
  );
  await bucket.file(`stories/${uid}/${storyId}/original/story.jpg`).save(
    Buffer.from('delete-harness-story-file'),
    { contentType: 'image/jpeg' },
  );
  await bucket
    .file(`conversations/${conversationId}/attachments/${uid}/${messageId}/sample.txt`)
    .save(Buffer.from('delete-harness-attachment-file'), { contentType: 'text/plain' });

  return {
    postId,
    storyId,
    contributionId,
    supportTicketId,
    conversationId,
    commentId,
    peerCommentId,
    messageId,
    peerMessageId,
    eventId,
    dmOtherUid,
  };
}

async function assertDeleted(uid, ids) {
  const checks = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`users_public/${uid}`).get(),
    db.doc(`posts/${ids.postId}`).get(),
    db.doc(`posts/${ids.postId}/comments/${ids.commentId}`).get(),
    db.doc(`posts/${ids.postId}/comments/${ids.peerCommentId}`).get(),
    db.doc(`posts/${ids.postId}/likes/${ids.dmOtherUid}`).get(),
    db.doc(`stories/${ids.storyId}`).get(),
    db.doc(`support_tickets/${ids.supportTicketId}`).get(),
    db.doc(`contributions/${ids.contributionId}`).get(),
    db.doc(`conversations/${ids.conversationId}`).get(),
    db.doc(`conversations/${ids.conversationId}/messages/${ids.messageId}`).get(),
    db.doc(`conversations/${ids.conversationId}/messages/${ids.peerMessageId}`).get(),
    db.doc(`events/${ids.eventId}`).get(),
    db.doc(`events/${ids.eventId}/attendees/${ids.dmOtherUid}`).get(),
    db.doc(`users/${ids.dmOtherUid}/savedPosts/${ids.postId}`).get(),
    db.doc(`users/${ids.dmOtherUid}/likes/${ids.postId}`).get(),
  ]);

  checks.forEach((snap, index) => {
    assert.equal(
      snap.exists,
      false,
      `Expected snapshot[${index}] to be deleted but document still exists: ${snap.ref.path}`,
    );
  });

  await assert.rejects(
    authAdmin.getUser(uid),
    (error) => (error && typeof error === 'object' && error.code === 'auth/user-not-found'),
    'Expected Auth user to be deleted',
  );
}

async function main() {
  console.log(`[delete-account-harness] Using project: ${projectId}`);

  const email = `delete-harness-${Date.now()}@vinctus.local`;
  const password = 'password123';
  const signup = await createUserWithEmailAndPassword(authClient, email, password);
  const uid = signup.user.uid;

  console.log(`[delete-account-harness] Created auth user: ${uid}`);
  const ids = await seedUserGraph(uid);
  console.log('[delete-account-harness] Seeded user graph');

  const enqueueResult = await requestAccountDeletion();
  assert.equal(enqueueResult.data.accepted, true, 'Deletion request should be accepted');
  assert.ok(
    ['queued', 'processing', 'completed'].includes(enqueueResult.data.status),
    `Unexpected initial status: ${enqueueResult.data.status}`,
  );

  const completedStatus = await waitForDeletionCompletion();
  assert.equal(completedStatus.status, 'completed', 'Deletion status should end as completed');

  await assertDeleted(uid, ids);
  console.log('[delete-account-harness] Verified account and related data were deleted');

  const idempotentRequest = await requestAccountDeletion();
  assert.equal(idempotentRequest.data.accepted, true, 'Second deletion request should be accepted');
  const finalStatus = await getAccountDeletionStatus();
  assert.equal(finalStatus.data.status, 'completed', 'Status should remain completed after retry');

  console.log('[delete-account-harness] Idempotency check passed');
  console.log('[delete-account-harness] OK');
}

main().catch((error) => {
  console.error('[delete-account-harness] FAILED', error);
  process.exit(1);
});
