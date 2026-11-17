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
const { getAuth } = requireFunctions('firebase-admin/auth');
const app = initializeApp(
  { projectId: 'vinctus-dev', storageBucket: 'vinctus-dev.appspot.com' },
  'post-read-tests',
);
const db = getFirestore(app);
const bucket = getStorage(app).bucket();
const base = 'http://127.0.0.1:5001/vinctus-dev/us-central1';
const id = () => randomUUID();
after(() => deleteApp(app));

async function actor(visibility = 'public') {
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `${id()}@example.test`,
        password: 'test123456',
        returnSecureToken: true,
      }),
    },
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  const user = { uid: data.localId, token: data.idToken };
  await db
    .doc(`users_public/${user.uid}`)
    .set({ displayName: 'Reader', accountVisibility: visibility });
  return user;
}
async function post(author, fields = {}) {
  const ref = db.collection('posts').doc();
  await ref.set({
    authorId: author.uid,
    authorSnapshot: { displayName: 'Author', photoURL: null },
    text: 'Private text',
    media: [],
    status: 'ready',
    createdAt: Timestamp.now(),
    ...fields,
  });
  return ref;
}
const headers = (user) => (user ? { Authorization: `Bearer ${user.token}` } : {});
async function call(user, data, expected = 200) {
  const response = await fetch(`${base}/readPosts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers(user) },
    body: JSON.stringify({ data }),
  });
  const body = await response.json();
  assert.equal(response.status, expected, JSON.stringify(body));
  return expected === 200 ? body.result : body;
}
const rows = async (user, ref) => (await call(user, { view: 'ids', ids: [ref.id] })).items;
async function group(visibility = 'private') {
  const ref = db.collection('groups').doc();
  await ref.set({ visibility, ownerId: id() });
  return ref;
}
const mediaURL = (ref, path) =>
  `${base}/readPostMedia?${new URLSearchParams({ postId: ref.id, path })}`;

test('all post views and media require a non-guest login, including public content', async () => {
  const author = await actor();
  const ref = await post(author);
  for (const view of [
    'feed',
    'author',
    'group',
    'category',
    'comments',
    'ids',
    'saved',
    'groupSummary',
  ]) {
    await call(null, { view, id: ref.id }, 401);
  }
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    },
  );
  assert.equal(response.status, 200);
  const guest = await response.json();
  const user = { uid: guest.localId, token: guest.idToken };
  await call(user, { view: 'ids', ids: [ref.id] }, 401);
  const url = mediaURL(ref, `posts/${author.uid}/${ref.id}/files/public.pdf`);
  assert.equal((await fetch(url, { method: 'HEAD' })).status, 401);
  assert.equal((await fetch(url, { method: 'HEAD', headers: headers(user) })).status, 401);
});

test('public, private accounts, reciprocal blocks, draft and deleted profiles use current authorization', async () => {
  const author = await actor();
  const viewer = await actor();
  const ref = await post(author);
  await call(null, { view: 'ids', ids: [ref.id] }, 401);
  assert.equal((await rows(viewer, ref)).length, 1);
  await db.doc(`users_public/${author.uid}`).update({ accountVisibility: 'private' });
  await call(null, { view: 'ids', ids: [ref.id] }, 401);
  assert.equal((await rows(viewer, ref)).length, 0);
  assert.equal((await rows(author, ref)).length, 1);
  const follow = db.doc(`users/${author.uid}/followers/${viewer.uid}`);
  await follow.set({ uid: viewer.uid });
  assert.equal((await rows(viewer, ref)).length, 1);
  for (const [from, to] of [
    [author, viewer],
    [viewer, author],
  ]) {
    const block = db.doc(`users/${from.uid}/blockedUsers/${to.uid}`);
    await block.set({ uid: to.uid });
    assert.equal((await rows(viewer, ref)).length, 0);
    await block.delete();
  }
  await db.doc(`users_public/${viewer.uid}`).delete();
  assert.equal((await rows(viewer, ref)).length, 0);
  await db.doc(`users_public/${viewer.uid}`).set({ displayName: 'Viewer' });
  await follow.delete();
  assert.equal((await rows(viewer, ref)).length, 0);
  await ref.update({ status: 'uploading' });
  assert.equal((await rows(author, ref)).length, 0);
  await ref.update({ status: null });
  assert.equal((await rows(author, ref)).length, 1);
  await db.doc(`users_public/${author.uid}`).delete();
  assert.equal((await rows(author, ref)).length, 0);
});

test('private groups require actual membership AND private-account permission; revocation hides posts and comments', async () => {
  const author = await actor('private');
  const viewer = await actor();
  const g = await group();
  const ref = await post(author, { groupId: g.id });
  await ref
    .collection('comments')
    .doc('comment')
    .set({ authorId: author.uid, text: 'Hidden comment', createdAt: Timestamp.now() });
  await db.doc(`users/${viewer.uid}/memberships/${g.id}`).set({ groupId: g.id });
  assert.equal((await rows(viewer, ref)).length, 0);
  const member = g.collection('members').doc(viewer.uid);
  await member.set({ uid: viewer.uid });
  assert.equal((await rows(viewer, ref)).length, 0);
  await db.doc(`users/${author.uid}/followers/${viewer.uid}`).set({ uid: viewer.uid });
  assert.equal((await rows(viewer, ref)).length, 1);
  assert.equal((await call(viewer, { view: 'comments', id: ref.id })).items.length, 1);
  await member.delete();
  assert.equal((await rows(viewer, ref)).length, 0);
  assert.equal((await call(viewer, { view: 'comments', id: ref.id })).items.length, 0);
  assert.equal((await call(viewer, { view: 'groupSummary', id: g.id })).weeklyPosts, 0);
  await g.update({ ownerId: viewer.uid });
  assert.equal((await rows(viewer, ref)).length, 1);
});

test('opaque cursors can advance across an empty hidden page and are bound to reader, view, limit and expiration', async () => {
  const author = await actor('private');
  const publicAuthor = await actor();
  const viewer = await actor();
  const category = id();
  const old = await post(publicAuthor, {
    categoryId: category,
    createdAt: Timestamp.fromMillis(1),
  });
  const batch = db.batch();
  for (let i = 0; i < 30; i++)
    batch.set(db.collection('posts').doc(), {
      authorId: author.uid,
      categoryId: category,
      text: 'Secret',
      createdAt: Timestamp.fromMillis(100 + i),
    });
  await batch.commit();
  const request = { view: 'category', id: category, limit: 1 };
  const first = await call(viewer, request);
  assert.deepEqual(first.items, []);
  assert.match(first.cursor, /^[a-f0-9]{32}$/);
  assert.deepEqual(Object.keys(first).sort(), ['cursor', 'hasMore', 'items']);
  const second = await call(viewer, { ...request, cursor: first.cursor });
  assert.equal(second.items[0].id, old.id);
  await call(null, { ...request, cursor: first.cursor }, 401);
  await call(viewer, { ...request, limit: 2, cursor: first.cursor }, 400);
  await call(viewer, { view: 'author', id: category, limit: 1, cursor: first.cursor }, 400);
  await db.doc(`_post_read_cursors/${first.cursor}`).update({ expiresAt: Timestamp.fromMillis(1) });
  await call(viewer, { ...request, cursor: first.cursor }, 400);
});

test('105 timestamp-tied comments page without duplicates after cursor deletion; blocked commenters disappear', async () => {
  const author = await actor();
  const viewer = await actor();
  const blocked = await actor();
  const ref = await post(author);
  const batch = db.batch();
  const expected = [];
  for (let i = 0; i < 105; i++) {
    const commentId = `c${String(i).padStart(3, '0')}`;
    expected.push(commentId);
    batch.set(ref.collection('comments').doc(commentId), {
      authorId: author.uid,
      text: 'Comment',
      createdAt: Timestamp.fromMillis(100),
    });
  }
  batch.set(ref.collection('comments').doc('z-blocked'), {
    authorId: blocked.uid,
    text: 'Blocked',
    createdAt: Timestamp.fromMillis(100),
  });
  await batch.commit();
  await db.doc(`users/${viewer.uid}/blockedUsers/${blocked.uid}`).set({ uid: blocked.uid });
  const query = { view: 'comments', id: ref.id, limit: 50 };
  const first = await call(viewer, query);
  assert.equal(first.items.length, 50);
  const cursorId = first.items.at(-1).id;
  await ref.collection('comments').doc(cursorId).delete();
  await ref
    .collection('comments')
    .doc('newer')
    .set({ authorId: author.uid, text: 'New', createdAt: Timestamp.fromMillis(200) });
  const second = await call(viewer, { ...query, cursor: first.cursor });
  const third = await call(viewer, { ...query, cursor: second.cursor });
  assert.deepEqual(
    [...first.items, ...second.items, ...third.items].map((row) => row.id),
    expected.reverse(),
  );
  assert.equal(third.hasMore, false);
});

test('saved cursors advance over deleted parents and cannot query another user index', async () => {
  const author = await actor();
  const viewer = await actor();
  const ref = await post(author);
  const saved = db.collection(`users/${viewer.uid}/savedPosts`);
  for (const [key, time] of [
    [id(), 4],
    [id(), 3],
    [id(), 2],
    [ref.id, 1],
  ])
    await saved.doc(key).set({ createdAt: Timestamp.fromMillis(time) });
  let cursor;
  const found = [];
  for (let i = 0; i < 4; i++) {
    const page = await call(viewer, { view: 'saved', limit: 1, ...(cursor ? { cursor } : {}) });
    found.push(...page.items.map((row) => row.id));
    cursor = page.cursor;
    assert.equal(page.hasMore, i < 3);
  }
  assert.deepEqual(found, [ref.id]);
  await call(null, { view: 'saved' }, 401);
  await call(viewer, { view: 'saved', id: author.uid }, 400);
});

test('raw list reads and private point reads are denied; direct Storage reads cannot bypass post authorization', async () => {
  const author = await actor();
  const viewer = await actor();
  const g = await group();
  const ref = await post(author, { groupId: g.id });
  const root = 'http://127.0.0.1:8080/v1/projects/vinctus-dev/databases/(default)/documents';
  const read = (path) => fetch(`${root}/${path}`, { headers: headers(viewer) });
  assert.equal((await read('posts')).status, 403);
  assert.equal((await read(`posts/${ref.id}`)).status, 403);
  assert.equal((await read(`posts/${ref.id}/comments`)).status, 403);
  const path = `posts/${author.uid}/${ref.id}/files/test.pdf`;
  await bucket.file(path).save(Buffer.from('%PDF'), {
    metadata: { contentType: 'application/pdf', cacheControl: 'private,no-store,max-age=0' },
  });
  const storage = `http://127.0.0.1:9199/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media`;
  assert.equal((await fetch(storage, { headers: headers(viewer) })).status, 403);
  assert.equal((await fetch(storage)).status, 403);
});

