import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import {
  addPostComment,
  createPostCommentReport,
  createPostReport,
  createPostUploading,
  createStory,
  getNewPostId,
  likePostWithSync,
  savePostWithSync,
  unlikePostWithSync,
  unsavePostWithSync,
  updatePost,
} from '@/features/posts/api/mutations';

vi.mock('@/shared/lib/firestore', () => ({
  addPostComment: vi.fn(),
  createPostCommentReport: vi.fn(),
  createPostReport: vi.fn(),
  createStory: vi.fn(),
  getNewPostId: vi.fn(),
  likePostWithSync: vi.fn(),
  savePostWithSync: vi.fn(),
  unlikePostWithSync: vi.fn(),
  unsavePostWithSync: vi.fn(),
}));

vi.mock('@/shared/lib/firestore-post-upload', () => ({
  createPostUploading: vi.fn(),
  updatePost: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');
const postUpload = await import('@/shared/lib/firestore-post-upload');

describe('posts api mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a validated post id', () => {
    vi.mocked(firestore.getNewPostId).mockReturnValueOnce('post_123');
    expect(getNewPostId()).toBe('post_123');
  });

  it('throws validation error when generated post id is invalid', () => {
    vi.mocked(firestore.getNewPostId).mockReturnValueOnce('');
    const run = () => getNewPostId();
    expect(run).toThrowError(AppError);
    expect(run).toThrowError('Validation failed');
  });

  it('validates and trims comment text before writing', async () => {
    vi.mocked(firestore.addPostComment).mockResolvedValueOnce('comment_1');

    await expect(
      addPostComment(
        'post_1',
        'user_1',
        { displayName: 'Alice', photoURL: null },
        '  hello world  ',
      ),
    ).resolves.toBe('comment_1');

    expect(firestore.addPostComment).toHaveBeenCalledWith(
      'post_1',
      'user_1',
      { displayName: 'Alice', photoURL: null },
      'hello world',
    );
  });

  it('rejects blocked terms in comment text', async () => {
    await expect(
      addPostComment(
        'post_1',
        'user_1',
        { displayName: 'Alice', photoURL: null },
        'te voy a matar',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.addPostComment).not.toHaveBeenCalled();
  });

  it('creates post and comment reports with validated payloads', async () => {
    vi.mocked(firestore.createPostReport).mockResolvedValueOnce('report_post_1');
    vi.mocked(firestore.createPostCommentReport).mockResolvedValueOnce('report_comment_1');

    await expect(
      createPostReport({
        reporterUid: 'user_1',
        postId: 'post_1',
        postAuthorId: 'user_2',
        reason: 'spam',
        details: 'Detalle',
      }),
    ).resolves.toBe('report_post_1');

    await expect(
      createPostCommentReport({
        reporterUid: 'user_1',
        postId: 'post_1',
        commentId: 'comment_1',
        commentAuthorId: 'user_3',
        reason: 'abuse',
        details: null,
      }),
    ).resolves.toBe('report_comment_1');
  });

  it('rejects invalid report payloads for posts', async () => {
    await expect(
      createPostReport({
        reporterUid: '',
        postId: 'post_1',
        reason: 'spam',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await expect(
      createPostCommentReport({
        reporterUid: 'user_1',
        postId: '',
        commentId: 'comment_1',
        reason: 'abuse',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(firestore.createPostReport).not.toHaveBeenCalled();
    expect(firestore.createPostCommentReport).not.toHaveBeenCalled();
  });

  it('rejects empty patch for updatePost', async () => {
    await expect(updatePost('post_1', {})).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(postUpload.updatePost).not.toHaveBeenCalled();
  });

  it('validates createPostUploading input', async () => {
    vi.mocked(postUpload.createPostUploading).mockResolvedValueOnce();

    await expect(
      createPostUploading({
        postId: 'post_1',
        authorId: 'user_1',
        authorSnapshot: { displayName: 'Alice', photoURL: null },
        text: 'New post',
        title: null,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects blocked terms in createPostUploading payload', async () => {
    await expect(
      createPostUploading({
        postId: 'post_1',
        authorId: 'user_1',
        authorSnapshot: { displayName: 'Alice', photoURL: null },
        text: 'contenido de child pornography',
        title: null,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(postUpload.createPostUploading).not.toHaveBeenCalled();
  });

  it('writes a validated story payload', async () => {
    vi.mocked(firestore.createStory).mockResolvedValueOnce('story_1');

    await expect(
      createStory({
        ownerId: 'user_1',
        ownerName: 'Alice',
        ownerPhoto: null,
        mediaType: 'image',
        mediaUrl: 'https://cdn.example.com/file.jpg',
        mediaPath: 'stories/user_1/file.jpg',
      }),
    ).resolves.toBe('story_1');
  });

  it('rejects invalid createStory input', async () => {
    await expect(
      createStory({
        ownerId: 'user_1',
        ownerName: 'Alice',
        ownerPhoto: null,
        mediaType: 'image',
        mediaUrl: 'not-a-url',
        mediaPath: 'stories/user_1/file.jpg',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.createStory).not.toHaveBeenCalled();
  });

  it('updates post with non-empty patch', async () => {
    vi.mocked(postUpload.updatePost).mockResolvedValueOnce();
    await expect(updatePost('post_1', { status: 'ready' })).resolves.toBeUndefined();
  });

  it('retries transient network errors on writes', async () => {
    vi.mocked(firestore.likePostWithSync)
      .mockRejectedValueOnce({ code: 'network-request-failed', message: 'offline' })
      .mockResolvedValueOnce();

    await expect(likePostWithSync('post_1', 'user_1')).resolves.toBeUndefined();
    expect(firestore.likePostWithSync).toHaveBeenCalledTimes(2);
  });

  it('wraps validation and forwards unlike/save/unsave writes', async () => {
    vi.mocked(firestore.unlikePostWithSync).mockResolvedValueOnce();
    vi.mocked(firestore.savePostWithSync).mockResolvedValueOnce();
    vi.mocked(firestore.unsavePostWithSync).mockResolvedValueOnce();

    await expect(unlikePostWithSync('post_1', 'user_1')).resolves.toBeUndefined();
    await expect(savePostWithSync('post_1', 'user_1')).resolves.toBeUndefined();
    await expect(unsavePostWithSync('post_1', 'user_1')).resolves.toBeUndefined();
  });
});
