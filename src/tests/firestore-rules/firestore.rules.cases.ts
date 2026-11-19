import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { cleanupRulesTestEnv, clearRulesTestData, getRulesTestEnv } from '@/tests/rules/testEnv';

const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();

async function seedGroup(groupId = 'group_alpha') {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`groups/${groupId}`).set({
      name: 'Grupo Alpha',
      description: 'Grupo de prueba',
      categoryId: null,
      visibility: 'public',
      ownerId: 'user_a',
      iconUrl: null,
      memberCount: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
  });
}

async function seedPost(postId = 'post_alpha') {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('users_public/user_a').set({
      displayName: 'Alice',
      username: 'alice',
      photoURL: null,
      accountVisibility: 'public',
    });
    await db.doc(`posts/${postId}`).set({
      authorId: 'user_a',
      authorName: 'Alice',
      authorUsername: 'alice',
      authorPhoto: null,
      title: 'Post de prueba',
      content: 'Contenido inicial',
      media: [],
      groupId: null,
      categoryId: null,
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: null,
    });
  });
}

async function seedArenaDebate(
  debateId = 'debate_alpha',
  opts?: { createdBy?: string; visibility?: 'public' | 'private'; status?: 'running' | 'done' },
) {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`arenaDebates/${debateId}`).set({
      createdBy: opts?.createdBy ?? 'user_a',
      topic: 'Tema de prueba',
      mode: 'debate',
      personaA: 'scientist',
      personaB: 'philosopher',
      status: opts?.status ?? 'done',
      visibility: opts?.visibility ?? 'public',
      language: 'es',
      likesCount: 0,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
  });
}

async function seedPostComment(
  postId = 'post_alpha',
  commentId = 'comment_alpha',
  authorId = 'user_a',
) {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`posts/${postId}/comments/${commentId}`).set({
      postId,
      authorId,
      authorSnapshot: { displayName: 'Alice', photoURL: null },
      text: 'Comentario de prueba',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
  });
}

async function seedStory(storyId = 'story_alpha', ownerId = 'user_b') {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`stories/${storyId}`).set({
      ownerId,
      ownerSnapshot: {
        displayName: 'User B',
        photoURL: null,
      },
      mediaType: 'image',
      mediaUrl: 'https://example.com/story.jpg',
      mediaPath: `stories/${ownerId}/${storyId}/original/story.jpg`,
      thumbUrl: null,
      thumbPath: null,
      visibility: 'friends',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: new Date('2026-01-02T00:00:00Z'),
    });
  });
}

async function seedFriendIndex(uid = 'user_a', friendUid = 'user_b') {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`users/${uid}/friends/${friendUid}`).set({
      uid: friendUid,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    await db.doc(`users/${friendUid}/friends/${uid}`).set({
      uid,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
  });
}

async function seedDirectConversation(conversationId = 'dm_user_b_user_c') {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`conversations/${conversationId}`).set({
      type: 'direct',
      memberIds: ['user_b', 'user_c'],
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
  });
}

async function seedFollowRequest(
  requestId = 'user_a_user_b',
  fromUid = 'user_a',
  toUid = 'user_b',
  status: 'pending' | 'accepted' | 'declined' = 'pending',
) {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`follow_requests/${requestId}`).set({
      fromUid,
      toUid,
      status,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
  });
}

async function seedFriendRequest(
  requestId = 'friend_req_1',
  fromUid = 'user_a',
  toUid = 'user_b',
  status: 'pending' | 'accepted' | 'rejected' = 'pending',
) {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`friend_requests/${requestId}`).set({
      fromUid,
      toUid,
      status,
      fromUserName: 'User A',
      fromUserPhoto: null,
      toUserName: 'User B',
      toUserPhoto: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
  });
}

async function seedFollower(ownerUid = 'user_b', followerUid = 'user_a') {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`users/${ownerUid}/followers/${followerUid}`).set({
      uid: followerUid,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
  });
}

async function seedBlockedUser(ownerUid = 'user_b', blockedUid = 'user_a') {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`users/${ownerUid}/blockedUsers/${blockedUid}`).set({
      blockedUid,
      status: 'active',
      blockedAt: new Date('2026-01-01T00:00:00Z'),
    });
  });
}

