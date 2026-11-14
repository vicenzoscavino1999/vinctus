import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPostUploading, updatePost } from '@/features/posts/api';
import { uploadPostMedia } from '@/shared/lib/storage';
import { PostSubmission } from './PostSubmission';

vi.mock('@/features/posts/api', () => ({ createPostUploading: vi.fn(), updatePost: vi.fn() }));
vi.mock('@/shared/lib/storage', () => ({ uploadPostMedia: vi.fn() }));
const input = {
  postId: 'p1',
  authorId: 'ana',
  authorSnapshot: { displayName: 'Ana', photoURL: null },
  title: null,
  text: 'Hola',
  groupId: 'g1',
};
const file = {
  id: 'f1',
  kind: 'file' as const,
  file: new File(['pdf'], 'notas.pdf', { type: 'application/pdf' }),
};
const media = {
  url: 'https://example.com/a.pdf',
  path: 'posts/ana/p1/files/f1_notas.pdf',
  type: 'file' as const,
};

describe('immutable post submission', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createPostUploading).mockResolvedValue();
    vi.mocked(updatePost).mockResolvedValue();
    vi.mocked(uploadPostMedia).mockResolvedValue([media]);
  });

  it('a lost final acknowledgement retries the same post and reuses uploaded media', async () => {
    vi.mocked(updatePost).mockRejectedValueOnce(new Error('Respuesta perdida'));
    const submission = new PostSubmission(input, [file]);
    await expect(submission.publish(vi.fn())).rejects.toThrow('Respuesta perdida');
    await expect(submission.publish(vi.fn())).resolves.toBe('p1');
    expect(uploadPostMedia).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createPostUploading).mock.calls.map((call) => call[0].postId)).toEqual([
      'p1',
      'p1',
    ]);
    expect(updatePost).toHaveBeenNthCalledWith(2, 'p1', { status: 'ready', media: [media] });
  });

  it('a confirmed post is never republished when presentation is retried', async () => {
    const submission = new PostSubmission(input, [file]);
    await submission.publish(vi.fn());
    await submission.publish(vi.fn());
    expect(createPostUploading).toHaveBeenCalledTimes(1);
    expect(updatePost).toHaveBeenCalledTimes(1);
  });

  it('an upload failure keeps the same post and never marks or deletes a confirmed post', async () => {
    vi.mocked(uploadPostMedia).mockRejectedValueOnce(new Error('Sin conexión'));
    const submission = new PostSubmission(input, [file]);
    await expect(submission.publish(vi.fn())).rejects.toThrow('Sin conexión');
    expect(updatePost).not.toHaveBeenCalled();
    await submission.publish(vi.fn());
    expect(createPostUploading).toHaveBeenLastCalledWith(input);
    expect(updatePost).toHaveBeenCalledExactlyOnceWith('p1', { status: 'ready', media: [media] });
  });
});
