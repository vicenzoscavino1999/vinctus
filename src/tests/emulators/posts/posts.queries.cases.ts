import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'firebase/compat/firestore';

import { getFeedPostById, getFeedPostsPage } from '@/features/posts/api/queries';
import { isAppError } from '@/shared/lib/errors';
import { cleanupRulesTestEnv, clearRulesTestData, getRulesTestEnv } from '@/tests/rules/testEnv';

async function seedPost(postId: string, data: Record<string, unknown>) {
  const env = await getRulesTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`posts/${postId}`).set(data);
  });
}

const postCreatedAt = (isoDate: string) => new Date(isoDate);

describe('Posts API (emulator) - queries', () => {
  beforeAll(async () => {
    await getRulesTestEnv();
  });

  beforeEach(async () => {
    await clearRulesTestData();
  });

  afterAll(async () => {
    await cleanupRulesTestEnv();
  });

  it('paginates feed posts ordered by createdAt desc', async () => {
    await seedPost('post_newest', {
      authorId: 'user_a',
      authorSnapshot: { displayName: 'Alice', photoURL: null },
      title: 'Nuevo',
      text: 'Post nuevo',
      media: [
        { type: 'image', url: 'https://example.com/a.jpg', path: 'posts/user_a/post_newest/a.jpg' },
      ],
      status: 'ready',
      createdAt: postCreatedAt('2026-01-03T00:00:00Z'),
      likeCount: 10,
      commentCount: 3,
    });

    await seedPost('post_middle', {
      authorId: 'user_b',
      authorName: 'Bob',
      authorUsername: 'bob',
      authorPhoto: null,
      title: 'Legacy',
      content: 'Post legacy',
      media: [],
      createdAt: postCreatedAt('2026-01-02T00:00:00Z'),
      likesCount: 7,
      commentsCount: 2,
    });

    await seedPost('post_hidden', {
      authorId: 'user_c',
      authorSnapshot: { displayName: 'Carol', photoURL: null },
      title: 'Subiendo',
      text: 'No debe aparecer',
      media: [],
      status: 'uploading',
      createdAt: postCreatedAt('2026-01-01T00:00:00Z'),
      likeCount: 0,
      commentCount: 0,
    });

    const first = await getFeedPostsPage(2);
    expect(first.items.map((p) => p.postId)).toEqual(['post_newest', 'post_middle']);
    expect(first.hasMore).toBe(true);
    expect(first.lastDoc?.id).toBe('post_middle');

    const second = await getFeedPostsPage(2, first.lastDoc);
    expect(second.items).toEqual([]);
    expect(second.hasMore).toBe(false);
  });

  it('returns null for missing post or non-ready status', async () => {
    await seedPost('post_uploading', {
      authorId: 'user_a',
      authorSnapshot: { displayName: 'Alice', photoURL: null },
      title: 'Subiendo',
      text: 'No debe aparecer',
      media: [],
      status: 'uploading',
      createdAt: postCreatedAt('2026-01-01T00:00:00Z'),
      likeCount: 0,
      commentCount: 0,
    });

    await expect(getFeedPostById('missing_post')).resolves.toBeNull();
    await expect(getFeedPostById('post_uploading')).resolves.toBeNull();
  });

  it('returns a ready post with normalized legacy fields', async () => {
    await seedPost('post_ready', {
      authorId: 'user_b',
      authorName: 'Bob',
      authorPhoto: null,
      title: 'Legacy',
      content: 'Contenido legacy',
      media: [],
      createdAt: postCreatedAt('2026-01-04T00:00:00Z'),
      likesCount: 2,
      commentsCount: 1,
    });

    const post = await getFeedPostById('post_ready');
    expect(post).not.toBeNull();
    expect(post?.postId).toBe('post_ready');
    expect(post?.authorName).toBe('Bob');
    expect(post?.text).toBe('Contenido legacy');
    expect(post?.likeCount).toBe(2);
    expect(post?.commentCount).toBe(1);
  });

  it('validates inputs with AppError', async () => {
    await expect(getFeedPostsPage(0)).rejects.toSatisfy(isAppError);

    try {
      await getFeedPostById('');
      throw new Error('Expected getFeedPostById to throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) {
        expect(error.code).toBe('VALIDATION_FAILED');
      }
    }
  });
});
