import { downloadPostMedia } from '@/shared/lib/protected-post-media';

/**
 * Protected post photos kept in memory for the session, so a photo seen in Discover shows at once
 * in the feed, the post or when coming back. Memory only (never disk): it is cleared when the
 * account changes. Few downloads run at a time because every request wakes the media function,
 * and a burst of parallel requests starts several cold instances at once.
 */
const MAX_CACHED_BYTES = 64 * 1024 * 1024;
const MAX_PARALLEL_DOWNLOADS = 3;

type Entry = {
  promise: Promise<string>;
  url: string | null;
  bytes: number;
  users: number;
};

const entries = new Map<string, Entry>();
let cachedBytes = 0;
let cacheUid: string | null = null;

let running = 0;
const waiting: Array<() => void> = [];

const acquire = () =>
  new Promise<void>((resolve) => {
    if (running < MAX_PARALLEL_DOWNLOADS) {
      running += 1;
      resolve();
    } else {
      waiting.push(() => {
        running += 1;
        resolve();
      });
    }
  });

const release = () => {
  running -= 1;
  waiting.shift()?.();
};

const forUser = (uid: string) => {
  if (cacheUid !== uid) {
    clearPostImageCache();
    cacheUid = uid;
  }
};

/** Oldest first; photos on screen right now are never dropped. */
const evict = () => {
  for (const [source, entry] of entries) {
    if (cachedBytes <= MAX_CACHED_BYTES) return;
    if (!entry.url || entry.users > 0) continue;
    entries.delete(source);
    cachedBytes -= entry.bytes;
    URL.revokeObjectURL(entry.url);
  }
};

/** The object URL of a photo already downloaded for this account, or null. */
export function cachedPostImageUrl(source: string, uid: string): string | null {
  if (cacheUid !== uid) return null;
  return entries.get(source)?.url ?? null;
}

/** Downloads a photo once (shared by every viewer) and resolves to its object URL. */
export function loadPostImageUrl(source: string, uid: string): Promise<string> {
  forUser(uid);
  const existing = entries.get(source);
  if (existing) {
    entries.delete(source);
    entries.set(source, existing);
    return existing.promise;
  }
  // Nobody aborts it: other components may be waiting for the same photo.
  const controller = new AbortController();
  const promise = (async () => {
    await acquire();
    try {
      return await downloadPostMedia(source, controller.signal, undefined, uid);
    } finally {
      release();
    }
  })().then((blob) => {
    const url = URL.createObjectURL(blob);
    if (entries.get(source) === entry) {
      entry.url = url;
      entry.bytes = blob.size;
      cachedBytes += blob.size;
      evict();
    }
    return url;
  });
  const entry: Entry = { promise, url: null, bytes: 0, users: 0 };
  entries.set(source, entry);
  promise.catch(() => {
    if (entries.get(source) === entry) entries.delete(source);
  });
  return promise;
}

/** Marks a photo as on screen so it is not evicted; call the result when it leaves. */
export function retainPostImage(source: string): () => void {
  const entry = entries.get(source);
  if (!entry) return () => undefined;
  entry.users += 1;
  return () => {
    entry.users = Math.max(0, entry.users - 1);
  };
}

export function clearPostImageCache(): void {
  for (const entry of entries.values()) {
    if (entry.url) URL.revokeObjectURL(entry.url);
  }
  entries.clear();
  cachedBytes = 0;
  cacheUid = null;
}
