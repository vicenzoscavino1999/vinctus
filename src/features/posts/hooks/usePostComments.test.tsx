import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addPostComment,
  getNewPostId,
  getPostComments,
  type PostCommentRead,
} from '@/features/posts/api';
import { usePostComments } from './usePostComments';

vi.mock('@/features/posts/api', () => ({
  addPostComment: vi.fn(),
  getNewPostId: vi.fn(),
  getPostComments: vi.fn(),
}));

const empty = { items: [], lastDoc: null, hasMore: false };
const user = { uid: 'ana', displayName: 'Ana', photoURL: null };
const comment = (id: string): PostCommentRead => ({
  id,
  postId: 'p1',
  authorId: 'ana',
  authorSnapshot: { displayName: 'Ana', photoURL: null },
  text: id,
  createdAt: new Date(),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const options = () => ({ postId: 'p1', user, initialCount: 40, onCommentAdded: vi.fn() });

describe('post comments session', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getPostComments).mockResolvedValue(empty);
    vi.mocked(getNewPostId).mockReturnValue('c1');
    vi.mocked(addPostComment).mockResolvedValue('c1');
  });

  it('keeps the draft and id after failure, then retries without resetting the total', async () => {
    vi.mocked(addPostComment).mockRejectedValueOnce(new Error('Sin conexión'));
    const props = options();
    const { result } = renderHook(() => usePostComments(props));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setMessage('Hola'));
    await act(async () => {
      await result.current.submitComment();
    });
    expect(result.current.message).toBe('Hola');
    expect(result.current.error).toBe('Sin conexión');
    await act(async () => {
      await result.current.submitComment();
    });
    expect(vi.mocked(addPostComment).mock.calls.map((call) => call[4])).toEqual(['c1', 'c1']);
    expect(result.current.message).toBe('');
    expect(result.current.commentTotal).toBe(41);
    expect(props.onCommentAdded).toHaveBeenCalledExactlyOnceWith('p1');
  });

  it('blocks rapid double submission and preserves another draft written during the request', async () => {
    const write = deferred<string>();
    vi.mocked(addPostComment).mockReturnValueOnce(write.promise);
    const { result } = renderHook(() => usePostComments(options()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setMessage('Primero'));
    let sending!: Promise<boolean>;
    act(() => {
      sending = result.current.submitComment();
      void result.current.submitComment();
    });
    expect(addPostComment).toHaveBeenCalledTimes(1);
    act(() => result.current.setMessage('Segundo'));
    await act(async () => {
      write.resolve('c1');
      await sending;
    });
    expect(result.current.message).toBe('Segundo');
    expect(result.current.submitting).toBe(false);
  });

  it('uses another id when the failed draft changes', async () => {
    vi.mocked(addPostComment).mockRejectedValueOnce(new Error('Sin conexión'));
    vi.mocked(getNewPostId).mockReturnValueOnce('c1').mockReturnValueOnce('c2');
    const { result } = renderHook(() => usePostComments(options()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setMessage('Primero'));
    await act(async () => {
      await result.current.submitComment();
    });
    act(() => result.current.setMessage('Otro texto'));
    await act(async () => {
      await result.current.submitComment();
    });
    expect(vi.mocked(addPostComment).mock.calls.map((call) => call[4])).toEqual(['c1', 'c2']);
  });

  it('retains loaded comments when loading another page fails and deduplicates a retry', async () => {
    vi.mocked(getPostComments).mockResolvedValueOnce({
      ...empty,
      items: [comment('c1')],
      hasMore: true,
    });
    const { result } = renderHook(() => usePostComments(options()));
    await waitFor(() => expect(result.current.comments).toHaveLength(1));
    vi.mocked(getPostComments).mockRejectedValueOnce(new Error('Sin conexión'));
    await act(async () => {
      await result.current.loadComments(true);
    });
    expect(result.current.comments.map((c) => c.id)).toEqual(['c1']);
    expect(result.current.hasMore).toBe(true);
    vi.mocked(getPostComments).mockResolvedValueOnce({
      ...empty,
      items: [comment('c1'), comment('c2')],
    });
    await act(async () => {
      await result.current.loadComments(true);
    });
    expect(result.current.comments.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('ignores a page that finishes after a newer refresh', async () => {
    const older = deferred<Awaited<ReturnType<typeof getPostComments>>>();
    const { result } = renderHook(() => usePostComments(options()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(getPostComments)
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ ...empty, items: [comment('fresh')] });
    let page!: Promise<void>;
    act(() => {
      page = result.current.loadComments(true);
    });
    await act(async () => {
      await result.current.loadComments();
    });
    await act(async () => {
      older.resolve({ ...empty, items: [comment('stale')] });
      await page;
    });
    expect(result.current.comments.map((c) => c.id)).toEqual(['fresh']);
  });

  it('does not notify or reload after a sending session unmounts', async () => {
    const write = deferred<string>();
    vi.mocked(addPostComment).mockReturnValueOnce(write.promise);
    const props = options();
    const { result, unmount } = renderHook(() => usePostComments(props));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setMessage('Hola'));
    let sending!: Promise<boolean>;
    act(() => {
      sending = result.current.submitComment();
    });
    unmount();
    write.resolve('c1');
    expect(await sending).toBe(false);
    expect(props.onCommentAdded).not.toHaveBeenCalled();
    expect(getPostComments).toHaveBeenCalledTimes(1);
  });
});
