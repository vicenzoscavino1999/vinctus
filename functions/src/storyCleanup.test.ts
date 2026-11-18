import { describe, expect, it, vi } from 'vitest';
import { cleanupDeletedStoryMedia, getOwnedStoryStoragePrefix } from './storyCleanup';

describe('storyCleanup', () => {
  it('computes only the owned story prefix regardless of spoofed fields', () => {
    const prefix = getOwnedStoryStoragePrefix('story_1', {
      ownerId: 'alice',
      mediaPath: 'stories/victim/other/original/secret.jpg',
      thumbPath: 'posts/victim/p1/images/avatar.jpg',
    });

    expect(prefix).toBe('stories/alice/story_1/');
  });

  it('deletes all versions under the owned story prefix', async () => {
    const deleteFile = vi.fn(async () => undefined);
    const bucket = {
      getFiles: vi.fn(async ({ prefix }: { prefix: string }) => {
        if (prefix === 'stories/alice/story_1/') {
          return [[{ delete: deleteFile }, { delete: deleteFile }]];
        }
        return [[]];
      }),
    };

    const deleted = await cleanupDeletedStoryMedia(bucket as never, 'story_1', {
      ownerId: 'alice',
    });

    expect(deleted).toBe(2);
    expect(bucket.getFiles).toHaveBeenCalledWith({
      prefix: 'stories/alice/story_1/',
      versions: true,
    });
    expect(deleteFile).toHaveBeenCalledTimes(2);
    expect(deleteFile).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it('no-ops when ownerId or storyId is invalid', async () => {
    const bucket = {
      getFiles: vi.fn(),
    };

    await expect(
      cleanupDeletedStoryMedia(bucket as never, 'story/nested', { ownerId: 'alice' }),
    ).resolves.toBe(0);
    await expect(
      cleanupDeletedStoryMedia(bucket as never, 'story_1', { ownerId: '' }),
    ).resolves.toBe(0);
    expect(bucket.getFiles).not.toHaveBeenCalled();
  });
});
