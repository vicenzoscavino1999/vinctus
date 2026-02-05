import {
  collection,
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

const STORY_DURATION_MS = 24 * 60 * 60 * 1000;

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
};

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
    createdAt: toDate(data.createdAt) || new Date(0),
    expiresAt: toDate(data.expiresAt) || new Date(0),
  };
};

export async function createStory(input: CreateStoryInput): Promise<string> {
  const storyRef = input.storyId
    ? doc(db, 'stories', input.storyId)
    : doc(collection(db, 'stories'));
  const expiresAt = Timestamp.fromMillis(Date.now() + STORY_DURATION_MS);
  await setDoc(
    storyRef,
    {
      ownerId: input.ownerId,
      ownerSnapshot: {
        displayName: input.ownerName ?? null,
        photoURL: input.ownerPhoto ?? null,
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

export async function getUserStories(uid: string): Promise<StoryRead[]> {
  const now = TimestampLite.now();
  const q = queryLite(
    collectionLite(dbLite, 'stories'),
    whereLite('ownerId', '==', uid),
    whereLite('visibility', '==', 'friends'),
    whereLite('expiresAt', '>', now),
    orderByLite('expiresAt', 'desc'),
  );

  const snapshot = await getDocsLite(q);
  console.log(`[getUserStories] loaded ${snapshot.docs.length} stories for uid ${uid}`);

  return snapshot.docs.map((docSnap) => buildStoryRead(docSnap.id, docSnap.data()));
}

export async function getStoriesForOwners(ownerIds: string[]): Promise<StoryRead[]> {
  const uniqueIds = Array.from(new Set(ownerIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const now = TimestampLite.now();
  const chunkSize = 10;
  const chunks: string[][] = [];
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    chunks.push(uniqueIds.slice(i, i + chunkSize));
  }

  const results = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const q = queryLite(
        collectionLite(dbLite, 'stories'),
        whereLite('ownerId', 'in', chunk),
        whereLite('visibility', '==', 'friends'),
        whereLite('expiresAt', '>', now),
        orderByLite('expiresAt', 'desc'),
      );
      const snapshot = await getDocsLite(q);
      console.log(
        `[getStoriesForOwners] chunk query returned ${snapshot.docs.length} stories for owners:`,
        chunk,
      );
      return snapshot.docs.map((docSnap) => buildStoryRead(docSnap.id, docSnap.data()));
    }),
  );

  const merged = new Map<string, StoryRead>();
  let hadFailure = false;
  let firstError: unknown = null;

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status === 'fulfilled') {
      result.value.forEach((story) => merged.set(story.id, story));
      continue;
    }

    hadFailure = true;
    if (!firstError) {
      firstError = result.reason;
    }
    const chunk = chunks[index] ?? [];
    for (const ownerId of chunk) {
      try {
        const fallbackStories = await getUserStories(ownerId);
        fallbackStories.forEach((story) => merged.set(story.id, story));
      } catch (fallbackError) {
        if (!firstError) {
          firstError = fallbackError;
        }
        console.warn('[getStoriesForOwners] fallback failed for owner', ownerId, fallbackError);
      }
    }
  }

  const stories = Array.from(merged.values()).sort((a, b) => {
    const aTime = a.createdAt?.getTime?.() ?? 0;
    const bTime = b.createdAt?.getTime?.() ?? 0;
    return bTime - aTime;
  });

  if (stories.length === 0 && hadFailure && firstError) {
    throw firstError;
  }

  return stories;
}
