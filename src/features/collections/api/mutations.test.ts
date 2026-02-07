import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import {
  createCollection,
  createCollectionItem,
  deleteCollectionItem,
} from '@/features/collections/api/mutations';

vi.mock('@/shared/lib/firestore', () => ({
  createCollection: vi.fn(),
  createCollectionItem: vi.fn(),
  deleteCollectionItem: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

describe('collections api mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates and normalizes collection creation payload', async () => {
    vi.mocked(firestore.createCollection).mockResolvedValueOnce('collection_1');

    await expect(
      createCollection('user_1', { name: '  Lecturas  ', icon: '  folder  ' }),
    ).resolves.toBe('collection_1');
    expect(firestore.createCollection).toHaveBeenCalledWith('user_1', {
      name: 'Lecturas',
      icon: 'folder',
    });
  });

  it('normalizes collection item payload before write', async () => {
    vi.mocked(firestore.createCollectionItem).mockResolvedValueOnce('item_1');

    await expect(
      createCollectionItem('user_1', 'collection_1', {
        collectionName: '  Ciencia  ',
        type: 'note',
        title: '  Idea  ',
        text: '  ',
        url: null,
      }),
    ).resolves.toBe('item_1');

    expect(firestore.createCollectionItem).toHaveBeenCalledWith('user_1', 'collection_1', {
      collectionName: 'Ciencia',
      type: 'note',
      title: 'Idea',
      url: null,
      text: null,
      fileName: undefined,
      fileSize: null,
      contentType: undefined,
      storagePath: undefined,
    });
  });

  it('retries transient deletion failures', async () => {
    vi.mocked(firestore.deleteCollectionItem)
      .mockRejectedValueOnce({ code: 'network-request-failed', message: 'offline' })
      .mockResolvedValueOnce();

    await expect(deleteCollectionItem('user_1', 'collection_1', 'item_1')).resolves.toBeUndefined();
    expect(firestore.deleteCollectionItem).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid identifiers before writes', async () => {
    const task = deleteCollectionItem('', 'collection_1', 'item_1');
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.deleteCollectionItem).not.toHaveBeenCalled();
  });
});
