import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import {
  ABANDONED_POST_STATUS,
  ABANDONED_UPLOAD_AFTER_MS,
  LATE_UPLOAD_GRACE_MS,
  abandonedPostFields,
  cleanupAbandonedPostUploads,
  deletePostUploadPrefix,
  isUnfinishedPostStatus,
  postUploadPrefix,
  reserveDeletedUnfinishedPost,
} from './postUploadCleanup';

type StoredDoc = Record<string, unknown>;

function createFakeStore(initialDocs: Record<string, StoredDoc> = {}) {
  const docs = new Map<string, StoredDoc>(
    Object.entries(initialDocs).map(([path, value]) => [path, { ...value }]),
  );

  const makeRef = (path: string) => {
    const id = path.split('/').pop() ?? '';
    return {
      id,
      path,
      get: async () => {
        const value = docs.get(path);
        return {
          id,
          ref: makeRef(path),
          exists: value !== undefined,
          data: () => (value ? { ...value } : undefined),
          get: (field: string) => value?.[field],
        };
      },
    };
  };

  const db = {
    collection: (collectionName: string) => {
      const filters: Array<(doc: StoredDoc) => boolean> = [];
      const query = {
        doc: (docId: string) => makeRef(`${collectionName}/${docId}`),
        where: (field: string, op: string, target: unknown) => {
          filters.push((doc) => {
            const val = doc[field];
            if (op === 'in' && Array.isArray(target)) return target.includes(val);
            if (op === '<=' && val instanceof Timestamp && target instanceof Timestamp) {
              return val.toMillis() <= target.toMillis();
            }
            return false;
          });
          return query;
        },
        orderBy: () => query,
        limit: (max: number) => ({
          get: async () => {
            const matched = [...docs.entries()]
              .filter(([path, data]) => {
                if (!path.startsWith(`${collectionName}/`)) return false;
                return filters.every((fn) => fn(data));
              })
              .slice(0, max)
              .map(([path, data]) => {
                const id = path.split('/').pop() ?? '';
                return {
                  id,
                  ref: makeRef(path),
                  exists: true,
                  data: () => ({ ...data }),
                  get: (field: string) => data[field],
                };
              });
            return { docs: matched, empty: matched.length === 0 };
          },
        }),
      };
      return query;
    },
    runTransaction: async <T>(
      runner: (tx: {
        get: (ref: ReturnType<typeof makeRef>) => ReturnType<ReturnType<typeof makeRef>['get']>;
        update: (ref: ReturnType<typeof makeRef>, patch: StoredDoc) => void;
        create: (ref: ReturnType<typeof makeRef>, value: StoredDoc) => void;
        delete: (ref: ReturnType<typeof makeRef>) => void;
      }) => Promise<T>,
    ): Promise<T> => {
      const staged = new Map<string, StoredDoc | null>();
      const tx = {
        get: (ref: ReturnType<typeof makeRef>) => ref.get(),
        update: (ref: ReturnType<typeof makeRef>, patch: StoredDoc) => {
          const existing = docs.get(ref.path) ?? {};
          const next: StoredDoc = { ...existing, ...patch };
          for (const [k, v] of Object.entries(next)) {
            if (typeof v === 'object' && v !== null && v.constructor?.name === 'DeleteTransform') {
              delete next[k];
            }
          }
          staged.set(ref.path, next);
        },
        create: (ref: ReturnType<typeof makeRef>, value: StoredDoc) => {
          if (docs.has(ref.path)) throw new Error('Already exists');
          staged.set(ref.path, { ...value });
        },
        delete: (ref: ReturnType<typeof makeRef>) => {
          staged.set(ref.path, null);
        },
      };
      const result = await runner(tx);
      for (const [path, value] of staged.entries()) {
        if (value === null) docs.delete(path);
        else docs.set(path, value);
      }
      return result;
    },
  };

  return { db: db as unknown as Firestore, docs };
}