test('media reauthorizes each 8MiB chunk, validates ETag/path/range and never returns a download token', async () => {
  const author = await actor();
  const viewer = await actor();
  const g = await group();
  const member = g.collection('members').doc(viewer.uid);
  await member.set({ uid: viewer.uid });
  const ref = await post(author, { groupId: g.id });
  const path = `posts/${author.uid}/${ref.id}/files/large.pdf`;
  const content = Buffer.alloc(9 * 1024 * 1024, 37);
  await bucket.file(path).save(content, {
    metadata: {
      contentType: 'application/pdf',
      metadata: { firebaseStorageDownloadTokens: 'old-token' },
    },
  });
  await ref.update({
    media: [{ type: 'file', path, url: 'https://example.test/legacy?token=secret' }],
  });
  const serialized = (await rows(viewer, ref))[0];
  assert.equal(serialized.media[0].url, `post-media:${path}`);
  assert.ok(!JSON.stringify(serialized).includes('secret'));
  const endpoint = mediaURL(ref, path);
  assert.equal((await fetch(endpoint, { method: 'HEAD' })).status, 401);
  const head = await fetch(endpoint, { method: 'HEAD', headers: headers(viewer) });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('Content-Length'), String(content.length));
  assert.match(head.headers.get('Cache-Control'), /no-store/);
  const etag = head.headers.get('ETag');
  const chunk = await fetch(endpoint, {
    headers: { ...headers(viewer), Range: 'bytes=0-8388607', 'If-Match': etag },
  });
  assert.equal(chunk.status, 206);
  assert.deepEqual(Buffer.from(await chunk.arrayBuffer()), content.subarray(0, 8388608));
  assert.equal((await fetch(endpoint, { headers: headers(viewer) })).status, 416);
  assert.equal(
    (
      await fetch(endpoint, {
        headers: { ...headers(viewer), Range: 'bytes=0-0', 'If-Match': 'changed' },
      })
    ).status,
    412,
  );
  assert.equal(
    (
      await fetch(mediaURL(ref, path.replace('large.pdf', 'unlisted.pdf')), {
        method: 'HEAD',
        headers: headers(viewer),
      })
    ).status,
    404,
  );
  await member.delete();
  assert.equal(
    (
      await fetch(endpoint, {
        headers: { ...headers(viewer), Range: 'bytes=8388608-9437183', 'If-Match': etag },
      })
    ).status,
    404,
  );
  await g.update({ visibility: 'public' });
  assert.equal((await fetch(endpoint, { method: 'HEAD' })).status, 401);
  assert.equal((await fetch(endpoint, { method: 'HEAD', headers: headers(viewer) })).status, 200);
  let clean = false;
  for (let i = 0; i < 50; i++) {
    const [metadata] = await bucket.file(path).getMetadata();
    // firebase-tools cannot remove the final token: its delete API replaces it.
    // Verify the old token is revoked and the trigger settles without recursion.
    if (
      !String(metadata.metadata?.firebaseStorageDownloadTokens).includes('old-token') &&
      metadata.metadata?.postMediaTokenRotated === 'true' &&
      metadata.cacheControl === 'private,no-store,max-age=0'
    ) {
      clean = true;
      break;
    }
    await delay(200);
  }
  assert.equal(clean, true, 'real Storage trigger must revoke the prior bearer URL');
  const tokenURL = `http://127.0.0.1:9199/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=old-token`;
  assert.equal((await fetch(tokenURL)).status, 403);
});

test('disabled accounts cannot use a previously issued token against callable or media', async () => {
  const author = await actor();
  const viewer = await actor();
  const ref = await post(author);
  await getAuth(app).updateUser(viewer.uid, { disabled: true });
  await call(viewer, { view: 'ids', ids: [ref.id] }, 401);
  const response = await fetch(mediaURL(ref, `posts/${author.uid}/${ref.id}/files/a.pdf`), {
    method: 'HEAD',
    headers: headers(viewer),
  });
  assert.equal(response.status, 401);
});
