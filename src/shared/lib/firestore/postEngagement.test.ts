import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runTransaction } from 'firebase/firestore';
import { addPostComment } from './postEngagement';
import { getPost } from './posts';

vi.mock('./posts', () => ({ getPost: vi.fn() }));
vi.mock('./profile', () => ({ getUserProfile: vi.fn() }));
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: vi.fn((...path) => ({ path: path.slice(1).join('/') })),
  doc: vi.fn((_collection, id) => ({ id })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => 'server-time'),
}));

describe('idempotent comment writes', () => {
  const documents = new Map<string, Record<string, unknown>>();
  const set = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    documents.clear();
    vi.mocked(getPost).mockResolvedValue(null);
    vi.mocked(runTransaction).mockImplementation(async (_db, update) => {
      const transaction = {
        get: async (ref: { id: string }) => ({
          exists: () => documents.has(ref.id),
          data: () => documents.get(ref.id),
        }),
        set: (ref: { id: string }, data: Record<string, unknown>) => {
          set(ref.id, data);
          documents.set(ref.id, data);
        },
      };
      return update(transaction as unknown as Parameters<typeof update>[0]);
    });
  });

  it('a repeated operation creates only one comment and leaves its timestamp unchanged', async () => {
    const author = { displayName: 'Ana', photoURL: null };
    await addPostComment('p1', 'ana', author, 'Hola', 'c1');
    const first = documents.get('c1');
    await addPostComment('p1', 'ana', author, 'Hola', 'c1');
    expect(set).toHaveBeenCalledTimes(1);
    expect(documents.get('c1')).toBe(first);
    expect(getPost).toHaveBeenCalledTimes(1);
  });

  it('rejects retries that change the author or the text', async () => {
    const author = { displayName: 'Ana', photoURL: null };
    await addPostComment('p1', 'ana', author, 'Hola', 'c1');
    await expect(addPostComment('p1', 'bruno', author, 'Hola', 'c1')).rejects.toThrow(
      'no coincide',
    );
    await expect(addPostComment('p1', 'ana', author, 'Otro', 'c1')).rejects.toThrow('no coincide');
    expect(set).toHaveBeenCalledTimes(1);
    expect(documents.get('c1')?.text).toBe('Hola');
  });
});
