import { describe, expect, it, vi } from 'vitest';
import {
  cleanupDeletedCollection,
  cleanupDeletedCollectionItemMedia,
  getOwnedCollectionStoragePrefix,
  isOwnedCollectionStoragePath,
  reconcileCollectionItemCount,
} from './collectionCleanup';

describe('collectionCleanup', () => {
  it('validates owned collection prefixes and storage paths strictly', () => {
    expect(getOwnedCollectionStoragePrefix('alice', 'col_1')).toBe('collections/alice/col_1/');
    expect(getOwnedCollectionStoragePrefix('alice/bad', 'col_1')).toBeNull();

    expect(
      isOwnedCollectionStoragePath('alice', 'col_1', 'collections/alice/col_1/item_1/doc.pdf'),
    ).toBe(true);
    expect(
      isOwnedCollectionStoragePath('alice', 'col_1', 'collections/bob/col_1/item_1/doc.pdf'),
    ).toBe(false);
    expect(
      isOwnedCollectionStoragePath('alice', 'col_1', 'collections/alice/col_2/item_1/doc.pdf'),
    ).toBe(false);
    expect(
      isOwnedCollectionStoragePath('alice', 'col_1', 'collections/alice/col_1/../col_2/doc.pdf'),
    ).toBe(false);
    expect(
      isOwnedCollectionStoragePath('alice', 'col_1', 'collections/alice/col_1/only_one_segment'),
    ).toBe(false);
  });

  it('deletes owned item storage media and ignores foreign paths', async () => {
    const deleteFile = vi.fn(async () => undefined);
    const bucket = {
      file: vi.fn(() => ({ delete: deleteFile })),
    };

    await expect(
      cleanupDeletedCollectionItemMedia(bucket as never, 'alice', 'col_1', {
        storagePath: 'collections/alice/col_1/item_1/paper.pdf',
      }),
    ).resolves.toBe(true);
    expect(bucket.file).toHaveBeenCalledWith('collections/alice/col_1/item_1/paper.pdf');
    expect(deleteFile).toHaveBeenCalledWith({ ignoreNotFound: true });

    bucket.file.mockClear();
    await expect(
      cleanupDeletedCollectionItemMedia(bucket as never, 'alice', 'col_1', {
        storagePath: 'collections/victim/col_1/item_1/secret.pdf',
      }),
    ).resolves.toBe(false);
    expect(bucket.file).not.toHaveBeenCalled();
  });

  it('deletes subcollection items in batches and removes owned Storage versions', async () => {
    const batchDelete = vi.fn();
    const batchCommit = vi.fn(async () => undefined);
    const itemRefs = [{ id: 'i1' }, { id: 'i2' }];
    const getItems = vi.fn().mockResolvedValueOnce({
      empty: false,
      size: 2,
      docs: itemRefs.map((ref) => ({ ref })),
    });
    const db = {
      collection: vi.fn(() => ({ limit: vi.fn(() => ({ get: getItems })) })),
      batch: vi.fn(() => ({ delete: batchDelete, commit: batchCommit })),
    };
    const deleteStorageFile = vi.fn(async () => undefined);
    const bucket = {
      getFiles: vi.fn(async () => [[{ delete: deleteStorageFile }, { delete: deleteStorageFile }]]),
    };

    const result = await cleanupDeletedCollection(db as never, bucket as never, 'alice', 'col_1');

    expect(result).toEqual({ itemsDeleted: 2, filesDeleted: 2 });
    expect(batchDelete).toHaveBeenCalledTimes(2);
    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(bucket.getFiles).toHaveBeenCalledWith({
      prefix: 'collections/alice/col_1/',
      versions: true,
    });
    expect(deleteStorageFile).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it('reconciles itemCount from subcollection count and skips deleted collections', async () => {
    const update = vi.fn();
    const makeDb = (exists: boolean, currentCount: number, actualCount: number) => {
      const countQuery = { count: () => ({ __count: true }) };
      const collectionRef = {
        collection: () => countQuery,
      };
      return {
        collection: () => ({
          doc: () => ({
            collection: () => ({
              doc: () => collectionRef,
            }),
          }),
        }),
        runTransaction: async (fn: (tx: unknown) => Promise<void>) => {
          const tx = {
            get: vi.fn(async (target: { __count?: boolean }) =>
              target.__count
                ? { data: () => ({ count: actualCount }) }
                : { exists, data: () => ({ itemCount: currentCount }) },
            ),
            update,
          };
          await fn(tx);
        },
      };
    };

    await reconcileCollectionItemCount(makeDb(false, 2, 0) as never, 'alice', 'col_1');
    expect(update).not.toHaveBeenCalled();

    await reconcileCollectionItemCount(makeDb(true, 5, 2) as never, 'alice', 'col_1');
    expect(update).toHaveBeenCalledWith(expect.anything(), { itemCount: 2 });
  });
});
