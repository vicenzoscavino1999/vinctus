import type { getStorage } from 'firebase-admin/storage';
import { storagePrefix } from './firestoreContract';

type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

const isValidSegment = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && !value.includes('/');

/**
 * Returns the owned Storage folder prefix (`stories/{ownerId}/{storyId}/`)
 * and ignores any external or cross-user paths.
 */
export function getOwnedStoryStoragePrefix(
  storyId: string,
  data: Record<string, unknown>,
): string | null {
  if (!isValidSegment(storyId) || !isValidSegment(data.ownerId)) {
    return null;
  }

  return storagePrefix('storyOriginal', { userId: data.ownerId, storyId });
}

/**
 * Deletes Storage files left behind when a story document is deleted manually,
 * by moderation, or by Firestore TTL expiration.
 */
export async function cleanupDeletedStoryMedia(
  bucket: Bucket,
  storyId: string,
  data: Record<string, unknown>,
): Promise<number> {
  const prefix = getOwnedStoryStoragePrefix(storyId, data);
  if (!prefix) {
    return 0;
  }

  const [files] = await bucket.getFiles({ prefix, versions: true });
  await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
  return files.length;
}
