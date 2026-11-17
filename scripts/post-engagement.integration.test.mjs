import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  reconcilePostLikes,
  reconcilePostComments,
} from '../functions/lib/postEngagementCounts.js';
import { auditPostEngagement } from '../functions/lib/postEngagementAudit.js';

assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):8080$/);
assert.equal(process.env.GCLOUD_PROJECT, 'vinctus-dev');
const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
// Use the same SDK instance as the compiled helpers (FieldPath/FieldValue use
// runtime type checks and cannot be mixed between root/functions installations).
const { deleteApp, initializeApp } = requireFunctions('firebase-admin/app');
const { FieldValue, getFirestore } = requireFunctions('firebase-admin/firestore');
const app = initializeApp({ projectId: 'vinctus-dev' }, 'post-engagement-tests');
const db = getFirestore(app);
// Invoke the same exported handlers with deliberately reordered/duplicate events.
const handlers = requireFunctions('./lib/index.js');
after(async () => {
  await deleteApp(app);
  await requireFunctions('firebase-admin').app().delete();
});

async function profile(fields = {}) {
  const uid = randomUUID();
  const data = {
    displayName: 'Prueba de reacciones',
    postsCount: 0,
    karmaGlobal: 0,
    reputation: 0,
    karmaByInterest: {},
    ...fields,
  };
  await db.doc(`users/${uid}`).set(data);
  await db.doc(`users_public/${uid}`).set(data);
  return uid;
}

async function post(uid, categoryId = 'science', fields = {}) {
  const ref = db.collection('posts').doc();
  await ref.set({
    authorId: uid,
    authorSnapshot: { displayName: 'Prueba', photoURL: null },
    text: 'Publicación de prueba',
    content: 'Publicación de prueba',
    media: [],
    status: 'ready',
    categoryId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: null,
    likeCount: 0,
    likesCount: 0,
    commentCount: 0,
    commentsCount: 0,
    ...fields,
  });
  return ref;
}

async function waitFor(read, check) {
  let value;
  for (let attempt = 0; attempt < 150; attempt++) {
    value = await read();
    try {
      check(value);
      return value;
    } catch {
      await delay(200);
    }
  }
  check(value);
}

async function expectStats(ref, uid, likes, karma, buckets) {
  return waitFor(
    async () => {
      const [p, u, pub] = await db.getAll(
        ref,
        db.doc(`users/${uid}`),
        db.doc(`users_public/${uid}`),
      );
      return [p.data(), u.data(), pub.data()];
    },
    ([p, u, pub]) => {
      assert.equal(p.likeCount, likes);
      assert.equal(p.likesCount, likes);
      for (const data of [u, pub]) {
        assert.equal(data.karmaGlobal, karma);
        assert.equal(data.reputation, Math.min(100, karma));
        assert.deepEqual(data.karmaByInterest, buckets);
        assert.ok(!Object.keys(data).some((key) => key.startsWith('karmaByInterest.')));
      }
    },
  );
}

const likeData = (postId, uid) => ({ postId, uid, createdAt: FieldValue.serverTimestamp() });
const context = (postId, extra, eventId = randomUUID()) => ({
  params: { postId, ...extra },
  eventId,
});

test('real triggers reconcile two likes, both aliases, public/private karma and unlike', async () => {
  const uid = await profile();
  const ref = await post(uid);
  const a = ref.collection('likes').doc('web-reader');
  const b = ref.collection('likes').doc('native-reader');
  const batch = db.batch();
  batch.set(a, likeData(ref.id, a.id));
  batch.set(b, likeData(ref.id, b.id));
  await batch.commit();
  await expectStats(ref, uid, 2, 4, { science: 4 });
  const before = await db.getAll(ref, db.doc(`users/${uid}`), db.doc(`users_public/${uid}`));
  await reconcilePostLikes(db, ref.id);
  await reconcilePostLikes(db, ref.id);
  const after = await db.getAll(ref, db.doc(`users/${uid}`), db.doc(`users_public/${uid}`));
  assert.ok(
    before.every((snapshot, i) => snapshot.updateTime.isEqual(after[i].updateTime)),
    'unchanged state must not be rewritten',
  );
  await a.delete();
  await expectStats(ref, uid, 1, 2, { science: 2 });
  await b.delete();
  await expectStats(ref, uid, 0, 0, { science: 0 });
});

