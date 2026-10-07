import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signInAnonymously, signOut } from 'firebase/auth';

import {
  addPostComment,
  likePostWithSync,
  savePostWithSync,
  unlikePostWithSync,
  unsavePostWithSync,
} from '@/features/posts/api/mutations';
import { auth } from '@/shared/lib/firebase';
import { cleanupRulesTestEnv, clearRulesTestData, getRulesTestEnv } from '@/tests/rules/testEnv';

async function seedPost(postId: string, data: Record<string, unknown>) {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`posts/${postId}`).set(data);
  });
}

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  const env = await getRulesTestEnv();
  let result: Record<string, unknown> | null = null;

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const snap = await db.doc(path).get();
    if (!snap.exists) {
      result = null;
      return;
    }
    result = (snap.data() ?? null) as Record<string, unknown> | null;
  });

  return result;
}

const waitFor = async <T>(
  fn: () => Promise<T>,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<T> => {
  const timeoutMs = options?.timeoutMs ?? 30000;
  const intervalMs = options?.intervalMs ?? 250;
  const start = Date.now();

  while (true) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
};

describe('Posts API (emulator) - mutations', () => {
  beforeAll(async () => {
    await getRulesTestEnv();
  });

  beforeEach(async () => {
    await clearRulesTestData();
    if (auth.currentUser) {
      await signOut(auth);
    }
  });

  afterAll(async () => {
    if (auth.currentUser) {
      await signOut(auth);
    }
    await cleanupRulesTestEnv();
  });

  it('likes/unlikes a post and updates counters via functions emulator', async () => {
    await seedPost('post_like', {
      authorId: 'user_author',
      authorName: 'Autor',
      authorUsername: 'autor',
      authorPhoto: null,
      title: 'Post',
      content: 'Contenido',
      media: [],
      groupId: null,
      categoryId: null,
      likeCount: 0,
      likesCount: 0,
      commentCount: 0,
      commentsCount: 0,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: null,
    });

    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await likePostWithSync('post_like', uid);

    await waitFor(async () => {
      const post = await readDoc('posts/post_like');
      if (!post) return null;
      const likeCount = typeof post.likeCount === 'number' ? post.likeCount : null;
      return likeCount === 1 ? post : null;
    });

    expect(await readDoc(`posts/post_like/likes/${uid}`)).not.toBeNull();
    expect(await readDoc(`users/${uid}/likes/post_like`)).not.toBeNull();

    await unlikePostWithSync('post_like', uid);

    await waitFor(async () => {
      const post = await readDoc('posts/post_like');
      if (!post) return null;
      const likeCount = typeof post.likeCount === 'number' ? post.likeCount : null;
      return likeCount === 0 ? post : null;
    });
  });

  it('saves/unsaves a post', async () => {
    await seedPost('post_save', {
      authorId: 'user_author',
      authorName: 'Autor',
      authorUsername: 'autor',
      authorPhoto: null,
      title: 'Post',
      content: 'Contenido',
      media: [],
      groupId: null,
      categoryId: null,
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: null,
    });

    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    await savePostWithSync('post_save', uid);
    expect(await readDoc(`users/${uid}/savedPosts/post_save`)).not.toBeNull();

    await unsavePostWithSync('post_save', uid);
    expect(await readDoc(`users/${uid}/savedPosts/post_save`)).toBeNull();
  });

  it('adds a comment and updates commentCount via functions emulator', async () => {
    await seedPost('post_comment', {
      authorId: 'user_author',
      authorName: 'Autor',
      authorUsername: 'autor',
      authorPhoto: null,
      title: 'Post',
      content: 'Contenido',
      media: [],
      groupId: null,
      categoryId: null,
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: null,
    });

    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    const commentId = await addPostComment(
      'post_comment',
      uid,
      { displayName: 'Anon', photoURL: null },
      'Hola desde el test',
    );

    expect(await readDoc(`posts/post_comment/comments/${commentId}`)).not.toBeNull();

    await waitFor(async () => {
      const post = await readDoc('posts/post_comment');
      if (!post) return null;
      const counters = [post.commentCount, post.commentsCount]
        .map((value) =>
          typeof value === 'number'
            ? value
            : typeof value === 'string'
              ? Number(value)
              : Number.NaN,
        )
        .filter((value) => Number.isFinite(value));
      return counters.some((value) => value === 1) ? post : null;
    });
  });
});
