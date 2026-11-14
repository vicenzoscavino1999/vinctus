import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { cleanupRulesTestEnv, clearRulesTestData, getRulesTestEnv } from '@/tests/rules/testEnv';

const timestamp = () => firebase.firestore.FieldValue.serverTimestamp();
const viewer = 'reader';
const author = 'author';

function draft(postId: string, groupId: unknown = null) {
  return {
    postId,
    authorId: viewer,
    authorSnapshot: { displayName: 'Reader', photoURL: null },
    text: 'Publicación de prueba',
    media: [],
    status: 'uploading',
    groupId,
    createdAt: timestamp(),
    updatedAt: null,
  };
}

async function seed(post: Record<string, unknown> = {}, group?: 'public' | 'private') {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const uid of [author, viewer, 'owner']) {
      await db.doc(`users_public/${uid}`).set({ displayName: uid, accountVisibility: 'public' });
    }
    await db.doc('posts/post').set({ authorId: author, groupId: null, ...post });
    if (group) await db.doc('groups/group').set({ ownerId: 'owner', visibility: group });
  });
  return env.authenticatedContext(viewer).firestore();
}

async function adminWrite(path: string, data: Record<string, unknown> | null) {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const ref = ctx.firestore().doc(path);
    if (data) await ref.set(data);
    else await ref.delete();
  });
}

function operations(db: firebase.firestore.Firestore, uid = viewer) {
  return [
    () => db.doc(`posts/post/likes/${uid}`).set({ uid, postId: 'post', createdAt: timestamp() }),
    () => db.doc(`users/${uid}/likes/post`).set({ postId: 'post', createdAt: timestamp() }),
    () => db.doc(`users/${uid}/savedPosts/post`).set({ postId: 'post', createdAt: timestamp() }),
    () =>
      db.doc(`posts/post/comments/comment-${uid}`).set({
        postId: 'post',
        authorId: uid,
        authorSnapshot: { displayName: 'Reader', photoURL: null },
        text: 'Comentario',
        createdAt: timestamp(),
      }),
  ];
}

