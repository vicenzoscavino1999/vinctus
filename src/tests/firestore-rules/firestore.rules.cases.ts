import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

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

  it('allows empty comments query for any post', async () => {
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertSucceeds(db.collection('posts/post_empty/comments').limit(10).get());
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
    const env = await getRulesTestEnv();
    const db = env.authenticatedContext('user_a').firestore();

    await assertSucceeds(
      db.doc('users/user_a/savedPosts/post_x').set({
        postId: 'post_x',
        createdAt: serverTimestamp(),
      }),
    );
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
});
