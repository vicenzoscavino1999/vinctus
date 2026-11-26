import { beforeEach, describe, expect, it, vi } from 'vitest';

// Each query records the owner it filters on; the test decides which owners fail.
const queriedOwners: string[][] = [];
const failingOwners = new Set<string>();
const storiesByOwner = new Map<string, Array<{ id: string; data: Record<string, unknown> }>>();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn(() => ({ path: 'stories' })),
  orderBy: vi.fn(() => ({ type: 'orderBy' })),
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  query: vi.fn((_collection: unknown, ...constraints: Array<Record<string, unknown>>) => ({
    constraints,
  })),
  getDocs: vi.fn(
    async (q: { constraints: Array<{ field?: string; op?: string; value?: unknown }> }) => {
      const owner = q.constraints.find((c) => c.field === 'ownerId');
      const owners = owner?.op === 'in' ? (owner.value as string[]) : [owner?.value as string];
      queriedOwners.push(owners);
      if (owners.some((id) => failingOwners.has(id))) {
        throw Object.assign(new Error('Missing or insufficient permissions.'), {
          code: 'permission-denied',
        });
      }
      const docs = owners.flatMap((id) => storiesByOwner.get(id) ?? []);
      return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
    },
  ),
}));

vi.mock('@/shared/lib/firebase', () => ({ db: {}, dbLite: {} }));
vi.mock('@/shared/lib/storage', () => ({ deleteStoryFiles: vi.fn() }));

const { getStoriesForOwners, STORY_QUERY_CONCURRENCY } = await import('./stories');

const story = (id: string, ownerId: string) => ({
  id,
  data: {
    ownerId,
    visibility: 'friends',
    mediaType: 'image',
    mediaUrl: 'https://example.com/a.jpg',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
  },
});

describe('getStoriesForOwners', () => {
  beforeEach(() => {
    queriedOwners.length = 0;
    failingOwners.clear();
    storiesByOwner.clear();
  });

  it('queries one owner at a time, so the read rule never exceeds its document limit', async () => {
    const owners = Array.from({ length: 12 }, (_, i) => `u${i}`);
    storiesByOwner.set('u3', [story('s3', 'u3')]);

    const stories = await getStoriesForOwners(owners);

    expect(queriedOwners).toHaveLength(12);
    expect(queriedOwners.every((ids) => ids.length === 1)).toBe(true);
    expect(stories.map((s) => s.id)).toEqual(['s3']);
    expect(STORY_QUERY_CONCURRENCY).toBeGreaterThan(1);
  });

  it('returns an empty list, without an error, when nobody has active stories', async () => {
    await expect(getStoriesForOwners(['a', 'b', 'c', 'd', 'e'])).resolves.toEqual([]);
  });

  it('leaves out the owners that fail and keeps the rest', async () => {
    failingOwners.add('b');
    storiesByOwner.set('a', [story('sa', 'a')]);

    const stories = await getStoriesForOwners(['a', 'b']);

    expect(stories.map((s) => s.id)).toEqual(['sa']);
  });

  it('throws only when every owner failed', async () => {
    failingOwners.add('a');
    failingOwners.add('b');

    await expect(getStoriesForOwners(['a', 'b'])).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});
