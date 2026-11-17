import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import {
  cleanupDeletedGroupJoinRequests,
  cleanupDeletedGroupMembersAndMemberships,
  reconcileGroupMemberCount,
} from './groupCounts';

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
    limit: (n: number) => {
      get: () => Promise<{ empty: boolean; size: number; docs: FakeDocSnapshot[] }>;
    };
  };
  get: () => Promise<FakeDocSnapshot>;
  delete: () => Promise<void>;
}

interface FakeTransaction {
  get: (
    target: FakeDocRef | FakeCountQuery,
  ) => Promise<FakeDocSnapshot | { data: () => { count: number } }>;
  update: (ref: FakeDocRef, data: StoredDoc) => void;
}

const isCountQuery = (target: FakeDocRef | FakeCountQuery): target is FakeCountQuery =>
  '__countPrefix' in target;

function createFakeStore(initialDocs: Record<string, StoredDoc> = {}) {
  const docs = new Map<string, StoredDoc>(
    Object.entries(initialDocs).map(([path, value]) => [path, { ...value }]),
  );

  const directChildren = (prefix: string) =>
    [...docs.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path]) => makeDocRef(path));

  const makeSnap = (path: string): FakeDocSnapshot => {
    const id = path.split('/').pop() ?? '';
    const value = docs.get(path);
    return {
      id,
      ref: makeDocRef(path),
      exists: value !== undefined,
      data: () => (value ? { ...value } : undefined),
    };
  };

  const makeCollectionHandle = (prefix: string) => ({
    doc: (docId: string) => makeDocRef(`${prefix}${docId}`),
    count: () => ({ __countPrefix: prefix }),
    limit: (n: number) => ({
      get: async () => {
        const refs = directChildren(prefix).slice(0, n);
        const snaps = refs.map((ref) => makeSnap(ref.path));
        return { empty: snaps.length === 0, size: snaps.length, docs: snaps };
      },
    }),
    where: (field: string, _op: string, value: unknown) => ({
      limit: (n: number) => ({
        get: async () => {
          const snaps = directChildren(prefix)
            .map((ref) => makeSnap(ref.path))
            .filter((snap) => snap.data()?.[field] === value)
            .slice(0, n);
          return { empty: snaps.length === 0, size: snaps.length, docs: snaps };
        },
      }),
    }),
  });

  const makeDocRef = (path: string): FakeDocRef => {
    const id = path.split('/').pop() ?? '';
    return {
      id,
      path,
      collection: (sub: string) => makeCollectionHandle(`${path}/${sub}/`),
      get: async () => makeSnap(path),
      delete: async () => {
        docs.delete(path);
      },
    };
  };

  const db = {
    collection: (path: string) => makeCollectionHandle(`${path}/`),
    doc: (path: string) => makeDocRef(path),
    batch: () => {
      const deletes: FakeDocRef[] = [];
      return {
        delete: (ref: FakeDocRef) => {
          deletes.push(ref);
        },
        commit: async () => {
          for (const ref of deletes) {
            docs.delete(ref.path);
          }
        },
      };
    },
    runTransaction: async <T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> => {
      const tx: FakeTransaction = {
        get: async (target) => {
          if (isCountQuery(target)) {
            return { data: () => ({ count: directChildren(target.__countPrefix).length }) };
          }
          return target.get();
        },
        update: (ref, data) => {
          const existing = docs.get(ref.path) ?? {};
          docs.set(ref.path, { ...existing, ...data });
        },
      };
      return fn(tx);
    },
  };

  return { db: db as unknown as Firestore, docs };
}

describe('groupCounts', () => {
  it('reconciles memberCount from the members subcollection without double counting', async () => {
    const { db, docs } = createFakeStore({
      'groups/g1': { ownerId: 'owner', memberCount: 99 },
      'groups/g1/members/owner': { uid: 'owner', groupId: 'g1', role: 'admin' },
    });

    await reconcileGroupMemberCount(db, 'g1');
    expect(docs.get('groups/g1')?.memberCount).toBe(1);

    // Calling again (duplicate trigger) stays at 1.
    await reconcileGroupMemberCount(db, 'g1');
    expect(docs.get('groups/g1')?.memberCount).toBe(1);

    docs.set('groups/g1/members/bob', { uid: 'bob', groupId: 'g1', role: 'member' });
    await reconcileGroupMemberCount(db, 'g1');
    expect(docs.get('groups/g1')?.memberCount).toBe(2);

    docs.delete('groups/g1/members/bob');
    await reconcileGroupMemberCount(db, 'g1');
    expect(docs.get('groups/g1')?.memberCount).toBe(1);
  });

  it('does not recreate or write to a deleted group', async () => {
    const { db, docs } = createFakeStore({
      'groups/g1/members/bob': { uid: 'bob', groupId: 'g1', role: 'member' },
    });

    await reconcileGroupMemberCount(db, 'g1');
    expect(docs.has('groups/g1')).toBe(false);
  });

  it('cleans up members, matching user memberships, and group_requests when a group is deleted', async () => {
    const { db, docs } = createFakeStore({
      'groups/g1/members/owner': { uid: 'owner', groupId: 'g1', role: 'admin' },
      'groups/g1/members/bob': { uid: 'bob', groupId: 'g1', role: 'member' },
      'users/owner/memberships/g1': { groupId: 'g1' },
      'users/bob/memberships/g1': { groupId: 'g1' },
      'users/bob/memberships/other': { groupId: 'other' },
      'group_requests/r1': { groupId: 'g1', fromUid: 'carol', status: 'pending' },
      'group_requests/r2': { groupId: 'other', fromUid: 'carol', status: 'pending' },
    });

    const removedMembers = await cleanupDeletedGroupMembersAndMemberships(db, 'g1', 'owner');
    const removedRequests = await cleanupDeletedGroupJoinRequests(db, 'g1');

    expect(removedMembers).toBe(2);
    expect(removedRequests).toBe(1);
    expect(docs.has('groups/g1/members/owner')).toBe(false);
    expect(docs.has('groups/g1/members/bob')).toBe(false);
    expect(docs.has('users/owner/memberships/g1')).toBe(false);
    expect(docs.has('users/bob/memberships/g1')).toBe(false);
    expect(docs.has('users/bob/memberships/other')).toBe(true);
    expect(docs.has('group_requests/r1')).toBe(false);
    expect(docs.has('group_requests/r2')).toBe(true);
  });
});
