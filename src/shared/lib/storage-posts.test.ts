import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMetadata, uploadBytesResumable, deleteObject } from 'firebase/storage';
import { uploadPostMedia } from './storage';
vi.mock('@/shared/lib/firebase', () => ({ storage: {} }));

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage, path) => ({ fullPath: path })),
  uploadBytesResumable: vi.fn(),
  uploadBytes: vi.fn(),
  getMetadata: vi.fn(),
  deleteObject: vi.fn(),
  getDownloadURL: vi.fn(async (ref) => `https://example.com/${ref.fullPath}`),
}));

describe('stable post objects', () => {
  const objects = new Map<string, { size: number; contentType: string }>();
  let failSecond = false;
  beforeEach(() => {
    vi.clearAllMocks();
    objects.clear();
    failSecond = false;
    vi.mocked(getMetadata).mockImplementation(async (target) => {
      const metadata = objects.get(target.fullPath);
      if (!metadata) throw { code: 'storage/object-not-found' };
      return metadata as Awaited<ReturnType<typeof getMetadata>>;
    });
    vi.mocked(uploadBytesResumable).mockImplementation((target, data, metadata) => {
      const file = data as File;
      return {
        on: (
          _event: string,
          progress: (snapshot: { bytesTransferred: number }) => void,
          error: (e: Error) => void,
          complete: () => void,
        ) => {
          queueMicrotask(() => {
            if (objects.has(target.fullPath)) return error(new Error('Overwrite forbidden'));
            if (failSecond && target.fullPath.includes('f2_')) {
              failSecond = false;
              return error(new Error('Sin conexión'));
            }
            objects.set(target.fullPath, { size: file.size, contentType: metadata!.contentType! });
            progress({ bytesTransferred: file.size });
            complete();
          });
          return () => {};
        },
      } as unknown as ReturnType<typeof uploadBytesResumable>;
    });
  });
  const items = () => [
    {
      id: 'f1',
      kind: 'file' as const,
      file: new File(['one'], 'one.pdf', { type: 'application/pdf' }),
    },
    {
      id: 'f2',
      kind: 'file' as const,
      file: new File(['two'], 'two.pdf', { type: 'application/pdf' }),
    },
  ];

  it('recovers partial uploads without deleting or overwriting the first object', async () => {
    failSecond = true;
    await expect(uploadPostMedia(items(), 'ana', 'p1')).rejects.toThrow('Sin conexión');
    expect(objects.size).toBe(1);
    const result = await uploadPostMedia(items(), 'ana', 'p1');
    expect(result.map((m) => m.path)).toEqual([
      'posts/ana/p1/files/f1_one.pdf',
      'posts/ana/p1/files/f2_two.pdf',
    ]);
    expect(objects.size).toBe(2);
    expect(uploadBytesResumable).toHaveBeenCalledTimes(3);
    expect(deleteObject).not.toHaveBeenCalled();
  });
  it('does not treat access failures as an absent file', async () => {
    vi.mocked(getMetadata).mockRejectedValueOnce({ code: 'storage/unauthorized' });
    await expect(uploadPostMedia(items(), 'ana', 'p1')).rejects.toMatchObject({
      code: 'storage/unauthorized',
    });
    expect(uploadBytesResumable).not.toHaveBeenCalled();
  });
});
