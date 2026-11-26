import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const download = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/protected-post-media', () => ({ downloadPostMedia: download }));

const { cachedPostImageUrl, clearPostImageCache, loadPostImageUrl } =
  await import('./post-image-cache');

let urls = 0;
beforeEach(() => {
  urls = 0;
  download.mockReset();
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:photo-${++urls}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(() => {
  clearPostImageCache();
  vi.restoreAllMocks();
});

it('downloads a photo once and shares it between viewers and later visits', async () => {
  download.mockResolvedValue(new Blob([new Uint8Array(4)]));
  const [first, second] = await Promise.all([
    loadPostImageUrl('post-media:a', 'viewer'),
    loadPostImageUrl('post-media:a', 'viewer'),
  ]);
  expect(first).toBe(second);
  expect(download).toHaveBeenCalledTimes(1);
  expect(download.mock.calls[0][3]).toBe('viewer');
  expect(cachedPostImageUrl('post-media:a', 'viewer')).toBe(first);
  await loadPostImageUrl('post-media:a', 'viewer');
  expect(download).toHaveBeenCalledTimes(1);
});

it('never hands a photo to another account and forgets everything when the account changes', async () => {
  download.mockResolvedValue(new Blob([new Uint8Array(1)]));
  await loadPostImageUrl('post-media:a', 'viewer');
  expect(cachedPostImageUrl('post-media:a', 'someone-else')).toBeNull();
  await loadPostImageUrl('post-media:a', 'someone-else');
  expect(download).toHaveBeenCalledTimes(2);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-1');
  expect(cachedPostImageUrl('post-media:a', 'viewer')).toBeNull();
});

it('does not keep failures, so the next view tries again', async () => {
  download.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Blob(['x']));
  await expect(loadPostImageUrl('post-media:a', 'viewer')).rejects.toThrow('offline');
  await expect(loadPostImageUrl('post-media:a', 'viewer')).resolves.toBe('blob:photo-1');
});

it('runs at most three downloads at a time', async () => {
  const pending: Array<() => void> = [];
  let running = 0;
  let peak = 0;
  download.mockImplementation(
    () =>
      new Promise<Blob>((resolve) => {
        running += 1;
        peak = Math.max(peak, running);
        pending.push(() => {
          running -= 1;
          resolve(new Blob(['x']));
        });
      }),
  );
  const loads = Array.from({ length: 6 }, (_, index) =>
    loadPostImageUrl(`post-media:${index}`, 'viewer'),
  );
  await vi.waitFor(() => expect(pending).toHaveLength(3));
  while (pending.length > 0) {
    pending.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await Promise.all(loads);
  expect(peak).toBe(3);
  expect(download).toHaveBeenCalledTimes(6);
});