test('reversed and repeated handlers use current membership rather than event order', async () => {
  const uid = await profile();
  const ref = await post(uid);
  const event = context(ref.id, { userId: 'reader' }, 'repeated-event');
  // The like no longer exists; the delete can be delivered before the create.
  await handlers.onPostLikeDeleted.run({}, event);
  await handlers.onPostLikeCreated.run({}, event);
  await handlers.onPostLikeCreated.run({}, event);
  await expectStats(ref, uid, 0, 0, { science: 0 });
  const like = ref.collection('likes').doc('reader');
  await like.set(likeData(ref.id, like.id));
  await handlers.onPostLikeDeleted.run({}, context(ref.id, { userId: like.id }));
  await handlers.onPostLikeCreated.run({}, event);
  await expectStats(ref, uid, 1, 2, { science: 2 });
  await like.delete();
  await handlers.onPostLikeCreated.run({}, event);
  await expectStats(ref, uid, 0, 0, { science: 0 });
});

test('migrates dotted legacy fields literally, preserves unrelated points and category keys', async () => {
  const uid = await profile({
    karmaGlobal: 17,
    reputation: 17,
    karmaByInterest: { music: 7 },
    'karmaByInterest.science': 4,
    'karmaByInterest.history.modern': 6,
  });
  const ref = await post(uid, 'science', { likeCount: 2, likesCount: 2 });
  const a = ref.collection('likes').doc('reader-a');
  const b = ref.collection('likes').doc('reader-b');
  const batch = db.batch();
  batch.set(a, likeData(ref.id, a.id));
  batch.set(b, likeData(ref.id, b.id));
  await batch.commit();
  await expectStats(ref, uid, 2, 17, { science: 4, 'history.modern': 6, music: 7 });
  const c = ref.collection('likes').doc('reader-c');
  await c.set(likeData(ref.id, c.id));
  await expectStats(ref, uid, 3, 19, { science: 6, 'history.modern': 6, music: 7 });
});

test('late events never recreate deleted profiles or posts', async () => {
  const uid = await profile();
  const ref = await post(uid);
  await ref.collection('likes').doc('a').set(likeData(ref.id, 'a'));
  await expectStats(ref, uid, 1, 2, { science: 2 });
  await db.doc(`users_public/${uid}`).delete();
  await ref.collection('likes').doc('b').set(likeData(ref.id, 'b'));
  await waitFor(
    async () => (await db.doc(`users/${uid}`).get()).data(),
    (data) => assert.equal(data.karmaGlobal, 4),
  );
  assert.equal((await db.doc(`users_public/${uid}`).get()).exists, false);
  await db.doc(`users/${uid}`).delete();
  await ref.collection('likes').doc('c').set(likeData(ref.id, 'c'));
  await waitFor(
    async () => (await ref.get()).data(),
    (data) => assert.equal(data.likeCount, 3),
  );
  await handlers.onPostLikeCreated.run({}, context(ref.id, { userId: 'a' }));
  assert.equal((await db.doc(`users/${uid}`).get()).exists, false);
  assert.equal((await db.doc(`users_public/${uid}`).get()).exists, false);
  await ref.delete();
  await handlers.onPostLikeCreated.run({}, context(ref.id, { userId: 'a' }));
  await reconcilePostComments(db, ref.id);
  assert.equal((await ref.get()).exists, false);
});

test('comments reconcile out-of-order deletion, duplicates and moderation removal', async () => {
  const uid = await profile();
  const ref = await post(uid, null, { commentCount: 99, commentsCount: 99 });
  const event = context(ref.id, { commentId: 'c1' }, 'repeated-comment');
  await handlers.onPostCommentDeleted.run({}, event);
  await handlers.onPostCommentCreated.run({}, event);
  await handlers.onPostCommentCreated.run({}, event);
  const count = (n) => async () =>
    waitFor(
      async () => (await ref.get()).data(),
      (data) => {
        assert.equal(data.commentCount, n);
        assert.equal(data.commentsCount, n);
      },
    );
  await count(0)();
  const comment = ref.collection('comments').doc('c1');
  await comment.set({
    postId: ref.id,
    authorId: uid,
    text: 'Comentario de prueba',
    createdAt: FieldValue.serverTimestamp(),
  });
  await count(1)();
  await comment.delete();
  await handlers.onPostCommentCreated.run({}, event);
  await count(0)();
  await comment.set({
    postId: ref.id,
    authorId: uid,
    text: 'te voy a matar',
    createdAt: FieldValue.serverTimestamp(),
  });
  await waitFor(
    async () => (await comment.get()).exists,
    (exists) => assert.equal(exists, false),
  );
  await count(0)();
});

