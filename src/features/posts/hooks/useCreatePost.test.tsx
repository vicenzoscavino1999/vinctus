import { act, cleanup, renderHook as rawRenderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent } from 'react';
import { createPostUploading, getNewPostId, updatePost } from '@/features/posts/api';
import { POST_UPLOAD_ABANDONED_CODE } from '@/shared/lib/firestore-post-upload';
import { uploadPostMedia, deletePostAllMedia } from '@/shared/lib/storage';
import { compressToWebp } from '@/shared/lib/compression';
import { useCreatePost } from './useCreatePost';
import {
  browserPostDraftStore,
  postDraftScopeKey,
  type DraftRecord,
  type PostDraft,
} from '../model/postDraftStore';

const records = new Map<string, DraftRecord>();
const copy = (draft: PostDraft | null): PostDraft | null =>
  draft ? { ...draft, files: draft.files.map(({ id, kind, file }) => ({ id, kind, file })) } : null;
async function renderHook(
  callback: (props: { isOpen: boolean }) => ReturnType<typeof useCreatePost>,
  options?: { initialProps: { isOpen: boolean } },
) {
  const hook = rawRenderHook(callback, options ?? { initialProps: { isOpen: true } });
  await waitFor(() => expect(hook.result.current.draftRestoring).toBe(false));
  return hook;
}

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
  afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  beforeEach(() => {
    vi.resetAllMocks();
    records.clear();
    vi.spyOn(browserPostDraftStore, 'load').mockImplementation(async (scope) => {
      const record = records.get(postDraftScopeKey(scope));
      return record ? { ...record, draft: copy(record.draft) } : { revision: null, draft: null };
    });
    vi.spyOn(browserPostDraftStore, 'save').mockImplementation(async (scope, draft, expected) => {
      const key = postDraftScopeKey(scope);
      if ((records.get(key)?.revision ?? null) !== expected)
        throw new Error('Conflicto de borrador');
      const revision = crypto.randomUUID();
      records.set(key, { revision, draft: copy(draft) });
      return revision;
    });
    vi.mocked(getNewPostId).mockReturnValue('p1');
    vi.mocked(createPostUploading).mockResolvedValue(false);
    vi.mocked(updatePost).mockResolvedValue();
    vi.mocked(uploadPostMedia).mockResolvedValue([]);
    vi.mocked(compressToWebp).mockResolvedValue(photo);
  });

  it('an id-generation failure unlocks the composer and preserves the draft', async () => {
    vi.mocked(getNewPostId).mockImplementationOnce(() => {
      throw new Error('Sin conexión');
    });
    const { result } = await renderHook(() => useCreatePost(options()));
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
    const { result } = await renderHook(() => useCreatePost(options()));
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
    const { result } = await renderHook(() => useCreatePost(props));
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
    const { result } = await renderHook(() => useCreatePost(options()));
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
    const { result, unmount } = await renderHook(() => useCreatePost(props));
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
    const { result } = await renderHook(() => useCreatePost(options()));
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
    const first = await renderHook(() => useCreatePost(options()));
    act(() => first.result.current.handleFileSelect(selection([file])));
    expect(first.result.current.canSubmit).toBe(true);
    await act(async () => {
      await first.result.current.handleSubmit();
    });
    expect(createPostUploading).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Publicación', text: '' }),
    );
    first.unmount();
    const second = await renderHook(() => useCreatePost(options()));
    act(() => second.result.current.setYoutubeUrl('https://youtu.be/dQw4w9WgXcQ'));
    await act(async () => {
      await second.result.current.handleSubmit();
    });
    expect(createPostUploading).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Video de YouTube', text: '' }),
    );
  });

  it('limits a synchronous batch to ten files and reserves a slot for YouTube', async () => {
    const { result } = await renderHook(() => useCreatePost(options()));
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
    const { result, rerender } = await renderHook(
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

  it('closing and reopening restores raw text and durable attachment IDs', async () => {
    const props = options();
    const first = await renderHook(() => useCreatePost(props));
    act(() => {
      first.result.current.setTitle('  Mi título  ');
      first.result.current.setText('  Mi texto\n');
      first.result.current.handleFileSelect(selection([file]));
    });
    const id = first.result.current.attachments[0].id;
    await act(async () => {
      await first.result.current.closeEditor();
    });
    expect(props.onClose).toHaveBeenCalledOnce();
    first.unmount();
    const second = await renderHook(() => useCreatePost(options()));
    expect(second.result.current.title).toBe('  Mi título  ');
    expect(second.result.current.text).toBe('  Mi texto\n');
    expect(second.result.current.attachments[0]).toMatchObject({ id, file });
  });

  it('a fresh composer resumes the saved post ID after a lost final acknowledgement', async () => {
    vi.mocked(updatePost).mockRejectedValueOnce(new Error('Respuesta perdida'));
    const first = await renderHook(() => useCreatePost(options()));
    act(() => {
      first.result.current.setText('Hola');
      first.result.current.handleFileSelect(selection([file]));
    });
    await act(async () => {
      await first.result.current.handleSubmit();
    });
    const stored = [...records.values()][0].draft!;
    expect(stored.pending?.input.postId).toBe('p1');
    expect(stored.files).toHaveLength(1);
    first.unmount();
    vi.mocked(createPostUploading).mockResolvedValueOnce(true);
    const second = await renderHook(() => useCreatePost(options()));
    await act(async () => {
      await second.result.current.handleSubmit();
    });
    expect(getNewPostId).toHaveBeenCalledOnce();
    expect(uploadPostMedia).toHaveBeenCalledOnce();
    expect(updatePost).toHaveBeenCalledOnce();
    expect([...records.values()][0].draft).toBeNull();
  });

  it('failed local persistence blocks all network publishing and retains edits', async () => {
    const hook = await renderHook(() => useCreatePost(options()));
    vi.mocked(browserPostDraftStore.save).mockRejectedValueOnce(new Error('Sin espacio'));
    act(() => hook.result.current.setText('Todavía aquí'));
    await act(async () => {
      await hook.result.current.handleSubmit();
    });
    expect(createPostUploading).not.toHaveBeenCalled();
    expect(hook.result.current.text).toBe('Todavía aquí');
    expect(hook.result.current.draftError).toBe('Sin espacio');
    await act(async () => {
      await hook.result.current.retryDraftSave();
    });
    await act(async () => {
      await hook.result.current.handleSubmit();
    });
    expect(getNewPostId).toHaveBeenCalledOnce();
    expect(createPostUploading).toHaveBeenCalledOnce();
  });

  it('an older editor cannot resurrect a discarded draft', async () => {
    const first = await renderHook(() => useCreatePost(options()));
    const second = await renderHook(() => useCreatePost(options()));
    act(() => first.result.current.setText('Viejo'));
    await act(async () => {
      await second.result.current.discardDraft();
    });
    await act(async () => {
      await first.result.current.handleSubmit();
    });
    expect(first.result.current.text).toBe('Viejo');
    expect(first.result.current.draftError).toContain('Conflicto');
    expect(createPostUploading).not.toHaveBeenCalled();
    expect([...records.values()][0].draft).toBeNull();
  });

  it('text written while sending survives confirmation and the next reopen', async () => {
    const write = deferred<void>();
    vi.mocked(updatePost).mockReturnValueOnce(write.promise);
    const props = options();
    const first = await renderHook(() => useCreatePost(props));
    act(() => first.result.current.setText('Primero'));
    let send!: Promise<void>;
    act(() => {
      send = first.result.current.handleSubmit();
    });
    await waitFor(() => expect(updatePost).toHaveBeenCalledOnce());
    act(() => first.result.current.setText('Segundo'));
    await act(async () => {
      write.resolve();
      await send;
    });
    expect(props.onClose).not.toHaveBeenCalled();
    first.unmount();
    const second = await renderHook(() => useCreatePost(options()));
    expect(second.result.current.text).toBe('Segundo');
  });

  it('the post ID and files are durable before the first network write', async () => {
    const hook = await renderHook(() => useCreatePost(options()));
    act(() => {
      hook.result.current.setText('Hola');
      hook.result.current.handleFileSelect(selection([file]));
    });
    vi.mocked(createPostUploading).mockImplementationOnce(async (input) => {
      const saved = [...records.values()][0].draft!;
      expect(saved.pending?.input).toEqual(input);
      expect(saved.files[0].id).toBe(hook.result.current.attachments[0].id);
      return false;
    });
    await act(async () => {
      await hook.result.current.handleSubmit();
    });
  });

  it('an initial read failure blocks publishing but still allows leaving the editor', async () => {
    vi.mocked(browserPostDraftStore.load).mockRejectedValueOnce(new Error('No disponible'));
    const props = options();
    const hook = rawRenderHook(() => useCreatePost(props));
    await waitFor(() => expect(hook.result.current.draftError).toBe('No disponible'));
    expect(hook.result.current.canSubmit).toBe(false);
    await act(async () => {
      await hook.result.current.closeEditor();
    });
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(browserPostDraftStore.save).not.toHaveBeenCalled();
  });

  it('rotates and flushes a fresh post ID when a restored pending upload was retired as abandoned', async () => {
    vi.mocked(getNewPostId).mockReturnValueOnce('p-old').mockReturnValueOnce('p-fresh');
    vi.mocked(uploadPostMedia).mockRejectedValueOnce(new Error('Sin conexión'));
    const first = await renderHook(() => useCreatePost(options()));
    act(() => {
      first.result.current.setText('Recuperar tras limpieza');
      first.result.current.handleFileSelect(selection([file]));
    });
    await act(async () => {
      await first.result.current.handleSubmit();
    });
    expect([...records.values()][0].draft?.pending?.input.postId).toBe('p-old');
    first.unmount();

    const abandonedError = Object.assign(new Error('Caducó'), {
      cause: { code: POST_UPLOAD_ABANDONED_CODE },
    });
    let persistedReplacementId: string | undefined;
    vi.mocked(createPostUploading)
      .mockRejectedValueOnce(abandonedError)
      .mockImplementationOnce(async (input) => {
        persistedReplacementId = [...records.values()][0].draft?.pending?.input.postId;
        expect(persistedReplacementId).toBe(input.postId);
        return false;
      });
    const second = await renderHook(() => useCreatePost(options()));
    await act(async () => {
      await second.result.current.handleSubmit();
    });
    expect(persistedReplacementId).toBe('p-fresh');
    expect(uploadPostMedia).toHaveBeenLastCalledWith(
      expect.any(Array),
      'ana',
      'p-fresh',
      expect.any(Function),
    );
    expect(updatePost).toHaveBeenCalledExactlyOnceWith('p-fresh', { status: 'ready', media: [] });
    expect([...records.values()][0].draft).toBeNull();
  });
});
