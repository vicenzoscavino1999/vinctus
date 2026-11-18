import { beforeEach, describe, expect, it, vi } from 'vitest';

const docs = new Map<string, Record<string, unknown>>();
const getDocPaths: string[] = [];
const batchSets: Array<{ path: string; data: Record<string, unknown> }> = [];
const batchUpdates: Array<{ path: string; data: Record<string, unknown> }> = [];
const batchCommitMock = vi.fn();
const setDocMock = vi.fn();

const docRef = (path: string) => ({ id: path.split('/').pop() ?? '', path });

interface FakeWhereClause {
  field: string;
  value: unknown;
}

const matchesClauses = (data: Record<string, unknown>, clauses: FakeWhereClause[]) =>
  clauses.every((clause) => data[clause.field] === clause.value);

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({
    path: segments.join('/'),
    clauses: [] as FakeWhereClause[],
  })),
  doc: vi.fn((_dbOrCol: unknown, ...segments: string[]) => {
    if (segments.length === 0) {
      return docRef(`group_requests/auto_${Math.random().toString(36).slice(2, 8)}`);
    }
    return docRef(segments.join('/'));
  }),
  getDoc: vi.fn(async (ref: { id: string; path: string }) => {
    getDocPaths.push(ref.path);
    const data = docs.get(ref.path);
    return {
      id: ref.id,
      exists: () => data !== undefined,
      data: () => (data ? { ...data } : undefined),
    };
  }),
  getDocs: vi.fn(async (q: { path: string; clauses?: FakeWhereClause[] }) => {
    const prefix = `${q.path}/`;
    const clauses = q.clauses ?? [];
    const matched = [...docs.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .filter(([, data]) => matchesClauses(data, clauses))
      .map(([path, data]) => ({
        id: path.split('/').pop() ?? '',
        data: () => ({ ...data }),
      }));
    return { empty: matched.length === 0, size: matched.length, docs: matched };
  }),
  getCountFromServer: vi.fn(),
  setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
    setDocMock(ref.path, data);
    docs.set(ref.path, data);
  }),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(() => {
    const ops: Array<() => void> = [];
    return {
      set: (ref: { path: string }, data: Record<string, unknown>) => {
        ops.push(() => {
          batchSets.push({ path: ref.path, data });
          docs.set(ref.path, data);
        });
      },
      update: (ref: { path: string }, data: Record<string, unknown>) => {
        ops.push(() => {
          batchUpdates.push({ path: ref.path, data });
          const prev = docs.get(ref.path) ?? {};
          docs.set(ref.path, { ...prev, ...data });
        });
      },
      delete: (ref: { path: string }) => {
        ops.push(() => {
          docs.delete(ref.path);
        });
      },
      commit: async () => {
        batchCommitMock();
        for (const op of ops) op();
      },
    };
  }),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  Timestamp: { now: vi.fn(() => ({ toDate: () => new Date() })) },
  query: vi.fn(
    (
      base: { path: string; clauses?: FakeWhereClause[] },
      ...constraints: Array<{ type: string; field?: string; value?: unknown }>
    ) => {
      const clauses = [...(base.clauses ?? [])];
      for (const c of constraints) {
        if (c && c.type === 'where' && c.field) {
          clauses.push({ field: c.field, value: c.value });
        }
      }
      return { path: base.path, clauses };
    },
  ),
  where: vi.fn((field: string, _op: string, value: unknown) => ({
    type: 'where',
    field,
    value,
  })),
  orderBy: vi.fn(() => ({ type: 'orderBy' })),
  limit: vi.fn(() => ({ type: 'limit' })),
  startAfter: vi.fn(() => ({ type: 'startAfter' })),
}));

vi.mock('@/shared/lib/firebase', () => ({
  db: {},
}));

vi.mock('@/shared/lib/devMetrics', () => ({
  trackFirestoreRead: vi.fn(),
  trackFirestoreWrite: vi.fn(),
}));

vi.mock('@/shared/lib/post-reads-client', () => ({
  readPostRecords: vi.fn(),
}));

import {
  acceptGroupJoinRequest,
  addGroupMember,
  joinGroupWithSync,
  sendGroupJoinRequest,
} from '@/shared/lib/firestore/groups';

