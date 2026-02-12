import { describe, expect, it } from 'vitest';
import type { PostRead } from '@/shared/lib/firestore/posts';
import { toPostSummary } from '@/features/posts/model/postSummary';

const makePost = (patch: Partial<PostRead> = {}): PostRead => ({
  id: 'post-1',
  postId: 'post-1',
  authorId: 'user-1',
  authorSnapshot: {
    displayName: 'Ana',
    photoURL: null,
  },
  authorName: 'Ana',
  authorUsername: 'ana',
  authorPhoto: null,
  title: null,
  text: 'Texto principal',
  content: 'Texto principal',
  status: 'ready',
  media: [],
  groupId: null,
  categoryId: null,
  likeCount: 4,
  commentCount: 2,
  createdAt: new Date('2026-02-12T10:00:00.000Z') as unknown as PostRead['createdAt'],
  updatedAt: null,
  ...patch,
});

describe('toPostSummary', () => {
  it('usa imagen directa cuando existe', () => {
    const post = makePost({
      media: [
        {
          type: 'image',
          url: 'https://example.com/img.jpg',
          path: 'posts/user-1/post-1/images/img.jpg',
          contentType: 'image/jpeg',
        },
      ],
    });

    const summary = toPostSummary(post);
    expect(summary.imageUrl).toBe('https://example.com/img.jpg');
    expect(summary.likeCount).toBe(4);
    expect(summary.commentCount).toBe(2);
  });

  it('respeta overrides de contadores', () => {
    const post = makePost();
    const summary = toPostSummary(post, { likeCount: 10, commentCount: 9 });
    expect(summary.likeCount).toBe(10);
    expect(summary.commentCount).toBe(9);
  });

  it('hace fallback a texto legacy cuando text viene vacio', () => {
    const post = makePost({ text: '', content: 'Solo legacy' });
    const summary = toPostSummary(post);
    expect(summary.text).toBe('Solo legacy');
  });
});
