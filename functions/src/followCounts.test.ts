import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import {
  acceptFollowRequestInTransaction,
  cleanupFollowStateOnBlock,
  reconcileUserFollowersCount,
  reconcileUserFollowingCount,
} from './followCounts';

type StoredDoc = Record<string, unknown>;

interface FakeCountQuery {
  __countPrefix: string;
}

interface FakeDocSnapshot {
  id: string;
  ref: FakeDocRef;
  exists: boolean;
  data: () => StoredDoc | undefined;
}

interface FakeDocRef {
  id: string;
  path: string;
  collection: (sub: string) => {
    doc: (docId: string) => FakeDocRef;
    count: () => FakeCountQuery;
  };
  get: () => Promise<FakeDocSnapshot>;
  delete: () => Promise<void>;
}

interface FakeTransaction {
  get: (
    target: FakeDocRef | FakeCountQuery,
  ) => Promise<FakeDocSnapshot | { data: () => { count: number } }>;
  set: (ref: FakeDocRef, data: StoredDoc) => void;
  update: (ref: FakeDocRef, data: StoredDoc) => void;
}

const isCountQuery = (target: FakeDocRef | FakeCountQuery): target is FakeCountQuery =>
  '__countPrefix' in target;

function createFakeStore(initialDocs: Record<string, StoredDoc> = {}) {
  const docs = new Map<string, StoredDoc>(
    Object.entries(initialDocs).map(([path, value]) => [path, { ...value }]),
  );

  const countDocs = (prefix: string) =>
    [...docs.keys()].filter(
      (path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'),
    ).length;

  const makeDocRef = (path: string): FakeDocRef => {
    const id = path.split('/').pop() ?? '';
    return {
      id,
      path,
      collection: (sub: string) => ({
        doc: (docId: string) => makeDocRef(`${path}/${sub}/${docId}`),
        count: () => ({ __countPrefix: `${path}/${sub}/` }),
      }),
      get: async () => {
        const value = docs.get(path);
        return {
          id,
          ref: makeDocRef(path),
          exists: value !== undefined,
          data: () => (value ? { ...value } : undefined),
        };
      },
      delete: async () => {
        docs.delete(path);
      },
    };
  };

  const db = {
    collection: (name: string) => ({
      doc: (docId: string) => makeDocRef(`${name}/${docId}`),
    }),
    doc: (path: string) => makeDocRef(path),
    runTransaction: async <T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> => {
      const tx: FakeTransaction = {
        get: async (target) => {
          if (isCountQuery(target)) {
            return { data: () => ({ count: countDocs(target.__countPrefix) }) };
          }
          return target.get();
        },
        set: (ref, data) => {
          docs.set(ref.path, { ...data });
        },
        update: (ref, data) => {
          const existing = docs.get(ref.path) ?? {};
          docs.set(ref.path, { ...existing, ...data });
        },
      };
      return fn(tx);
    },
  } as unknown as Firestore;

  return { db, docs };
}

describe('followCounts', () => {
  it('reconciles followersCount and followingCount from current subcollection counts', async () => {
    const { db, docs } = createFakeStore({
      'users/alice': { uid: 'alice', followersCount: 99, followingCount: 42 },
      'users_public/alice': { uid: 'alice', followersCount: 99, followingCount: 42 },
      'users/alice/followers/bob': { uid: 'bob' },
      'users/alice/followers/carol': { uid: 'carol' },
      'users/alice/following/bob': { uid: 'bob' },
    });

    await reconcileUserFollowersCount(db, 'alice');
    await reconcileUserFollowingCount(db, 'alice');

    expect(docs.get('users/alice')).toMatchObject({ followersCount: 2, followingCount: 1 });
    expect(docs.get('users_public/alice')).toMatchObject({
      followersCount: 2,
      followingCount: 1,
    });
  });

  it('does not recreate deleted user documents during reconciliation', async () => {
    const { db, docs } = createFakeStore({});

    await reconcileUserFollowersCount(db, 'deleted_user');
    await reconcileUserFollowingCount(db, 'deleted_user');

    expect(docs.has('users/deleted_user')).toBe(false);
    expect(docs.has('users_public/deleted_user')).toBe(false);
  });

  it('creates follow edges idempotently when accepting a valid request and blocks muted/deleted pairs', async () => {
    const existingCreatedAt = { existing: true };
    const { db, docs } = createFakeStore({
      'users/bob': { uid: 'bob' },
      'users/alice': { uid: 'alice' },
      'users/carol': { uid: 'carol' },
      'users/alice/blockedUsers/carol': { blockedUid: 'carol', status: 'active' },
      'users/bob/followers/alice': { uid: 'alice', createdAt: existingCreatedAt },
    });

    const accepted = await acceptFollowRequestInTransaction(db, 'alice', 'bob');
    expect(accepted).toBe('accepted');
    expect(docs.get('users/bob/followers/alice')?.createdAt).toBe(existingCreatedAt);
    expect(docs.get('users/alice/following/bob')?.uid).toBe('bob');

    const blocked = await acceptFollowRequestInTransaction(db, 'carol', 'alice');
    expect(blocked).toBe('blocked');
    expect(docs.has('users/alice/followers/carol')).toBe(false);

    const missing = await acceptFollowRequestInTransaction(db, 'alice', 'ghost');
    expect(missing).toBe('missing_profile');
    expect(docs.has('users/ghost/followers/alice')).toBe(false);
  });

  it('cleans up symmetric follow edges, friend indexes, and requests on block', async () => {
    const { db, docs } = createFakeStore({
      'users/alice/followers/bob': { uid: 'bob' },
      'users/alice/following/bob': { uid: 'bob' },
      'users/alice/friends/bob': { uid: 'bob' },
      'users/bob/followers/alice': { uid: 'alice' },
      'users/bob/following/alice': { uid: 'alice' },
      'users/bob/friends/alice': { uid: 'alice' },
      'follow_requests/alice_bob': { fromUid: 'alice', toUid: 'bob', status: 'pending' },
      'follow_requests/bob_alice': { fromUid: 'bob', toUid: 'alice', status: 'accepted' },
    });

    await cleanupFollowStateOnBlock(db, 'alice', 'bob');

    expect(docs.size).toBe(0);
  });
});