describe('groups firestore client helpers', () => {
  beforeEach(() => {
    docs.clear();
    getDocPaths.length = 0;
    batchSets.length = 0;
    batchUpdates.length = 0;
    batchCommitMock.mockClear();
    setDocMock.mockClear();
  });

  it('joinGroupWithSync is idempotent and does not overwrite existing joinedAt docs', async () => {
    docs.set('groups/g1/members/u1', {
      uid: 'u1',
      groupId: 'g1',
      role: 'member',
      joinedAt: 'ORIG',
    });
    docs.set('users/u1/memberships/g1', { groupId: 'g1', joinedAt: 'ORIG' });

    await joinGroupWithSync('g1', 'u1');

    expect(batchCommitMock).not.toHaveBeenCalled();
    expect(batchSets).toEqual([]);
  });

  it('addGroupMember does not mutate group memberCount from client', async () => {
    docs.set('groups/g1', { ownerId: 'owner', memberCount: 1 });

    await addGroupMember('g1', 'u2', 'member');

    expect(batchSets.map((entry) => entry.path)).toEqual([
      'groups/g1/members/u2',
      'users/u2/memberships/g1',
    ]);
    expect(batchUpdates).toEqual([]);

    // Re-running when already present is a no-op.
    batchSets.length = 0;
    batchCommitMock.mockClear();
    await addGroupMember('g1', 'u2', 'member');
    expect(batchCommitMock).not.toHaveBeenCalled();
  });

  it('sendGroupJoinRequest allows re-applying after leaving despite prior accepted request', async () => {
    docs.set('group_requests/old_accepted', {
      groupId: 'g1',
      fromUid: 'u2',
      toUid: 'owner',
      status: 'accepted',
    });

    const reqId = await sendGroupJoinRequest({
      groupId: 'g1',
      groupName: 'Grupo Privado',
      fromUid: 'u2',
      toUid: 'owner',
      message: '  Hola de nuevo  ',
      fromUserName: '  ',
      fromUserPhoto: `https://example.com/${'a'.repeat(700)}`,
    });

    expect(reqId).toBeTruthy();
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const written = setDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(written.status).toBe('pending');
    expect(written.message).toBe('Hola de nuevo');
    expect(written.fromUserName).toBeNull();
    expect(written.fromUserPhoto).toBeNull();

    // Now attempting again while pending fails.
    await expect(
      sendGroupJoinRequest({
        groupId: 'g1',
        groupName: 'Grupo Privado',
        fromUid: 'u2',
        toUid: 'owner',
        message: null,
        fromUserName: 'Bob',
        fromUserPhoto: null,
      }),
    ).rejects.toThrow('Ya enviaste una solicitud para este grupo.');
  });

  it('sendGroupJoinRequest blocks existing members and self requests', async () => {
    await expect(
      sendGroupJoinRequest({
        groupId: 'g1',
        groupName: 'Grupo Privado',
        fromUid: 'owner',
        toUid: 'owner',
        message: null,
        fromUserName: 'Owner',
        fromUserPhoto: null,
      }),
    ).rejects.toThrow('No puedes solicitar unirte a tu propio grupo.');

    docs.set('groups/g1/members/u2', { uid: 'u2', groupId: 'g1', role: 'member' });
    await expect(
      sendGroupJoinRequest({
        groupId: 'g1',
        groupName: 'Grupo Privado',
        fromUid: 'u2',
        toUid: 'owner',
        message: null,
        fromUserName: 'Bob',
        fromUserPhoto: null,
      }),
    ).rejects.toThrow('Ya eres miembro de este grupo.');
  });

  it('acceptGroupJoinRequest checks only readable member doc and creates member + membership together', async () => {
    docs.set('group_requests/r1', {
      groupId: 'g_missing',
      fromUid: 'u2',
      toUid: 'owner',
      status: 'pending',
    });

    await expect(acceptGroupJoinRequest('r1')).rejects.toThrow('Grupo no encontrado');

    docs.set('groups/g1', { ownerId: 'owner', visibility: 'private' });
    docs.set('group_requests/r2', {
      groupId: 'g1',
      fromUid: 'u2',
      toUid: 'owner',
      status: 'pending',
    });

    await acceptGroupJoinRequest('r2');
    expect(getDocPaths).not.toContain('users/u2/memberships/g1');
    expect(batchUpdates).toHaveLength(1);
    expect(batchSets.map((entry) => entry.path)).toEqual([
      'groups/g1/members/u2',
      'users/u2/memberships/g1',
    ]);

    // When already a member, accepting only updates the request status without rewriting member docs.
    batchSets.length = 0;
    batchUpdates.length = 0;
    docs.set('group_requests/r3', {
      groupId: 'g1',
      fromUid: 'u2',
      toUid: 'owner',
      status: 'pending',
    });
    await acceptGroupJoinRequest('r3');
    expect(batchUpdates).toHaveLength(1);
    expect(batchSets).toEqual([]);
  });
});
