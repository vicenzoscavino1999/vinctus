import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  downloadPostMedia,
  POST_MEDIA_CHUNK_BYTES,
  postMediaLocation,
} from './protected-post-media';

const session = vi.hoisted(() => ({
  currentUser: null as null | { uid: string; getIdToken: () => Promise<string> },
}));
const appCheckMock = vi.hoisted(() => ({
  instance: null as object | null,
  getToken: vi.fn(),
}));
vi.mock('@/shared/lib/firebase', () => ({
  auth: session,
  get appCheck() {
    return appCheckMock.instance;
  },
}));
vi.mock('firebase/app-check', () => ({
  getToken: (...args: unknown[]) => appCheckMock.getToken(...args),
}));
const source = 'post-media:posts/author/post/files/report.pdf';
const etag = '"generation:hash"';
const metadata = (size: number) =>
  new Response(null, {
    headers: { 'Content-Length': String(size), ETag: etag, 'Content-Type': 'application/pdf' },
  });
const part = (bytes: Uint8Array, start: number, size: number, tag = etag) =>
  new Response(new Uint8Array(bytes).buffer, {
    status: 206,
    headers: { ETag: tag, 'Content-Range': `bytes ${start}-${start + bytes.length - 1}/${size}` },
  });
beforeEach(() => {
  session.currentUser = { uid: 'viewer', getIdToken: vi.fn().mockResolvedValue('private-token') };
  appCheckMock.instance = null;
  appCheckMock.getToken.mockReset();
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'vinctus-dev');
  vi.stubEnv('VITE_USE_FIREBASE_EMULATOR', 'true');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('downloads exact ranges with bearer headers, no URL credentials or cache, and checks the final length', async () => {
  const size = POST_MEDIA_CHUNK_BYTES + 3;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(metadata(size))
    .mockResolvedValueOnce(part(new Uint8Array(POST_MEDIA_CHUNK_BYTES), 0, size))
    .mockResolvedValueOnce(part(new Uint8Array([1, 2, 3]), POST_MEDIA_CHUNK_BYTES, size));
  vi.stubGlobal('fetch', fetcher);
  const progress = vi.fn();
  const blob = await downloadPostMedia(source, new AbortController().signal, progress);
  expect(blob.size).toBe(size);
  expect(blob.type).toBe('application/pdf');
  expect(fetcher).toHaveBeenCalledTimes(3);
  for (const [url, options] of fetcher.mock.calls) {
    expect(url).not.toContain('private-token');
    expect(options).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      headers: { Authorization: 'Bearer private-token' },
    });
  }
  expect(fetcher.mock.calls[2][1].headers).toMatchObject({
    Range: `bytes=${POST_MEDIA_CHUNK_BYTES}-${size - 1}`,
    'If-Match': etag,
  });
  expect(progress).toHaveBeenLastCalledWith(1);
});

it.each(['changed-etag', 'short-range', 'revoked'] as const)(
  'fails closed on %s without a partial Blob',
  async (failure) => {
    const fetcher = vi.fn().mockResolvedValueOnce(metadata(3));
    fetcher.mockResolvedValueOnce(
      failure === 'revoked'
        ? new Response(null, { status: 404 })
        : part(
            new Uint8Array(failure === 'short-range' ? 2 : 3),
            0,
            3,
            failure === 'changed-etag' ? 'other' : etag,
          ),
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(downloadPostMedia(source, new AbortController().signal)).rejects.toThrow();
  },
);

it('discards a completed download when the account changes during the last request', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(metadata(1))
      .mockImplementationOnce(async () => {
        session.currentUser = null;
        return part(new Uint8Array([1]), 0, 1);
      }),
  );
  await expect(downloadPostMedia(source, new AbortController().signal)).rejects.toThrow();
});

it('rejects invalid paths, oversized bodies and a mismatched UI session before serving bytes', async () => {
  expect(() => postMediaLocation('post-media:posts/a/p/files/nested/file')).toThrow();
  expect(() => postMediaLocation('https://example.test/file')).toThrow();
  const fetcher = vi.fn().mockResolvedValue(metadata(101 * 1024 * 1024));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    downloadPostMedia(source, new AbortController().signal, undefined, 'other'),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  await expect(downloadPostMedia(source, new AbortController().signal)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('does not request even a public attachment without login', async () => {
  session.currentUser = null;
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(downloadPostMedia(source, new AbortController().signal)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it('discards a response after cancellation', async () => {
  const controller = new AbortController();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(metadata(1))
      .mockImplementationOnce(async () => {
        controller.abort();
        return part(new Uint8Array([1]), 0, 1);
      }),
  );
  await expect(downloadPostMedia(source, controller.signal)).rejects.toThrow();
});

it('attaches X-Firebase-AppCheck header when App Check is active and falls back gracefully on token error', async () => {
  appCheckMock.instance = { app: 'mock' };
  appCheckMock.getToken.mockResolvedValue({ token: 'app-check-tok-123' });

  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(metadata(2))
    .mockResolvedValueOnce(part(new Uint8Array([7, 8]), 0, 2));
  vi.stubGlobal('fetch', fetcher);

  const blob = await downloadPostMedia(source, new AbortController().signal);
  expect(blob.size).toBe(2);
  expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
    Authorization: 'Bearer private-token',
    'X-Firebase-AppCheck': 'app-check-tok-123',
  });

  // Token failure in monitoring mode must not block protected media downloads
  appCheckMock.getToken.mockRejectedValue(new Error('app-check-unavailable'));
  const fetcherFallback = vi
    .fn()
    .mockResolvedValueOnce(metadata(1))
    .mockResolvedValueOnce(part(new Uint8Array([9]), 0, 1));
  vi.stubGlobal('fetch', fetcherFallback);

  const fallbackBlob = await downloadPostMedia(source, new AbortController().signal);
  expect(fallbackBlob.size).toBe(1);
  expect(fetcherFallback.mock.calls[0]?.[1]?.headers).toEqual({
    Authorization: 'Bearer private-token',
  });
});
