import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import {
  createCollection,
  createCollectionItem,
  deleteCollection,
  deleteCollectionItem,
  updateCollection,
} from '@/features/collections/api/mutations';

vi.mock('@/shared/lib/firestore', () => ({
  createCollection: vi.fn(),
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
  createCollectionItem: vi.fn(),
  deleteCollectionItem: vi.fn(),
}));

vi.mock('@/shared/lib/storage', () => ({
  deleteCollectionFile: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');
const storage = await import('@/shared/lib/storage');

describe('collections api mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates, normalizes, and reuses stable id across retries when creating a collection', async () => {
    vi.mocked(firestore.createCollection)
      .mockRejectedValueOnce({ code: 'unavailable', message: 'retry' })
      .mockResolvedValueOnce('collection_1');

    await expect(
      createCollection('user_1', { name: '  Lecturas  ', icon: '  folder  ' }),
    ).resolves.toBe('collection_1');

    expect(firestore.createCollection).toHaveBeenCalledTimes(2);
    const firstId = vi.mocked(firestore.createCollection).mock.calls[0]?.[2];
    const secondId = vi.mocked(firestore.createCollection).mock.calls[1]?.[2];
    expect(typeof firstId).toBe('string');
    expect(firstId).toBe(secondId);
    expect(firestore.createCollection).toHaveBeenCalledWith(
      'user_1',
      { name: 'Lecturas', icon: 'folder' },
      firstId,
    );
  });

  it('validates and updates collection metadata', async () => {
    vi.mocked(firestore.updateCollection).mockResolvedValueOnce();

    await expect(
      updateCollection('user_1', 'col_1', { name: '  Música 2026  ', icon: 'music' }),
    ).resolves.toBeUndefined();
    expect(firestore.updateCollection).toHaveBeenCalledWith('user_1', 'col_1', {
      name: 'Música 2026',
      icon: 'music',
    });
  });

  it('deletes a collection and cleans up returned storage files best-effort', async () => {
    vi.mocked(firestore.deleteCollection).mockResolvedValueOnce([
      'collections/user_1/col_1/i1/a.pdf',
      'collections/user_1/col_1/i2/b.pdf',
    ]);
    vi.mocked(storage.deleteCollectionFile)
      .mockRejectedValueOnce(new Error('storage blip'))
      .mockResolvedValueOnce();

    await expect(deleteCollection('user_1', 'col_1')).resolves.toBeUndefined();
    expect(firestore.deleteCollection).toHaveBeenCalledWith('user_1', 'col_1');
    expect(storage.deleteCollectionFile).toHaveBeenCalledWith('collections/user_1/col_1/i1/a.pdf');
    expect(storage.deleteCollectionFile).toHaveBeenCalledWith('collections/user_1/col_1/i2/b.pdf');
  });

  it('normalizes valid note, link, and file collection items and rejects invalid schemes', async () => {
    vi.mocked(firestore.createCollectionItem).mockResolvedValueOnce('item_1');

    await expect(
      createCollectionItem('user_1', 'collection_1', {
        itemId: 'item_1',
        collectionName: '  Ciencia  ',
        type: 'note',
        title: '  Idea  ',
        text: '  Resumen clave  ',
        url: null,
      }),
    ).resolves.toBe('item_1');

    expect(firestore.createCollectionItem).toHaveBeenCalledWith('user_1', 'collection_1', {
      itemId: 'item_1',
      collectionName: 'Ciencia',
      type: 'note',
      title: 'Idea',
      url: null,
      text: 'Resumen clave',
      fileName: undefined,
      fileSize: null,
      contentType: undefined,
      storagePath: undefined,
    });

    await expect(
      createCollectionItem('user_1', 'collection_1', {
        collectionName: 'Ciencia',
        type: 'link',
        title: 'Inseguro',
        url: 'javascript:alert(1)',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await expect(
      createCollectionItem('user_1', 'collection_1', {
        collectionName: 'Ciencia',
        type: 'note',
        title: 'Vacía',
        text: '   ',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
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