test('post deletion preserves historical karma and cascade events do not resurrect the post', async () => {
  const uid = await profile();
  const ref = await post(uid);
  await ref.collection('likes').doc('reader').set(likeData(ref.id, 'reader'));
  await expectStats(ref, uid, 1, 2, { science: 2 });
  await ref.delete();
  await waitFor(
    async () => (await ref.collection('likes').get()).empty,
    (empty) => assert.equal(empty, true),
  );
  await handlers.onPostLikeDeleted.run({}, context(ref.id, { userId: 'reader' }));
  const user = (await db.doc(`users/${uid}`).get()).data();
  const pub = (await db.doc(`users_public/${uid}`).get()).data();
  assert.equal(user.karmaGlobal, 2);
  assert.equal(pub.karmaGlobal, 2);
  assert.equal(user.karmaByInterest.science, 2);
  assert.equal((await ref.get()).exists, false);
});

test('bounded audits detect historical discrepancies without changing any document', async () => {
  const uid = await profile({ karmaGlobal: 30, reputation: 30, karmaByInterest: { music: 30 } });
  const science = await post(uid, 'science');
  const other = await post(uid, 'music');
  await science.collection('likes').doc('reader').set(likeData(science.id, 'reader'));
  await expectStats(science, uid, 1, 32, { music: 30, science: 2 });
  const user = db.doc(`users/${uid}`);
  await waitFor(
    async () => (await user.get()).data(),
    (data) => assert.equal(data.postsCount, 2),
  );
  await science.update({ likeCount: 99, likesCount: 99 });
  await user.set(
    { karmaByInterest: { music: 30, science: 0 }, 'karmaByInterest.science': 1 },
    { merge: true },
  );
  const refs = [user, db.doc(`users_public/${uid}`), science, other];
  const before = await db.getAll(...refs);
  const partial = await auditPostEngagement(db, uid, 1);
  assert.equal(partial.complete, false);
  assert.equal(partial.inspectedPosts, 1);
  const full = await auditPostEngagement(db, uid);
  assert.equal(full.complete, true);
  assert.equal(full.knownCurrentPostKarma, 2);
  assert.equal(full.storedKarmaGlobal, 32);
  assert.equal(full.differenceFromKnownCurrentPosts, 30);
  assert.equal(full.knownKarmaByCategory.science, 2);
  assert.deepEqual(full.categoriesBelowKnownCurrentPosts, ['science']);
  assert.deepEqual(full.legacyPrivateFields, ['karmaByInterest.science']);
  assert.equal(full.posts.find((p) => p.postId === science.id).aliasesMatch, false);
  const after = await db.getAll(...refs);
  assert.ok(
    before.every((snapshot, i) => snapshot.updateTime.isEqual(after[i].updateTime)),
    'audit must not write profile/post documents',
  );
});

test('concurrent posts and publication counters keep authors and categories separate', async () => {
  const a = await profile();
  const b = await profile();
  const science = await post(a, 'science');
  const music = await post(a, 'music');
  const history = await post(b, 'history');
  await Promise.all(
    [science, music, history].flatMap((ref) =>
      ['web', 'native'].map((id) => ref.collection('likes').doc(id).set(likeData(ref.id, id))),
    ),
  );
  await expectStats(science, a, 2, 8, { science: 4, music: 4 });
  await expectStats(music, a, 2, 8, { science: 4, music: 4 });
  await expectStats(history, b, 2, 4, { history: 4 });
  await Promise.all(
    [science, music].flatMap((ref) =>
      ['web', 'native'].map((id) => ref.collection('likes').doc(id).delete()),
    ),
  );
  await expectStats(science, a, 0, 0, { science: 0, music: 0 });
  await expectStats(history, b, 2, 4, { history: 4 });
});
