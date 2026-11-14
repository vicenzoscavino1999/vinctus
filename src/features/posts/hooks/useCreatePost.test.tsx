import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent } from 'react';
import { createPostUploading, getNewPostId, updatePost } from '@/features/posts/api';
import { uploadPostMedia, deletePostAllMedia } from '@/shared/lib/storage';
import { compressToWebp } from '@/shared/lib/compression';
import { useCreatePost } from './useCreatePost';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@/context/auth', () => ({
  useAuth: () => ({ user: { uid: 'ana', displayName: 'Ana', photoURL: null } }),
}));
vi.mock('@/features/posts/api', () => ({
  createPostUploading: vi.fn(),
  updatePost: vi.fn(),
  getNewPostId: vi.fn(),
}));
vi.mock('@/shared/lib/storage', () => ({ uploadPostMedia: vi.fn(), deletePostAllMedia: vi.fn() }));
vi.mock('@/shared/lib/compression', () => ({
  compressToWebp: vi.fn(),
  validateImage: () => ({ valid: true }),
}));
vi.mock('@/shared/lib/youtubeApi', () => ({ fetchYouTubeVideoDetails: vi.fn() }));
const file = new File(['%PDF'], 'Notas.pdf', { type: 'application/pdf' });
const photo = new File(['png'], 'foto.png', { type: 'image/png' });
const selection = (files: File[]) =>
  ({ target: { files, value: '' } }) as unknown as ChangeEvent<HTMLInputElement>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const options = () => ({ isOpen: true, onClose: vi.fn(), onCreated: vi.fn(), redirectTo: null });

describe('create post recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getNewPostId).mockReturnValue('p1');
    vi.mocked(createPostUploading).mockResolvedValue();
    vi.mocked(updatePost).mockResolvedValue();
    vi.mocked(uploadPostMedia).mockResolvedValue([]);
    vi.mocked(compressToWebp).mockResolvedValue(photo);
  });

  it('an id-generation failure unlocks the composer and preserves the draft', async () => {
    vi.mocked(getNewPostId).mockImplementationOnce(() => {
      throw new Error('Sin conexión');
    });
    const { result } = renderHook(() => useCreatePost(options()));
    act(() => result.current.setText('Hola'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.text).toBe('Hola');
    expect(result.current.isSubmitting).toBe(false);
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(updatePost).toHaveBeenCalledExactlyOnceWith('p1', { status: 'ready', media: [] });
  });

  it('a lost acknowledgement reuses the id and media without deleting files', async () => {
    vi.mocked(updatePost).mockRejectedValueOnce(new Error('Respuesta perdida'));
    const { result } = renderHook(() => useCreatePost(options()));
    act(() => {
      result.current.setText('Hola');
      result.current.handleFileSelect(selection([file]));
    });
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.text).toBe('Hola');
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(getNewPostId).toHaveBeenCalledTimes(1);
    expect(uploadPostMedia).toHaveBeenCalledTimes(1);
    expect(deletePostAllMedia).not.toHaveBeenCalled();
  });

  it('a failed presentation callback never downgrades a saved post', async () => {
    const props = options();
    props.onCreated.mockImplementationOnce(() => {
      throw new Error('Pantalla');
    });
    const { result } = renderHook(() => useCreatePost(props));
    act(() => result.current.setTitle('Solo título'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.error).toContain('ya se guardó');
    expect(vi.mocked(updatePost).mock.calls.map((call) => call[1].status)).toEqual(['ready']);
    expect(deletePostAllMedia).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(updatePost).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('a rapid double tap publishes once', async () => {
    const write = deferred<void>();
    vi.mocked(updatePost).mockReturnValueOnce(write.promise);
    const { result } = renderHook(() => useCreatePost(options()));
    act(() => result.current.setText('Hola'));
    let send!: Promise<void>;
    act(() => {
      send = result.current.handleSubmit();
      void result.current.handleSubmit();
    });
    await waitFor(() => expect(updatePost).toHaveBeenCalledTimes(1));
    await act(async () => {
      write.resolve();
      await send;
    });
    expect(getNewPostId).toHaveBeenCalledTimes(1);
  });

  it('a closed composer cannot navigate or close a later composer', async () => {
    const write = deferred<void>();
    vi.mocked(updatePost).mockReturnValueOnce(write.promise);
    const props = { ...options(), redirectTo: '/feed' };
    const { result, unmount } = renderHook(() => useCreatePost(props));
    act(() => result.current.setText('Hola'));
    let send!: Promise<void>;
    act(() => {
      send = result.current.handleSubmit();
    });
    await waitFor(() => expect(updatePost).toHaveBeenCalledTimes(1));
    unmount();
    write.resolve();
    await send;
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a changed failed draft gets a different post id', async () => {
    vi.mocked(getNewPostId).mockReturnValueOnce('p1').mockReturnValueOnce('p2');
    vi.mocked(updatePost).mockRejectedValueOnce(new Error('Sin conexión'));
    const { result } = renderHook(() => useCreatePost(options()));
    act(() => result.current.setText('Primero'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    act(() => result.current.setText('Segundo'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(vi.mocked(createPostUploading).mock.calls.map((call) => call[0].postId)).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('media-only and YouTube-only posts receive a valid title', async () => {
    const first = renderHook(() => useCreatePost(options()));
    act(() => first.result.current.handleFileSelect(selection([file])));
    expect(first.result.current.canSubmit).toBe(true);
    await act(async () => {
      await first.result.current.handleSubmit();
    });
    expect(createPostUploading).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Publicación', text: '' }),
    );
    first.unmount();
    const second = renderHook(() => useCreatePost(options()));
    act(() => second.result.current.setYoutubeUrl('https://youtu.be/dQw4w9WgXcQ'));
    await act(async () => {
      await second.result.current.handleSubmit();
    });
    expect(createPostUploading).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Video de YouTube', text: '' }),
    );
  });

  it('limits a synchronous batch to ten files and reserves a slot for YouTube', async () => {
    const { result } = renderHook(() => useCreatePost(options()));
    act(() => result.current.handleFileSelect(selection(Array(12).fill(file))));
    expect(result.current.attachments).toHaveLength(10);
    act(() => result.current.setYoutubeUrl('https://youtu.be/dQw4w9WgXcQ'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(createPostUploading).not.toHaveBeenCalled();
    expect(result.current.error).toContain('10 adjuntos');
  });

  it('a late compressed image is ignored after closing the composer', async () => {
    const compression = deferred<File>();
    vi.mocked(compressToWebp).mockReturnValueOnce(compression.promise);
    const { result, rerender } = renderHook(
      ({ isOpen }) => useCreatePost({ ...options(), isOpen }),
      { initialProps: { isOpen: true } },
    );
    let prepare!: Promise<void>;
    act(() => {
      prepare = result.current.handleImageSelect(selection([photo]));
    });
    expect(result.current.canSubmit).toBe(false);
    rerender({ isOpen: false });
    await act(async () => {
      compression.resolve(photo);
      await prepare;
    });
    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.isPreparingMedia).toBe(false);
  });
});
