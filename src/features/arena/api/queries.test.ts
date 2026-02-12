import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getArenaPersonas,
  getArenaUsage,
  getPublicArenaDebates,
  getSavedArenaDebates,
  isArenaDebateLiked,
  isArenaDebateSaved,
  subscribeToDebate,
  subscribeToTurns,
} from '@/features/arena/api/queries';

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@/shared/lib/firebase', () => ({
  db: { app: 'test-db' },
  functions: { app: 'test-functions' },
}));

vi.mock('@/shared/lib/firestore', () => ({
  isArenaDebateLiked: vi.fn(),
  getSavedArenaDebates: vi.fn(),
  isArenaDebateSaved: vi.fn(),
}));

const firebaseFunctions = await import('firebase/functions');
const firebaseFirestore = await import('firebase/firestore');
const firestore = await import('@/shared/lib/firestore');

describe('arena api queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribes to a debate and maps existing snapshots', () => {
    const unsubscribe = vi.fn();
    vi.mocked(firebaseFirestore.doc).mockReturnValueOnce({ ref: 'debate-ref' } as never);
    vi.mocked(firebaseFirestore.onSnapshot).mockImplementationOnce((...args: unknown[]) => {
      const onNext = args[1] as (snapshot: unknown) => void;
      onNext({
        exists: () => true,
        id: 'debate_1',
        data: () => ({ topic: 'Tema' }),
      } as never);
      return unsubscribe;
    });

    const callback = vi.fn();
    const returnedUnsubscribe = subscribeToDebate('debate_1', callback);

    expect(callback).toHaveBeenCalledWith({ id: 'debate_1', topic: 'Tema' });
    expect(returnedUnsubscribe).toBe(unsubscribe);
  });

  it('subscribes to a debate and returns null for missing or error snapshots', () => {
    vi.mocked(firebaseFirestore.doc).mockReturnValue({ ref: 'debate-ref' } as never);
    vi.mocked(firebaseFirestore.onSnapshot)
      .mockImplementationOnce((...args: unknown[]) => {
        const onNext = args[1] as (snapshot: unknown) => void;
        onNext({
          exists: () => false,
        } as never);
        return vi.fn();
      })
      .mockImplementationOnce((...args: unknown[]) => {
        const onError = args[2] as (error: unknown) => void;
        onError(new Error('boom'));
        return vi.fn();
      });

    const callback = vi.fn();
    subscribeToDebate('debate_1', callback);
    subscribeToDebate('debate_1', callback);

    expect(callback).toHaveBeenNthCalledWith(1, null);
    expect(callback).toHaveBeenNthCalledWith(2, null);
  });

  it('subscribes to turns and maps docs or returns [] on error', () => {
    vi.mocked(firebaseFirestore.collection).mockReturnValue({ ref: 'turns-ref' } as never);
    vi.mocked(firebaseFirestore.orderBy).mockReturnValue({ op: 'orderBy' } as never);
    vi.mocked(firebaseFirestore.query).mockReturnValue({ ref: 'turns-query' } as never);
    vi.mocked(firebaseFirestore.onSnapshot)
      .mockImplementationOnce((...args: unknown[]) => {
        const onNext = args[1] as (snapshot: unknown) => void;
        onNext({
          docs: [
            { id: 't1', data: () => ({ idx: 1, text: 'hola' }) },
            { id: 't2', data: () => ({ idx: 2, text: 'mundo' }) },
          ],
        } as never);
        return vi.fn();
      })
      .mockImplementationOnce((...args: unknown[]) => {
        const onError = args[2] as (error: unknown) => void;
        onError(new Error('boom'));
        return vi.fn();
      });

    const callback = vi.fn();
    subscribeToTurns('debate_1', callback);
    subscribeToTurns('debate_1', callback);

    expect(callback).toHaveBeenNthCalledWith(1, [
      { id: 't1', idx: 1, text: 'hola' },
      { id: 't2', idx: 2, text: 'mundo' },
    ]);
    expect(callback).toHaveBeenNthCalledWith(2, []);
  });

  it('loads usage and personas from callable functions', async () => {
    const usageCallable = vi.fn().mockResolvedValueOnce({
      data: { used: 1, limit: 10, remaining: 9 },
    });
    const personasCallable = vi.fn().mockResolvedValueOnce({
      data: [{ id: 'scientist', name: 'Scientist' }],
    });

    vi.mocked(firebaseFunctions.httpsCallable).mockImplementation((_, name) => {
      if (name === 'getArenaUsage') return usageCallable as never;
      if (name === 'getArenaPersonas') return personasCallable as never;
      throw new Error(`Unexpected callable: ${name as string}`);
    });

    await expect(getArenaUsage()).resolves.toEqual({ used: 1, limit: 10, remaining: 9 });
    await expect(getArenaPersonas()).resolves.toEqual([{ id: 'scientist', name: 'Scientist' }]);
  });

  it('loads public debates with sanitized limits and mapped docs', async () => {
    vi.mocked(firebaseFirestore.collection).mockReturnValue({ ref: 'arena-ref' } as never);
    vi.mocked(firebaseFirestore.where).mockReturnValue({ op: 'where' } as never);
    vi.mocked(firebaseFirestore.limit).mockReturnValue({ op: 'limit' } as never);
    vi.mocked(firebaseFirestore.query).mockReturnValue({ ref: 'query-ref' } as never);
    vi.mocked(firebaseFirestore.getDocs).mockResolvedValue({
      docs: [{ id: 'debate_1', data: () => ({ topic: 'Tema', visibility: 'public' }) }],
    } as never);

    await expect(getPublicArenaDebates(999)).resolves.toEqual([
      { id: 'debate_1', topic: 'Tema', visibility: 'public' },
    ]);
    expect(firebaseFirestore.limit).toHaveBeenCalledWith(80);

    await expect(getPublicArenaDebates(Number.NaN)).resolves.toHaveLength(1);
    expect(firebaseFirestore.limit).toHaveBeenLastCalledWith(60);
  });

  it('returns false on saved/liked checks when ids are blank', async () => {
    await expect(isArenaDebateSaved(' ', 'user_1')).resolves.toBe(false);
    await expect(isArenaDebateSaved('debate_1', ' ')).resolves.toBe(false);
    await expect(isArenaDebateLiked(' ', 'user_1')).resolves.toBe(false);
    await expect(isArenaDebateLiked('debate_1', ' ')).resolves.toBe(false);
    expect(firestore.isArenaDebateSaved).not.toHaveBeenCalled();
    expect(firestore.isArenaDebateLiked).not.toHaveBeenCalled();
  });

  it('forwards saved/liked checks with trimmed ids', async () => {
    vi.mocked(firestore.isArenaDebateSaved).mockResolvedValueOnce(true);
    vi.mocked(firestore.isArenaDebateLiked).mockResolvedValueOnce(true);

    await expect(isArenaDebateSaved(' debate_1 ', ' user_1 ')).resolves.toBe(true);
    await expect(isArenaDebateLiked(' debate_1 ', ' user_1 ')).resolves.toBe(true);

    expect(firestore.isArenaDebateSaved).toHaveBeenCalledWith('debate_1', 'user_1');
    expect(firestore.isArenaDebateLiked).toHaveBeenCalledWith('debate_1', 'user_1');
  });

  it('returns [] when uid is blank and clamps saved debates limit', async () => {
    await expect(getSavedArenaDebates('   ', 20)).resolves.toEqual([]);
    expect(firestore.getSavedArenaDebates).not.toHaveBeenCalled();

    vi.mocked(firestore.getSavedArenaDebates).mockResolvedValueOnce([
      { debateId: 'd1', topic: 'Tema' },
    ] as never);

    await expect(getSavedArenaDebates(' user_1 ', 999)).resolves.toEqual([
      { debateId: 'd1', topic: 'Tema' },
    ]);
    expect(firestore.getSavedArenaDebates).toHaveBeenCalledWith('user_1', 50);
  });
});
