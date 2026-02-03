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
});
