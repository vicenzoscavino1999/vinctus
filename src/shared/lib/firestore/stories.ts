import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
  type FieldValue,
} from 'firebase/firestore';
import {
  collection as collectionLite,
  getDocs as getDocsLite,
  orderBy as orderByLite,
  query as queryLite,
  Timestamp as TimestampLite,
  where as whereLite,
} from 'firebase/firestore/lite';
import { db, dbLite } from '@/shared/lib/firebase';
import { toDate as toDateValue } from '@/shared/lib/formatUtils';
import { STORY_DURATION_MS } from '@/shared/lib/storyConstants';
import { COLLECTIONS, LIMITS } from '@/shared/lib/firestore/firestoreContract';
import { deleteStoryFiles } from '@/shared/lib/storage';
const storiesCollection = collection(db, COLLECTIONS.stories);

export type StoryVisibility = 'friends';

export type StoryMediaType = 'image' | 'video';

export interface StoryOwnerSnapshot {
  displayName: string | null;
  photoURL: string | null;
}

export interface StoryRead {
  id: string;
  ownerId: string;
  ownerSnapshot: StoryOwnerSnapshot;
  mediaType: StoryMediaType;
  mediaUrl: string;
  mediaPath: string;
  thumbUrl: string | null;
  thumbPath: string | null;
  visibility: StoryVisibility;
  createdAt: Date;
  expiresAt: Date;
}

export interface StoryWrite {
  ownerId: string;
  ownerSnapshot: StoryOwnerSnapshot;
  mediaType: StoryMediaType;
  mediaUrl: string;
  mediaPath: string;
  thumbUrl: string | null;
  thumbPath: string | null;
  visibility: StoryVisibility;
  createdAt: FieldValue;
  expiresAt: Timestamp;
}

export interface CreateStoryInput {
  storyId?: string;
  ownerId: string;
  ownerName: string | null;
  ownerPhoto: string | null;
  mediaType: StoryMediaType;
  mediaUrl: string;
  mediaPath: string;
  thumbUrl?: string | null;
  thumbPath?: string | null;
  visibility?: StoryVisibility;
}

const buildStoryRead = (id: string, data: Record<string, unknown>): StoryRead => {
  const ownerSnapshot = (data.ownerSnapshot ?? {}) as Partial<StoryOwnerSnapshot>;
  return {
    id,
    ownerId: (data.ownerId as string) ?? '',
    ownerSnapshot: {
      displayName: typeof ownerSnapshot.displayName === 'string' ? ownerSnapshot.displayName : null,
      photoURL: typeof ownerSnapshot.photoURL === 'string' ? ownerSnapshot.photoURL : null,
    },
    mediaType: (data.mediaType as StoryMediaType) ?? 'image',
    mediaUrl: (data.mediaUrl as string) ?? '',
    mediaPath: (data.mediaPath as string) ?? '',
    thumbUrl: (data.thumbUrl as string) ?? null,
    thumbPath: (data.thumbPath as string) ?? null,
    visibility: (data.visibility as StoryVisibility) ?? 'friends',
    createdAt: toDateValue(data.createdAt) || new Date(0),
    expiresAt: toDateValue(data.expiresAt) || new Date(0),
  };
};

export function sanitizeStoryOwnerName(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, LIMITS.stories.ownerNameMaxLength);
}

export function sanitizeStoryOwnerPhoto(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > LIMITS.stories.photoURLMaxLength) return null;
  return trimmed.startsWith('https://') || trimmed.startsWith('http://') ? trimmed : null;
}

export async function createStory(input: CreateStoryInput): Promise<string> {
  const storyRef = input.storyId ? doc(storiesCollection, input.storyId) : doc(storiesCollection);
  const expiresAt = Timestamp.fromMillis(Date.now() + STORY_DURATION_MS);
  await setDoc(
    storyRef,
    {
      ownerId: input.ownerId,
      ownerSnapshot: {
        displayName: sanitizeStoryOwnerName(input.ownerName),
        photoURL: sanitizeStoryOwnerPhoto(input.ownerPhoto),
      },
      mediaType: input.mediaType,
      mediaUrl: input.mediaUrl,
      mediaPath: input.mediaPath,
      thumbUrl: input.thumbUrl ?? null,
      thumbPath: input.thumbPath ?? null,
      visibility: input.visibility ?? 'friends',
      createdAt: serverTimestamp(),
      expiresAt,
    } as StoryWrite,
    { merge: false },
  );
  return storyRef.id;
}

export async function deleteStory(
  storyId: string,
  mediaPaths?: { mediaPath?: string | null; thumbPath?: string | null },
): Promise<void> {
  await deleteDoc(doc(storiesCollection, storyId));
  await deleteStoryFiles([mediaPaths?.mediaPath, mediaPaths?.thumbPath]).catch(() => undefined);
}

export function getNewStoryId(): string {
  return doc(storiesCollection).id;
}

export async function getUserStories(uid: string): Promise<StoryRead[]> {
  const now = TimestampLite.now();
  const q = queryLite(
    collectionLite(dbLite, COLLECTIONS.stories),
    whereLite('ownerId', '==', uid),
    whereLite('visibility', '==', 'friends'),
    whereLite('expiresAt', '>', now),
    orderByLite('expiresAt', 'desc'),
  );

  const snapshot = await getDocsLite(q);

  return snapshot.docs.map((docSnap) => buildStoryRead(docSnap.id, docSnap.data()));
}

/** How many single-owner story queries run at the same time. */
export const STORY_QUERY_CONCURRENCY = 8;

/**
 * Stories of several people, one query per owner.
 *
 * The `stories` read rule checks, for each owner, blocking (2 documents) and friendship or
 * following (up to 4 more), and a query may only touch a few documents in its rules. A query
 * with `ownerId in [...]` checks every owner in it, so with 4 or more owners Firestore rejects
 * the whole query (permission-denied), which happened to anyone following 4+ people. One owner
 * per query always fits. It throws only when every query failed; a failure for some owners just
 * leaves their stories out.
 */
export async function getStoriesForOwners(ownerIds: string[]): Promise<StoryRead[]> {
  const uniqueIds = Array.from(new Set(ownerIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const merged = new Map<string, StoryRead>();
  let failures = 0;
  let firstError: unknown = null;

  for (let start = 0; start < uniqueIds.length; start += STORY_QUERY_CONCURRENCY) {
    const batch = uniqueIds.slice(start, start + STORY_QUERY_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((ownerId) => getUserStories(ownerId)));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        result.value.forEach((story) => merged.set(story.id, story));
        return;
      }
      failures += 1;
      firstError ??= result.reason;
      console.warn('[getStoriesForOwners] could not read stories of', batch[index], result.reason);
    });
  }

  if (failures === uniqueIds.length && firstError) {
    throw firstError;
  }

  return Array.from(merged.values()).sort((a, b) => {
    const aTime = a.createdAt?.getTime?.() ?? 0;
    const bTime = b.createdAt?.getTime?.() ?? 0;
    return bTime - aTime;
  });
}