describe('Firestore Rules - critical access controls', () => {
  beforeAll(async () => {
    await getRulesTestEnv();
  });

  beforeEach(async () => {
    await clearRulesTestData();
  });

  afterAll(async () => {
    await cleanupRulesTestEnv();
  });

  it('denies unauthenticated post creation', async () => {
    const env = await getRulesTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await assertFails(
      db.doc('posts/post_noauth').set({
        postId: 'post_noauth',
        authorId: 'user_a',
        authorSnapshot: { displayName: 'Alice', photoURL: null },
        title: 'Titulo',
        text: 'Contenido',
        media: [],
        status: 'uploading',
        createdAt: serverTimestamp(),
        updatedAt: null,
      }),
    );
  });

  it('allows valid uploading-style post creation for authenticated author', async () => {
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertSucceeds(
      db.doc('posts/post_auth_ok').set({
        postId: 'post_auth_ok',
        authorId: 'user_a',
        authorSnapshot: { displayName: 'Alice', photoURL: null },
        title: 'Titulo',
        text: 'Contenido',
        media: [],
        status: 'uploading',
        createdAt: serverTimestamp(),
        updatedAt: null,
      }),
    );
  });

  it('allows owner update on groups but denies non-owner', async () => {
    await seedGroup('group_owner_only');
    const env = await getRulesTestEnv();

    const ownerDb = env.authenticatedContext('user_a').firestore();
    await assertSucceeds(
      ownerDb.doc('groups/group_owner_only').update({
        description: 'Descripcion actualizada por owner',
        updatedAt: serverTimestamp(),
      }),
    );

    const outsiderDb = env.authenticatedContext('user_b').firestore();
    await assertFails(
      outsiderDb.doc('groups/group_owner_only').update({
        description: 'Intento no autorizado',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('denies chat conversation read for non-participant', async () => {
    await seedDirectConversation('dm_user_b_user_c');
    const env = await getRulesTestEnv();

    const outsiderDb = env.authenticatedContext('user_a').firestore();
    await assertFails(outsiderDb.doc('conversations/dm_user_b_user_c').get());

    const memberDb = env.authenticatedContext('user_b').firestore();
    await assertSucceeds(memberDb.doc('conversations/dm_user_b_user_c').get());
  });

  it('denies post comments with unknown extra fields', async () => {
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertFails(
      db.doc('posts/post_any/comments/comment_extra').set({
        postId: 'post_any',
        authorId: 'user_a',
        authorSnapshot: { displayName: 'Alice', photoURL: null },
        text: 'Comentario legitimo',
        createdAt: serverTimestamp(),
        extraField: 'no permitido',
      }),
    );
  });

  it('denies post updates that try to modify immutable counters', async () => {
    await seedPost('post_counter_guard');
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertFails(
      db.doc('posts/post_counter_guard').update({
        likeCount: 99,
        updatedAt: serverTimestamp(),
      }),
    );

    await assertSucceeds(
      db.doc('posts/post_counter_guard').update({
        content: 'Contenido editado por autor',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('allows reading missing post documents (not found path)', async () => {
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertSucceeds(db.doc('posts/post_missing').get());
  });

  it('denies direct comment lists even for missing posts', async () => {
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertFails(db.collection('posts/post_empty/comments').limit(10).get());
  });

  it('denies creating likes when path uid does not match auth user', async () => {
    await seedPost('post_like_guard');
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertFails(
      db.doc('posts/post_like_guard/likes/user_b').set({
        uid: 'user_b',
        postId: 'post_like_guard',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('allows creating and deleting own like with valid payload', async () => {
    await seedPost('post_like_owner');
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertSucceeds(
      db.doc('posts/post_like_owner/likes/user_a').set({
        uid: 'user_a',
        postId: 'post_like_owner',
        createdAt: serverTimestamp(),
      }),
    );

    await assertSucceeds(db.doc('posts/post_like_owner/likes/user_a').delete());
  });

  it('denies writing saved posts for another user', async () => {
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertFails(
      db.doc('users/user_b/savedPosts/post_x').set({
        postId: 'post_x',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('allows writing saved posts for own user', async () => {
    await seedPost('post_x');
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertSucceeds(
      db.doc('users/user_a/savedPosts/post_x').set({
        postId: 'post_x',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('allows owner profile backfill as nested settings and removal of stray dotted fields', async () => {
    const env = await getRulesTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .doc('users/user_a')
        .set({
          uid: 'user_a',
          reputation: 5,
          karmaGlobal: 3,
          karmaByInterest: { science: 3 },
          settings: { notifications: { pushEnabled: true } },
          // Literal top-level field left by the old setDoc-based backfill
          'settings.privacy': { accountVisibility: 'public' },
        });
    });

    const ownerDb = env.authenticatedContext('user_a').firestore();
    await assertSucceeds(
      ownerDb.doc('users/user_a').update({
        'settings.privacy': { accountVisibility: 'public' },
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      ownerDb
        .doc('users/user_a')
        .set({ 'settings.privacy': firebase.firestore.FieldValue.delete() }, { merge: true }),
    );

    const outsiderDb = env.authenticatedContext('user_b').firestore();
    await assertFails(
      outsiderDb
        .doc('users/user_a')
        .update({ 'settings.privacy': { accountVisibility: 'private' } }),
    );

    await env.withSecurityRulesDisabled(async (ctx) => {
      const data = (await ctx.firestore().doc('users/user_a').get()).data() ?? {};
      expect(data.settings).toEqual({
        notifications: { pushEnabled: true },
        privacy: { accountVisibility: 'public' },
      });
      expect(Object.keys(data)).not.toContain('settings.privacy');
    });
  });

  it('denies writing followed categories for another user', async () => {
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertFails(
      db.doc('users/user_b/followedCategories/science').set({
        categoryId: 'science',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('allows writing followed categories for own user', async () => {
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertSucceeds(
      db.doc('users/user_a/followedCategories/science').set({
        categoryId: 'science',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('enforces strict schema and immutable createdAt on savedCategories', async () => {
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertFails(
      db.doc('users/user_a/savedCategories/science').set({
        categoryId: 'music',
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      db.doc('users/user_a/savedCategories/science').set({
        categoryId: 'science',
        createdAt: serverTimestamp(),
        extraField: true,
      }),
    );
    await assertSucceeds(
      db.doc('users/user_a/savedCategories/science').set({
        categoryId: 'science',
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      db.doc('users/user_a/savedCategories/science').update({
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      env
        .authenticatedContext('user_b')
        .firestore()
        .doc('users/user_a/savedCategories/science')
        .get(),
    );
  });

  it('denies writing saved arena debates for another user', async () => {
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertFails(
      db.doc('users/user_b/savedArenaDebates/debate_x').set({
        debateId: 'debate_x',
        topic: 'Tema de prueba',
        personaA: 'scientist',
        personaB: 'philosopher',
        summary: null,
        verdictWinner: 'draw',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('allows writing saved arena debates for own user', async () => {
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertSucceeds(
      db.doc('users/user_a/savedArenaDebates/debate_x').set({
        debateId: 'debate_x',
        topic: 'Tema de prueba',
        personaA: 'scientist',
        personaB: 'philosopher',
        summary: null,
        verdictWinner: 'draw',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('denies writing liked arena debates index for another user', async () => {
    await seedArenaDebate('debate_like_index_guard');
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertFails(
      db.doc('users/user_b/likedArenaDebates/debate_like_index_guard').set({
        debateId: 'debate_like_index_guard',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('allows writing liked arena debates index for own user', async () => {
    await seedArenaDebate('debate_like_index_ok');
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertSucceeds(
      db.doc('users/user_a/likedArenaDebates/debate_like_index_ok').set({
        debateId: 'debate_like_index_ok',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('denies creating arena likes when path uid does not match auth user', async () => {
    await seedArenaDebate('debate_like_guard');
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertFails(
      db.doc('arenaDebates/debate_like_guard/likes/user_b').set({
        uid: 'user_b',
        debateId: 'debate_like_guard',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('allows creating and deleting own arena like with valid payload', async () => {
    await seedArenaDebate('debate_like_owner');
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertSucceeds(
      db.doc('arenaDebates/debate_like_owner/likes/user_a').set({
        uid: 'user_a',
        debateId: 'debate_like_owner',
        createdAt: serverTimestamp(),
      }),
    );

    await assertSucceeds(db.doc('arenaDebates/debate_like_owner/likes/user_a').delete());
  });

  it('denies deleting comments from another author', async () => {
    await seedPost('post_comment_owner');
    await seedPostComment('post_comment_owner', 'comment_owner', 'user_a');
    const env = await getRulesTestEnv();
    const outsiderDb = env.authenticatedContext('user_b').firestore();

    await assertFails(outsiderDb.doc('posts/post_comment_owner/comments/comment_owner').delete());
  });

  it('denies status update with media path not tied to postId', async () => {
    await seedPost('post_media_guard');
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertFails(
      db.doc('posts/post_media_guard').update({
        status: 'ready',
        media: [
          {
            type: 'image',
            url: 'https://example.com/file.jpg',
            path: 'posts/user_a/post_other/images/file.jpg',
            contentType: 'image/jpeg',
          },
        ],
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('allows owner to read own story', async () => {
    await seedStory('story_owner', 'user_b');
    const env = await getRulesTestEnv();
    const ownerDb = env.authenticatedContext('user_b').firestore();

    await assertSucceeds(ownerDb.doc('stories/story_owner').get());
  });

  it('allows friend to read story via friends index', async () => {
    await seedStory('story_friend_visible', 'user_b');
    await seedFriendIndex('user_a', 'user_b');
    const env = await getRulesTestEnv();
    const friendDb = env.authenticatedContext('user_a').firestore();

    await assertSucceeds(
      friendDb
        .collection('stories')
        .where('ownerId', 'in', ['user_b'])
        .where('visibility', '==', 'friends')
        .where('expiresAt', '>', new Date('2025-12-31T00:00:00Z'))
        .orderBy('expiresAt', 'desc')
        .get(),
    );
  });

  it('denies story read for non-friend user', async () => {
    await seedStory('story_not_friend', 'user_b');
    const env = await getRulesTestEnv();
    const outsiderDb = env.authenticatedContext('user_c').firestore();

    await assertFails(outsiderDb.doc('stories/story_not_friend').get());
  });

  it('denies story read when blocked even if friend index or follower exists', async () => {
    await seedStory('story_blocked', 'user_b');
    await seedFriendIndex('user_a', 'user_b');
    const env = await getRulesTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('users/user_b/followers/user_a').set({
        uid: 'user_a',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      await db.doc('users/user_b/blockedUsers/user_a').set({
        blockedUid: 'user_a',
        status: 'active',
        blockedAt: new Date('2026-01-01T00:00:00Z'),
      });
    });

    const blockedViewerDb = env.authenticatedContext('user_a').firestore();
    await assertFails(blockedViewerDb.doc('stories/story_blocked').get());

    const ownerDb = env.authenticatedContext('user_b').firestore();
    await assertSucceeds(ownerDb.doc('stories/story_blocked').get());
  });

  it('validates story creation paths and field limits strictly', async () => {
    const env = await getRulesTestEnv();
    const ownerDb = env.authenticatedContext('user_a').firestore();
    const validExpiresAt = firebase.firestore.Timestamp.fromMillis(
      Date.now() + 24 * 60 * 60 * 1000,
    );

    await assertSucceeds(
      ownerDb.doc('stories/story_valid').set({
        ownerId: 'user_a',
        ownerSnapshot: { displayName: 'Alicia', photoURL: null },
        mediaType: 'image',
        mediaUrl: 'https://example.com/story.jpg',
        mediaPath: 'stories/user_a/story_valid/original/pic.webp',
        thumbUrl: 'https://example.com/thumb.webp',
        thumbPath: 'stories/user_a/story_valid/thumb/thumb.webp',
        visibility: 'friends',
        createdAt: serverTimestamp(),
        expiresAt: validExpiresAt,
      }),
    );

    // Rejects cross-user or non-storyId-scoped Storage mediaPath / thumbPath.
    await assertFails(
      ownerDb.doc('stories/story_bad_path').set({
        ownerId: 'user_a',
        ownerSnapshot: { displayName: 'Alicia', photoURL: null },
        mediaType: 'image',
        mediaUrl: 'https://example.com/story.jpg',
        mediaPath: 'stories/user_b/other/original/victim.jpg',
        thumbUrl: null,
        thumbPath: null,
        visibility: 'friends',
        createdAt: serverTimestamp(),
        expiresAt: validExpiresAt,
      }),
    );

    await assertFails(
      ownerDb.doc('stories/story_bad_thumb').set({
        ownerId: 'user_a',
        ownerSnapshot: { displayName: 'Alicia', photoURL: null },
        mediaType: 'image',
        mediaUrl: 'https://example.com/story.jpg',
        mediaPath: 'stories/user_a/story_bad_thumb/original/pic.webp',
        thumbUrl: 'https://example.com/thumb.webp',
        thumbPath: 'posts/user_a/post_1/images/wrong.webp',
        visibility: 'friends',
        createdAt: serverTimestamp(),
        expiresAt: validExpiresAt,
      }),
    );
  });

  it('protects follow_requests listing and keeps missing-get scoped by requestId', async () => {
    await seedFollowRequest('user_a_user_b', 'user_a', 'user_b', 'pending');
    await seedFollowRequest('user_c_user_d', 'user_c', 'user_d', 'pending');
    const env = await getRulesTestEnv();

    const outsiderDb = env.authenticatedContext('user_x').firestore();
    await assertFails(
      outsiderDb.collection('follow_requests').where('toUid', '==', 'user_b').get(),
    );

    const userBdb = env.authenticatedContext('user_b').firestore();
    await assertSucceeds(
      userBdb.collection('follow_requests').where('toUid', '==', 'user_b').get(),
    );
    await assertFails(userBdb.collection('follow_requests').get());
    await assertSucceeds(userBdb.doc('follow_requests/user_b_user_z').get());
    await assertFails(userBdb.doc('follow_requests/user_x_user_y').get());
  });

  it('allows every write of blockUser and keeps follow removal to the two sides', async () => {
    // user_a blocks user_b. Mirrors blockUser() in src/shared/lib/firestore/blockedUsers.ts and
    // FirebaseModerationRepo.blockUser in ios-native: one batch, then separate cleanup writes.
    const env = await getRulesTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const createdAt = new Date('2026-01-01T00:00:00Z');
      await db.doc('users/user_a/following/user_b').set({ uid: 'user_b', createdAt });
      await db.doc('users/user_a/followers/user_b').set({ uid: 'user_b', createdAt });
      await db.doc('users/user_b/following/user_a').set({ uid: 'user_a', createdAt });
      await db.doc('users/user_b/followers/user_a').set({ uid: 'user_a', createdAt });
      await db.doc('users/user_c/following/user_d').set({ uid: 'user_d', createdAt });
    });
    await seedFollowRequest('user_b_user_a', 'user_b', 'user_a', 'pending');

    const blockerDb = env.authenticatedContext('user_a').firestore();
    const batch = blockerDb.batch();
    batch.set(blockerDb.doc('users/user_a/blockedUsers/user_b'), {
      blockedUid: 'user_b',
      status: 'active',
      blockedAt: serverTimestamp(),
    });
    batch.delete(blockerDb.doc('users/user_a/following/user_b'));
    batch.delete(blockerDb.doc('users/user_a/followers/user_b'));
    batch.delete(blockerDb.doc('users/user_b/followers/user_a'));
    batch.delete(blockerDb.doc('users/user_a/directConversations/dm_user_a_user_b'));
    await assertSucceeds(batch.commit());

    // The followed user can remove the follower's edge; requests only once they exist
    await assertSucceeds(blockerDb.doc('users/user_b/following/user_a').delete());
    await assertSucceeds(blockerDb.doc('follow_requests/user_b_user_a').get());
    await assertSucceeds(blockerDb.doc('follow_requests/user_b_user_a').delete());
    await assertSucceeds(blockerDb.doc('follow_requests/user_a_user_b').get());
    await assertFails(blockerDb.doc('follow_requests/user_a_user_b').delete());

    const outsiderDb = env.authenticatedContext('user_x').firestore();
    await assertFails(outsiderDb.doc('users/user_c/following/user_d').delete());
  });

  it('enforces strict friend request updates and allowed status transitions', async () => {
    await seedFriendRequest('friend_pending', 'user_a', 'user_b', 'pending');
    await seedFriendRequest('friend_rejected', 'user_a', 'user_b', 'rejected');
    await seedFriendRequest('friend_accepted', 'user_a', 'user_b', 'accepted');
    const env = await getRulesTestEnv();

    const receiverDb = env.authenticatedContext('user_b').firestore();
    await assertFails(
      receiverDb.doc('friend_requests/friend_pending').update({
        status: 'accepted',
        updatedAt: serverTimestamp(),
        injected: 'nope',
      }),
    );
    await assertFails(
      receiverDb.doc('friend_requests/friend_pending').update({
        fromUid: 'user_z',
        status: 'accepted',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      receiverDb.doc('friend_requests/friend_pending').update({
        status: 'accepted',
        updatedAt: serverTimestamp(),
      }),
    );

    const senderDb = env.authenticatedContext('user_a').firestore();
    await assertSucceeds(
      senderDb.doc('friend_requests/friend_rejected').update({
        status: 'pending',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      senderDb.doc('friend_requests/friend_accepted').update({
        status: 'pending',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('enforces message schema, size caps, and deterministic ids', async () => {
    await seedDirectConversation('dm_user_b_user_c');
    const env = await getRulesTestEnv();
    const memberDb = env.authenticatedContext('user_b').firestore();

    await assertSucceeds(
      memberDb.doc('conversations/dm_user_b_user_c/messages/msg_ok').set({
        senderId: 'user_b',
        senderName: 'User B',
        senderPhotoURL: null,
        text: 'hola',
        createdAt: serverTimestamp(),
        clientCreatedAt: 1760000000000,
        clientId: 'msg_ok',
        messageType: 'text',
      }),
    );

    await assertFails(
      memberDb.doc('conversations/dm_user_b_user_c/messages/msg_extra').set({
        senderId: 'user_b',
        senderName: 'User B',
        senderPhotoURL: null,
        text: 'hola',
        createdAt: serverTimestamp(),
        clientCreatedAt: 1760000000001,
        clientId: 'msg_extra',
        extraField: true,
      }),
    );

    await assertFails(
      memberDb.doc('conversations/dm_user_b_user_c/messages/msg_too_long').set({
        senderId: 'user_b',
        senderName: 'User B',
        senderPhotoURL: null,
        text: 'x'.repeat(4001),
        createdAt: serverTimestamp(),
        clientCreatedAt: 1760000000002,
        clientId: 'msg_too_long',
      }),
    );

    await assertFails(
      memberDb.doc('conversations/dm_user_b_user_c/messages/msg_empty').set({
        senderId: 'user_b',
        senderName: 'User B',
        senderPhotoURL: null,
        text: '',
        createdAt: serverTimestamp(),
        clientCreatedAt: 1760000000003,
        clientId: 'msg_empty',
      }),
    );

    await assertFails(
      memberDb.doc('conversations/dm_user_b_user_c/messages/msg_bad_id').set({
        senderId: 'user_b',
        senderName: 'User B',
        senderPhotoURL: null,
        text: 'ok',
        createdAt: serverTimestamp(),
        clientCreatedAt: 1760000000004,
        clientId: 'another_id',
      }),
    );
  });

  it('enforces canonical direct conversation creation, relationship gate, and block checks', async () => {
    await seedFollower('user_b', 'user_a');
    await seedFollower('user_d', 'user_a');
    await seedBlockedUser('user_d', 'user_a');
    const env = await getRulesTestEnv();
    const userAdb = env.authenticatedContext('user_a').firestore();

    await assertSucceeds(
      userAdb.doc('conversations/dm_user_a_user_b').set({
        type: 'direct',
        memberIds: ['user_a', 'user_b'],
        lastMessage: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    await assertFails(
      userAdb.doc('conversations/random_dm_doc').set({
        type: 'direct',
        memberIds: ['user_a', 'user_b'],
        lastMessage: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    await assertFails(
      userAdb.doc('conversations/dm_user_a_user_c').set({
        type: 'direct',
        memberIds: ['user_a', 'user_c'],
        lastMessage: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    await assertFails(
      userAdb.doc('conversations/dm_user_a_user_d').set({
        type: 'direct',
        memberIds: ['user_a', 'user_d'],
        lastMessage: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('protects user counters and validates profile text limits on users and users_public', async () => {
    const env = await getRulesTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const base = {
        uid: 'user_a',
        displayName: 'Alice',
        reputation: 0,
        karmaGlobal: 0,
        karmaByInterest: {},
        followersCount: 3,
        followingCount: 2,
        postsCount: 1,
      };
      await db.doc('users/user_a').set(base);
      await db.doc('users_public/user_a').set(base);
    });

    const userAdb = env.authenticatedContext('user_a').firestore();
    await assertFails(userAdb.doc('users/user_a').update({ followersCount: 99 }));
    await assertFails(userAdb.doc('users_public/user_a').update({ followingCount: 99 }));
    await assertFails(userAdb.doc('users/user_a').update({ postsCount: 99 }));
    await assertFails(userAdb.doc('users/user_a').update({ bio: 'x'.repeat(501) }));
    await assertFails(userAdb.doc('users_public/user_a').update({ displayName: 'x'.repeat(121) }));

    await assertSucceeds(
      userAdb.doc('users/user_a').update({
        displayName: 'Alice Actualizada',
        bio: null,
        role: null,
        location: null,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      userAdb.doc('users_public/user_a').update({
        displayName: 'Alice Actualizada',
        updatedAt: serverTimestamp(),
      }),
    );

    await assertFails(
      userAdb.doc('users/user_new_bad').set({
        uid: 'user_new_bad',
        followersCount: 10,
      }),
    );
  });

  it('enforces blocks, self-follow denial, list privacy, and strict follow_request transitions', async () => {
    const env = await getRulesTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('users_public/user_a').set({ uid: 'user_a', accountVisibility: 'public' });
      await db.doc('users_public/user_b').set({ uid: 'user_b', accountVisibility: 'private' });
      await db.doc('users_public/user_c').set({ uid: 'user_c', accountVisibility: 'public' });
      await db
        .doc('users_public/user_blocked')
        .set({ uid: 'user_blocked', accountVisibility: 'public' });
    });
    await seedBlockedUser('user_b', 'user_blocked');
    await seedBlockedUser('user_c', 'user_blocked');
    await seedFollower('user_c', 'user_a');

    const blockedDb = env.authenticatedContext('user_blocked').firestore();
    const userAdb = env.authenticatedContext('user_a').firestore();
    const userBdb = env.authenticatedContext('user_b').firestore();

    // Blocked user cannot send follow request, create public follow, or view follow lists.
    await assertFails(
      blockedDb.doc('follow_requests/user_blocked_user_b').set({
        fromUid: 'user_blocked',
        toUid: 'user_b',
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      blockedDb.doc('users/user_c/followers/user_blocked').set({
        uid: 'user_blocked',
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(blockedDb.collection('users/user_c/followers').get());

    // Self-follow and phantom target follow are denied.
    await assertFails(
      userAdb.doc('users/user_a/followers/user_a').set({
        uid: 'user_a',
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      userAdb.doc('users/ghost_uid/followers/user_a').set({
        uid: 'user_a',
        createdAt: serverTimestamp(),
      }),
    );

    // Valid follow edge cannot mutate createdAt on update.
    await assertSucceeds(
      userAdb.doc('users/user_a/following/user_c').set({
        uid: 'user_c',
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      userAdb.doc('users/user_a/following/user_c').update({
        createdAt: serverTimestamp(),
      }),
    );

    // Follow request lifecycle: pending -> declined -> pending -> accepted; accepted cannot be flipped.
    await assertSucceeds(
      userAdb.doc('follow_requests/user_a_user_b').set({
        fromUid: 'user_a',
        toUid: 'user_b',
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      userBdb.doc('follow_requests/user_a_user_b').update({
        status: 'declined',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      userBdb.doc('follow_requests/user_a_user_b').update({
        status: 'accepted',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      userAdb.doc('follow_requests/user_a_user_b').update({
        status: 'pending',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      userBdb.doc('follow_requests/user_a_user_b').update({
        status: 'accepted',
        updatedAt: serverTimestamp(),
      }),
    );
    // While still following (seed follower edge), requester cannot revert accepted -> pending.
    await seedFollower('user_b', 'user_a');
    await assertFails(
      userAdb.doc('follow_requests/user_a_user_b').update({
        status: 'pending',
        updatedAt: serverTimestamp(),
      }),
    );
    // After unfollowing, re-requesting from accepted tombstone is permitted.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user_b/followers/user_a').delete();
    });
    await assertSucceeds(
      userAdb.doc('follow_requests/user_a_user_b').update({
        status: 'pending',
        updatedAt: serverTimestamp(),
      }),
    );

    // Self-blocking is denied.
    await assertFails(
      userAdb.doc('users/user_a/blockedUsers/user_a').set({
        blockedUid: 'user_a',
        status: 'active',
        blockedAt: serverTimestamp(),
      }),
    );
  });

  it('enforces group member visibility, server-managed memberCount, blocks, and join request lifecycle', async () => {
    const env = await getRulesTestEnv();
    const ownerDb = env.authenticatedContext('user_a').firestore();
    const memberDb = env.authenticatedContext('user_b').firestore();
    const outsiderDb = env.authenticatedContext('user_c').firestore();
    const blockedDb = env.authenticatedContext('user_d').firestore();

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('users/user_a/blockedUsers/user_d').set({
        blockedUid: 'user_d',
        status: 'active',
        blockedAt: new Date('2026-01-01T00:00:00Z'),
      });
      await db.doc('groups/group_pub').set({
        name: 'Grupo Publico',
        description: 'Abierto',
        categoryId: null,
        visibility: 'public',
        ownerId: 'user_a',
        iconUrl: null,
        memberCount: 1,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      await db.doc('groups/group_pub/members/user_a').set({
        uid: 'user_a',
        groupId: 'group_pub',
        role: 'admin',
        joinedAt: new Date('2026-01-01T00:00:00Z'),
      });
      await db.doc('groups/group_priv').set({
        name: 'Grupo Privado',
        description: 'Solo miembros',
        categoryId: null,
        visibility: 'private',
        ownerId: 'user_a',
        iconUrl: null,
        memberCount: 2,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      await db.doc('groups/group_priv/members/user_a').set({
        uid: 'user_a',
        groupId: 'group_priv',
        role: 'admin',
        joinedAt: new Date('2026-01-01T00:00:00Z'),
      });
      await db.doc('groups/group_priv/members/user_b').set({
        uid: 'user_b',
        groupId: 'group_priv',
        role: 'member',
        joinedAt: new Date('2026-01-01T00:00:00Z'),
      });
    });

    // Spoofed initial memberCount is denied; memberCount update by owner is denied.
    await assertFails(
      ownerDb.doc('groups/group_spoofed').set({
        name: 'Grupo Fake',
        description: 'Desc',
        categoryId: null,
        visibility: 'public',
        ownerId: 'user_a',
        iconUrl: null,
        memberCount: 500,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      ownerDb.doc('groups/group_pub').update({
        memberCount: 99,
        updatedAt: serverTimestamp(),
      }),
    );

    // Public group: non-member can list members and self-join as member (not admin); blocked user cannot join.
    await assertSucceeds(outsiderDb.collection('groups/group_pub/members').get());
    await assertFails(
      outsiderDb.doc('groups/group_pub/members/user_c').set({
        uid: 'user_c',
        groupId: 'group_pub',
        role: 'admin',
        joinedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      blockedDb.doc('groups/group_pub/members/user_d').set({
        uid: 'user_d',
        groupId: 'group_pub',
        role: 'member',
        joinedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      outsiderDb.doc('groups/group_pub/members/user_c').set({
        uid: 'user_c',
        groupId: 'group_pub',
        role: 'member',
        joinedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      outsiderDb.doc('users/user_c/memberships/group_pub').set({
        groupId: 'group_pub',
        joinedAt: serverTimestamp(),
      }),
    );
    // Owner can update timestamp metadata on own membership, but cannot spoof groupId or add extra keys.
    await assertSucceeds(
      outsiderDb.doc('users/user_c/memberships/group_pub').update({
        joinedAt: new Date('2025-01-01T00:00:00Z'),
      }),
    );
    await assertFails(
      outsiderDb.doc('users/user_c/memberships/group_pub').update({
        groupId: 'other_group',
      }),
    );
    await assertFails(
      outsiderDb.doc('users/user_c/memberships/group_pub').update({
        role: 'admin',
      }),
    );

    // Private group: outsider can check own status doc (missing) but cannot list or read other members.
    await assertSucceeds(outsiderDb.doc('groups/group_priv/members/user_c').get());
    await assertFails(outsiderDb.doc('groups/group_priv/members/user_b').get());
    await assertFails(outsiderDb.collection('groups/group_priv/members').get());
    await assertSucceeds(memberDb.collection('groups/group_priv/members').get());
    await assertSucceeds(ownerDb.collection('groups/group_priv/members').get());

    // Owner cannot self-demote or delete own member doc; other members can leave and be role-edited.
    await assertFails(
      ownerDb.doc('groups/group_priv/members/user_a').update({
        role: 'member',
      }),
    );
    await assertFails(ownerDb.doc('groups/group_priv/members/user_a').delete());
    await assertSucceeds(
      ownerDb.doc('groups/group_priv/members/user_b').update({
        role: 'moderator',
      }),
    );

    // Join requests: blocked user denied, existing member denied, outsider can create & cancel, owner cannot accept after rejection.
    await assertFails(
      blockedDb.doc('group_requests/req_blocked').set({
        groupId: 'group_priv',
        groupName: 'Grupo Privado',
        fromUid: 'user_d',
        toUid: 'user_a',
        status: 'pending',
        message: null,
        fromUserName: 'Blocked',
        fromUserPhoto: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      memberDb.doc('group_requests/req_member').set({
        groupId: 'group_priv',
        groupName: 'Grupo Privado',
        fromUid: 'user_b',
        toUid: 'user_a',
        status: 'pending',
        message: null,
        fromUserName: 'Member',
        fromUserPhoto: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      outsiderDb.doc('group_requests/req_outsider').set({
        groupId: 'group_priv',
        groupName: 'Grupo Privado',
        fromUid: 'user_c',
        toUid: 'user_a',
        status: 'pending',
        message: null,
        fromUserName: 'Carol',
        fromUserPhoto: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      ownerDb.doc('group_requests/req_outsider').update({
        status: 'rejected',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      ownerDb.doc('group_requests/req_outsider').update({
        status: 'accepted',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(outsiderDb.doc('group_requests/req_outsider').delete());

    // Owner accepting a pending request can execute the full batch (request + member + membership).
    await assertSucceeds(
      outsiderDb.doc('group_requests/req_outsider_accept').set({
        groupId: 'group_priv',
        groupName: 'Grupo Privado',
        fromUid: 'user_c',
        toUid: 'user_a',
        status: 'pending',
        message: null,
        fromUserName: 'Carol',
        fromUserPhoto: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    const acceptBatch = ownerDb.batch();
    acceptBatch.update(ownerDb.doc('group_requests/req_outsider_accept'), {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });
    acceptBatch.set(ownerDb.doc('groups/group_priv/members/user_c'), {
      uid: 'user_c',
      groupId: 'group_priv',
      role: 'member',
      joinedAt: serverTimestamp(),
    });
    acceptBatch.set(ownerDb.doc('users/user_c/memberships/group_priv'), {
      groupId: 'group_priv',
      joinedAt: serverTimestamp(),
    });
    await assertSucceeds(acceptBatch.commit());
  });

  it('enforces owner privacy, safe URLs, owned storagePath, and non-negative itemCount on collections', async () => {
    const env = await getRulesTestEnv();
    const ownerDb = env.authenticatedContext('user_a').firestore();
    const otherDb = env.authenticatedContext('user_b').firestore();

    await assertSucceeds(
      ownerDb.doc('users/user_a/collections/col_1').set({
        name: 'Lecturas',
        icon: 'book',
        itemCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    // Other users cannot read or mutate private collections.
    await assertFails(otherDb.doc('users/user_a/collections/col_1').get());
    await assertFails(
      otherDb.doc('users/user_a/collections/col_1').update({
        name: 'Hack',
        updatedAt: serverTimestamp(),
      }),
    );

    // Negative itemCount update is rejected.
    await assertFails(
      ownerDb.doc('users/user_a/collections/col_1').update({
        itemCount: -1,
        updatedAt: serverTimestamp(),
      }),
    );

    // Link item rejects javascript: URLs and accepts https:// URLs.
    await assertFails(
      ownerDb.doc('users/user_a/collections/col_1/items/bad_link').set({
        ownerId: 'user_a',
        collectionId: 'col_1',
        collectionName: 'Lecturas',
        type: 'link',
        title: 'Malo',
        url: 'javascript:alert(1)',
        text: null,
        fileName: null,
        fileSize: null,
        contentType: null,
        storagePath: null,
        createdAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      ownerDb.doc('users/user_a/collections/col_1/items/good_link').set({
        ownerId: 'user_a',
        collectionId: 'col_1',
        collectionName: 'Lecturas',
        type: 'link',
        title: 'Paper',
        url: 'https://arxiv.org/abs/2401.00001',
        text: null,
        fileName: null,
        fileSize: null,
        contentType: null,
        storagePath: null,
        createdAt: serverTimestamp(),
      }),
    );

    // File item rejects cross-user or cross-collection storagePath and accepts owned path.
    await assertFails(
      ownerDb.doc('users/user_a/collections/col_1/items/bad_file').set({
        ownerId: 'user_a',
        collectionId: 'col_1',
        collectionName: 'Lecturas',
        type: 'file',
        title: 'Ajeno',
        url: 'https://example.com/file.pdf',
        text: null,
        fileName: 'file.pdf',
        fileSize: 1200,
        contentType: 'application/pdf',
        storagePath: 'collections/user_b/col_1/bad_file/file.pdf',
        createdAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      ownerDb.doc('users/user_a/collections/col_1/items/good_file').set({
        ownerId: 'user_a',
        collectionId: 'col_1',
        collectionName: 'Lecturas',
        type: 'file',
        title: 'Propio',
        url: 'https://example.com/file.pdf',
        text: null,
        fileName: 'file.pdf',
        fileSize: 1200,
        contentType: 'application/pdf',
        storagePath: 'collections/user_a/col_1/good_file/file.pdf',
        createdAt: serverTimestamp(),
      }),
    );

    // Items are immutable once created and private to the owner.
    await assertFails(
      ownerDb.doc('users/user_a/collections/col_1/items/good_link').update({ title: 'Editado' }),
    );
    await assertFails(otherDb.doc('users/user_a/collections/col_1/items/good_link').get());
    await assertSucceeds(ownerDb.doc('users/user_a/collections/col_1/items/good_link').delete());
  });

  it('enforces Arena debate privacy, server-only writes, usage ownership, and AI consent ownership', async () => {
    await seedArenaDebate('debate_private_a', {
      createdBy: 'user_a',
      visibility: 'private',
      status: 'done',
    });
    await seedArenaDebate('debate_running_pub', {
      createdBy: 'user_a',
      visibility: 'public',
      status: 'running',
    });

    const env = await getRulesTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await adminDb.doc('arenaDebates/debate_private_a/turns/t0').set({
        idx: 0,
        speaker: 'A',
        text: 'Turno privado',
        createdAt: serverTimestamp(),
      });
      await adminDb.doc('arenaUsage/user_a/days/2026-11-19').set({
        count: 3,
      });
    });

    const ownerDb = env.authenticatedContext('user_a').firestore();
    const otherDb = env.authenticatedContext('user_b').firestore();

    // Private debate + turns: owner can read, outsider cannot read or like.
    await assertSucceeds(ownerDb.doc('arenaDebates/debate_private_a').get());
    await assertSucceeds(ownerDb.doc('arenaDebates/debate_private_a/turns/t0').get());
    await assertFails(otherDb.doc('arenaDebates/debate_private_a').get());
    await assertFails(otherDb.doc('arenaDebates/debate_private_a/turns/t0').get());
    await assertFails(
      otherDb.doc('arenaDebates/debate_private_a/likes/user_b').set({
        uid: 'user_b',
        debateId: 'debate_private_a',
        createdAt: serverTimestamp(),
      }),
    );

    // Running debates cannot be liked until status == 'done'.
    await assertFails(
      ownerDb.doc('arenaDebates/debate_running_pub/likes/user_a').set({
        uid: 'user_a',
        debateId: 'debate_running_pub',
        createdAt: serverTimestamp(),
      }),
    );

    // Client cannot create, update, or delete arenaDebates or arenaUsage directly.
    await assertFails(ownerDb.doc('arenaDebates/debate_private_a').update({ likesCount: 999 }));
    await assertSucceeds(ownerDb.doc('arenaUsage/user_a/days/2026-11-19').get());
    await assertFails(otherDb.doc('arenaUsage/user_a/days/2026-11-19').get());
    await assertFails(ownerDb.doc('arenaUsage/user_a/days/2026-11-19').set({ count: 0 }));

    // AI consent on users/{uid} can only be updated by the owner.
    await assertSucceeds(
      ownerDb.doc('users/user_a').set(
        {
          settings: {
            ai: {
              consentGranted: true,
              consentSource: 'ai_chat',
              consentUpdatedAt: serverTimestamp(),
            },
          },
          updatedAt: serverTimestamp(),
        },
        {
          mergeFields: [
            'settings.ai.consentGranted',
            'settings.ai.consentSource',
            'settings.ai.consentUpdatedAt',
            'updatedAt',
          ],
        },
      ),
    );
    await assertFails(
      otherDb.doc('users/user_a').set(
        {
          settings: {
            ai: {
              consentGranted: false,
              consentSource: 'settings',
              consentUpdatedAt: serverTimestamp(),
            },
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    );
  });
});