describe('Post write authorization at the server boundary', () => {
  beforeAll(async () => {
    await getRulesTestEnv();
  }, 30000);
  beforeEach(clearRulesTestData);
  afterAll(cleanupRulesTestEnv);

  it('requires a non-guest session even for public posts and comments', async () => {
    const db = await seed();
    await adminWrite('posts/post/comments/public', { authorId: author, text: 'Public comment' });
    await assertSucceeds(db.doc('posts/post').get());
    const env = await getRulesTestEnv();
    for (const context of [
      env.unauthenticatedContext(),
      env.authenticatedContext('guest', { firebase: { sign_in_provider: 'anonymous' } }),
    ]) {
      await assertFails(context.firestore().doc('posts/post').get());
      await assertFails(context.firestore().doc('posts/post/comments/public').get());
    }
  });

  it('protects direct reads as private-group membership and private-account followers change', async () => {
    const db = await seed({ groupId: 'group' }, 'private');
    await adminWrite(`users_public/${author}`, { accountVisibility: 'private' });
    await assertFails(db.doc('posts/post').get());
    await adminWrite(`groups/group/members/${viewer}`, { uid: viewer });
    await assertFails(db.doc('posts/post').get());
    await adminWrite(`users/${author}/followers/${viewer}`, { uid: viewer });
    await assertSucceeds(db.doc('posts/post').get());
    await adminWrite(`users_public/${viewer}`, null);
    await assertFails(db.doc('posts/post').get());
    await adminWrite(`users_public/${viewer}`, { accountVisibility: 'public' });
    await adminWrite(`groups/group/members/${viewer}`, null);
    await assertFails(db.doc('posts/post').get());
    await assertFails(db.collection('posts').where('groupId', '==', 'group').get());
  });

  it('accepts protected media markers and canonical YouTube but denies persisted download tokens', async () => {
    const db = await seed();
    await assertSucceeds(db.doc('posts/new').set(draft('new')));
    const path = `posts/${viewer}/new/images/test.png`;
    const media = {
      type: 'image',
      path,
      url: `https://example.test/image?token=secret`,
      contentType: 'image/png',
    };
    await assertFails(
      db.doc('posts/new').update({ status: 'ready', media: [media], updatedAt: timestamp() }),
    );
    await assertSucceeds(
      db.doc('posts/new').update({
        status: 'ready',
        media: [{ ...media, url: `post-media:${path}` }],
        updatedAt: timestamp(),
      }),
    );
    await assertSucceeds(db.doc('posts/youtube').set(draft('youtube')));
    await assertSucceeds(
      db.doc('posts/youtube').update({
        status: 'ready',
        media: [
          {
            type: 'video',
            path: `posts/${viewer}/youtube/videos/youtube-dQw4w9WgXcQ`,
            url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
            contentType: 'video/youtube',
          },
        ],
        updatedAt: timestamp(),
      }),
    );
  });

  it.each(['public', 'private'] as const)(
    'requires actual membership to publish in a %s group',
    async (visibility) => {
      const db = await seed({}, visibility);
      await assertFails(db.doc('posts/outsider').set(draft('outsider', 'group')));
      // The private user index is not an authorization source.
      await adminWrite(`users/${viewer}/memberships/group`, { groupId: 'group' });
      await assertFails(db.doc('posts/forged-index').set(draft('forged-index', 'group')));
      await adminWrite(`groups/group/members/${viewer}`, {
        uid: viewer,
        groupId: 'group',
        role: 'member',
      });
      await assertSucceeds(db.doc('posts/member').set(draft('member', 'group')));
      await assertSucceeds(
        db.doc('posts/member').update({ status: 'ready', media: [], updatedAt: timestamp() }),
      );
    },
  );

  it('allows the group owner to publish before their membership index exists', async () => {
    await seed({}, 'private');
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('owner').firestore();
    await assertSucceeds(
      db.doc('posts/owner').set({ ...draft('owner', 'group'), authorId: 'owner' }),
    );
  });

  it.each(['missing', '', 123])('rejects invalid or absent group %s', async (groupId) => {
    const db = await seed();
    await assertFails(db.doc('posts/new').set(draft('new', groupId)));
  });

  it('checks legacy publication writes too', async () => {
    const db = await seed({}, 'private');
    await adminWrite(`users_public/${viewer}`, {
      displayName: 'Reader',
      username: 'reader',
      photoURL: null,
    });
    const post = {
      authorId: viewer,
      authorName: 'Reader',
      authorUsername: 'reader',
      authorPhoto: null,
      title: null,
      content: 'Publicación',
      media: [],
      groupId: 'group',
      categoryId: null,
      likeCount: 0,
      commentCount: 0,
      createdAt: timestamp(),
      updatedAt: null,
    };
    await assertFails(db.doc('posts/legacy').set(post));
    await adminWrite(`groups/group/members/${viewer}`, { uid: viewer });
    await assertSucceeds(db.doc('posts/legacy').set(post));
  });

  it('revoked members cannot finish or edit a group post, but can mark it failed and delete it', async () => {
    const db = await seed({}, 'private');
    await adminWrite(`groups/group/members/${viewer}`, { uid: viewer });
    await db.doc('posts/draft').set(draft('draft', 'group'));
    await adminWrite(`groups/group/members/${viewer}`, null);
    await assertFails(
      db.doc('posts/draft').update({ status: 'ready', media: [], updatedAt: timestamp() }),
    );
    await assertFails(db.doc('posts/draft').update({ content: 'Edición', updatedAt: timestamp() }));
    await assertSucceeds(
      db.doc('posts/draft').update({ status: 'failed', media: [], updatedAt: timestamp() }),
    );
    await assertSucceeds(db.doc('posts/draft').delete());
  });

  it.each([undefined, null, 'ready'])(
    'allows interactions on published status %s',
    async (status) => {
      const db = await seed(status === undefined ? {} : { status });
      for (const write of operations(db)) await assertSucceeds(write());
    },
  );

  it.each(['missing', 'uploading', 'failed', 'invalid'])(
    'denies all interactions on %s posts',
    async (status) => {
      const db = await seed({ status });
      if (status === 'missing') await adminWrite('posts/post', null);
      for (const write of operations(db)) await assertFails(write());
    },
  );

  it('does not let a revoked author use the failure path on an already published post', async () => {
    const db = await seed(
      { authorId: viewer, groupId: 'group', status: 'ready', media: [] },
      'private',
    );
    await assertFails(
      db.doc('posts/post').update({ status: 'failed', media: [], updatedAt: timestamp() }),
    );
    await assertSucceeds(db.doc('posts/post').delete());
  });

  it.each([null, ''])(
    'denies interactions when the post author is invalid: %s',
    async (authorId) => {
      const db = await seed({ authorId });
      for (const write of operations(db)) await assertFails(write());
    },
  );

  it('denies anonymous interactions', async () => {
    await seed();
    const env = await getRulesTestEnv();
    for (const write of operations(env.unauthenticatedContext().firestore()))
      await assertFails(write());
  });

  it('requires membership for interactions in private groups, including after revocation', async () => {
    const db = await seed({ groupId: 'group' }, 'private');
    for (const write of operations(db)) await assertFails(write());
    await adminWrite(`groups/group/members/${viewer}`, { uid: viewer });
    for (const write of operations(db)) await assertSucceeds(write());
    await adminWrite(`groups/group/members/${viewer}`, null);
    await assertFails(
      db.doc('posts/post/comments/new').set({
        postId: 'post',
        authorId: viewer,
        authorSnapshot: { displayName: 'Reader', photoURL: null },
        text: 'Ya no soy miembro',
        createdAt: timestamp(),
      }),
    );
  });

  it('allows public-group visitors and private-group owners to interact', async () => {
    const db = await seed({ groupId: 'group' }, 'public');
    for (const write of operations(db)) await assertSucceeds(write());
    await adminWrite('groups/group', { ownerId: 'owner', visibility: 'private' });
    const env = await getRulesTestEnv();
    for (const write of operations(env.authenticatedContext('owner').firestore(), 'owner')) {
      await assertSucceeds(write());
    }
  });

  it.each(['author-blocks-reader', 'reader-blocks-author'])(
    'denies interactions when %s',
    async (direction) => {
      const db = await seed({ groupId: 'group' }, 'private');
      await adminWrite(`groups/group/members/${viewer}`, { uid: viewer });
      const [from, to] = direction === 'author-blocks-reader' ? [author, viewer] : [viewer, author];
      await adminWrite(`users/${from}/blockedUsers/${to}`, { blockedUid: to });
      for (const write of operations(db)) await assertFails(write());
    },
  );

  it('rejects interactions if the referenced group no longer exists', async () => {
    const db = await seed({ groupId: 'group' }, 'private');
    await adminWrite(`groups/group/members/${viewer}`, { uid: viewer });
    await adminWrite('groups/group', null);
    for (const write of operations(db)) await assertFails(write());
  });

  it('allows the normal atomic like/index pair and preserves immutable dates', async () => {
    const db = await seed();
    const refs = [
      db.doc(`posts/post/likes/${viewer}`),
      db.doc(`users/${viewer}/likes/post`),
      db.doc(`users/${viewer}/savedPosts/post`),
    ];
    const batch = db.batch();
    batch.set(refs[0], { uid: viewer, postId: 'post', createdAt: timestamp() });
    batch.set(refs[1], { postId: 'post', createdAt: timestamp() });
    batch.set(refs[2], { postId: 'post', createdAt: timestamp() });
    await assertSucceeds(batch.commit());
    for (const ref of refs) {
      const data = (await ref.get()).data()!;
      await assertSucceeds(ref.set(data));
      await assertFails(ref.update({ createdAt: timestamp() }));
      await assertFails(ref.update({ extra: 'injected' }));
      await assertFails(ref.update({ postId: 'other' }));
    }
  });

  it('validates reaction/index payloads instead of accepting arbitrary data', async () => {
    const db = await seed();
    for (const ref of [
      db.doc(`posts/post/likes/${viewer}`),
      db.doc(`users/${viewer}/likes/post`),
      db.doc(`users/${viewer}/savedPosts/post`),
    ]) {
      const payload = {
        postId: 'post',
        ...(ref.path.startsWith('posts/') ? { uid: viewer } : {}),
        createdAt: timestamp(),
      };
      await assertFails(ref.set({ ...payload, extra: true }));
      await assertFails(ref.set({ ...payload, createdAt: new Date('2000-01-01') }));
      await assertFails(ref.set({ ...payload, postId: 'other' }));
    }
  });

  it('allows removal of owned reactions and comments after a block and parent deletion', async () => {
    const db = await seed();
    for (const write of operations(db)) await write();
    await adminWrite(`users/${author}/blockedUsers/${viewer}`, { blockedUid: viewer });
    await adminWrite('posts/post', null);
    const env = await getRulesTestEnv();
    const outsider = env.authenticatedContext('outsider').firestore();
    const paths = [
      `posts/post/likes/${viewer}`,
      `users/${viewer}/likes/post`,
      `users/${viewer}/savedPosts/post`,
      `posts/post/comments/comment-${viewer}`,
    ];
    for (const path of paths) await assertFails(outsider.doc(path).delete());
    const batch = db.batch();
    for (const path of paths) batch.delete(db.doc(path));
    await assertSucceeds(batch.commit());
  });
});