function createFakeBucket(
  initialFiles: Record<string, { timeCreated: string; updated?: string }> = {},
) {
  const files = new Map(Object.entries(initialFiles));
  const deleted: string[] = [];
  const bucket = {
    getFiles: vi.fn(async ({ prefix }: { prefix: string; versions?: boolean }) => {
      const matched = [...files.entries()]
        .filter(([name]) => name.startsWith(prefix))
        .map(([name, metadata]) => ({
          name,
          metadata,
          delete: vi.fn(async () => {
            files.delete(name);
            deleted.push(name);
          }),
        }));
      return [matched];
    }),
  };
  return {
    bucket: bucket as unknown as Parameters<typeof cleanupAbandonedPostUploads>[1],
    files,
    deleted,
  };
}

describe('post upload cleanup helpers', () => {
  it('builds a scoped Storage prefix only for valid single-segment IDs', () => {
    expect(postUploadPrefix('user_1', 'post_1')).toBe('posts/user_1/post_1/');
    expect(postUploadPrefix('', 'post_1')).toBeNull();
    expect(postUploadPrefix('user_1', '')).toBeNull();
    expect(postUploadPrefix('user/1', 'post_1')).toBeNull();
    expect(postUploadPrefix('user_1', 'post/1')).toBeNull();
    expect(postUploadPrefix('..', 'post_1')).toBeNull();
    expect(postUploadPrefix(null, 'post_1')).toBeNull();
  });

  it('classifies only uploading and failed as unfinished statuses', () => {
    expect(isUnfinishedPostStatus('uploading')).toBe(true);
    expect(isUnfinishedPostStatus('failed')).toBe(true);
    expect(isUnfinishedPostStatus('ready')).toBe(false);
    expect(isUnfinishedPostStatus(ABANDONED_POST_STATUS)).toBe(false);
    expect(isUnfinishedPostStatus(null)).toBe(false);
    expect(isUnfinishedPostStatus(undefined)).toBe(false);
  });

  it('keeps recovery and late-upload grace windows ordered safely', () => {
    expect(ABANDONED_UPLOAD_AFTER_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(LATE_UPLOAD_GRACE_MS).toBeGreaterThan(7 * 24 * 60 * 60 * 1000);
  });

  it('scrubs draft text and media when building an abandoned tombstone', () => {
    const dueAt = Timestamp.fromMillis(1_700_000_000_000);
    const createdAt = Timestamp.fromMillis(1_690_000_000_000);
    const fields = abandonedPostFields(
      {
        authorId: 'ana',
        status: 'uploading',
        title: 'Borrador privado',
        text: 'Contenido no publicado',
        content: 'Contenido no publicado',
        groupId: 'g1',
        categoryId: 'science',
        createdAt,
      },
      'p1',
      dueAt,
    );
    expect(fields).toMatchObject({
      postId: 'p1',
      authorId: 'ana',
      status: ABANDONED_POST_STATUS,
      abandonedFrom: 'uploading',
      mediaCleanupDueAt: dueAt,
      mediaCleanupPass: 0,
      title: null,
      text: '',
      media: [],
      likeCount: 0,
      commentCount: 0,
      groupId: 'g1',
      categoryId: 'science',
      createdAt,
    });
  });

  it('retires stale unfinished uploads in two passes while preserving ready and active uploads', async () => {
    const now = new Date('2026-11-16T00:00:00.000Z');
    const staleAt = Timestamp.fromMillis(now.getTime() - ABANDONED_UPLOAD_AFTER_MS - 60_000);
    const recentAt = Timestamp.fromMillis(now.getTime() - 60_000);

    const { db, docs } = createFakeStore({
      'users/ana': { uid: 'ana', displayName: 'Ana' },
      'posts/ready_post': {
        postId: 'ready_post',
        authorId: 'ana',
        status: 'ready',
        createdAt: staleAt,
        updatedAt: staleAt,
      },
      'posts/recent_draft': {
        postId: 'recent_draft',
        authorId: 'ana',
        status: 'uploading',
        createdAt: recentAt,
        updatedAt: null,
      },
      'posts/active_upload': {
        postId: 'active_upload',
        authorId: 'ana',
        status: 'uploading',
        createdAt: staleAt,
        updatedAt: null,
      },
      'posts/stale_upload': {
        postId: 'stale_upload',
        authorId: 'ana',
        status: 'uploading',
        title: 'Borrador antiguo',
        text: 'Texto antiguo',
        content: 'Texto antiguo',
        createdAt: staleAt,
        updatedAt: null,
      },
    });

    const { bucket, files, deleted } = createFakeBucket({
      'posts/ana/ready_post/images/ok.webp': {
        timeCreated: new Date(staleAt.toMillis()).toISOString(),
      },
      'posts/ana/active_upload/videos/new.mp4': {
        timeCreated: new Date(now.getTime() - 10_000).toISOString(),
      },
      'posts/ana/stale_upload/images/old.webp': {
        timeCreated: new Date(staleAt.toMillis()).toISOString(),
      },
    });

    const pass1 = await cleanupAbandonedPostUploads(db, bucket, { now, limit: 20 });
    expect(pass1).toMatchObject({
      scanned: 2,
      retired: 1,
      skippedActive: 1,
      purged: 1,
      tombstonesRemoved: 0,
      objectsDeleted: 1,
      failures: 0,
    });
    expect(deleted).toEqual(['posts/ana/stale_upload/images/old.webp']);
    expect(files.has('posts/ana/ready_post/images/ok.webp')).toBe(true);
    expect(files.has('posts/ana/active_upload/videos/new.mp4')).toBe(true);
    expect(docs.get('posts/stale_upload')).toMatchObject({
      status: ABANDONED_POST_STATUS,
      title: null,
      text: '',
      mediaCleanupPass: 1,
    });

    // Simulate a late resumable session finishing before Pass 2
    files.set('posts/ana/stale_upload/videos/late.mp4', {
      timeCreated: new Date(now.getTime() + 5_000).toISOString(),
    });
    const pass2Now = new Date(now.getTime() + LATE_UPLOAD_GRACE_MS + 60_000);
    const pass2 = await cleanupAbandonedPostUploads(db, bucket, { now: pass2Now, limit: 20 });
    expect(pass2).toMatchObject({
      retired: 2,
      purged: 2,
      tombstonesRemoved: 1,
      objectsDeleted: 2,
      failures: 0,
    });
    expect(files.has('posts/ana/stale_upload/videos/late.mp4')).toBe(false);
    expect(docs.has('posts/stale_upload')).toBe(false);
  });

  it('reserves a tombstone on unfinished post delete unless recreated or account is deleting', async () => {
    const now = new Date('2026-11-16T00:00:00.000Z');
    const { db, docs } = createFakeStore({
      'users/ana': { uid: 'ana' },
      'users/deleting': { uid: 'deleting' },
      'deletionJobs/deleting': { uid: 'deleting', status: 'running' },
      'posts/recreated': { postId: 'recreated', authorId: 'ana', status: 'uploading' },
    });

    // Normal unfinished deletion reserves the tombstone
    await expect(
      reserveDeletedUnfinishedPost(
        db,
        'deleted_draft',
        { authorId: 'ana', status: 'failed', createdAt: Timestamp.fromDate(now) },
        now,
      ),
    ).resolves.toBe(true);
    expect(docs.get('posts/deleted_draft')?.status).toBe(ABANDONED_POST_STATUS);

    // Already recreated post is not overwritten
    await expect(
      reserveDeletedUnfinishedPost(
        db,
        'recreated',
        { authorId: 'ana', status: 'uploading', createdAt: Timestamp.fromDate(now) },
        now,
      ),
    ).resolves.toBe(false);
    expect(docs.get('posts/recreated')?.status).toBe('uploading');

    // Account with active deletion job does not create a tombstone
    await expect(
      reserveDeletedUnfinishedPost(
        db,
        'from_deleting_user',
        { authorId: 'deleting', status: 'uploading', createdAt: Timestamp.fromDate(now) },
        now,
      ),
    ).resolves.toBe(false);
    expect(docs.has('posts/from_deleting_user')).toBe(false);

    // Ready posts never reserve an abandoned tombstone
    await expect(
      reserveDeletedUnfinishedPost(
        db,
        'ready_deleted',
        { authorId: 'ana', status: 'ready', createdAt: Timestamp.fromDate(now) },
        now,
      ),
    ).resolves.toBe(false);

    const { bucket, files } = createFakeBucket({
      'posts/ana/deleted_draft/images/a.webp': { timeCreated: now.toISOString() },
    });
    expect(await deletePostUploadPrefix(bucket, 'ana', 'deleted_draft')).toBe(1);
    expect(files.size).toBe(0);
    expect(await deletePostUploadPrefix(bucket, 'invalid/id', 'deleted_draft')).toBe(0);
  });
});
