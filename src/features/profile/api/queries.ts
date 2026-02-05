export {
  getContributionsByCategory,
  getAccountVisibilityServer,
  getFollowList,
  getFollowStatus,
  getIncomingFollowRequests,
  getRecentUsers,
  searchUsersByDisplayName,
  subscribeToUserProfile,
  getUserContributions,
  isUserBlocked,
} from '@/shared/lib/firestore';

import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';

import { auth, db } from '@/shared/lib/firebase';
import { trackFirestoreRead } from '@/shared/lib/devMetrics';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate, z } from '@/shared/lib/validators';

import type { UserProfileRead } from './types';

const READ_TIMEOUT_MS = 5000;
const PROFILE_CACHE_TTL_MS = 60_000;
const USERS_IN_QUERY_LIMIT = 10;

type CacheScope = 'public' | 'private';
type CacheEntry = { value: UserProfileRead | null; expiresAt: number; scope: CacheScope };
const profileCache = new Map<string, CacheEntry>();

const firestoreIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !value.includes('/'), { message: 'Invalid Firestore ID' });

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return null;
};

const normalizeNullableString = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  return null;
};

const normalizeNumber = (value: unknown, fallback = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
};

const normalizeAccountVisibility = (
  privateData: unknown,
  publicData: unknown,
): 'public' | 'private' => {
  const privateRecord: Record<string, unknown> =
    typeof privateData === 'object' && privateData !== null
      ? (privateData as Record<string, unknown>)
      : {};
  const publicRecord: Record<string, unknown> =
    typeof publicData === 'object' && publicData !== null
      ? (publicData as Record<string, unknown>)
      : {};

  const settings = privateRecord.settings;
  if (typeof settings === 'object' && settings !== null) {
    const privacy = (settings as Record<string, unknown>).privacy;
    if (typeof privacy === 'object' && privacy !== null) {
      const visibility = (privacy as Record<string, unknown>).accountVisibility;
      if (visibility === 'private') return 'private';
    }
  }

  if (publicRecord.accountVisibility === 'private') return 'private';
  return 'public';
};

const buildUserProfile = (
  uid: string,
  privateData: unknown,
  publicData: unknown,
): UserProfileRead => {
  const privateRecord: Record<string, unknown> =
    typeof privateData === 'object' && privateData !== null
      ? (privateData as Record<string, unknown>)
      : {};
  const publicRecord: Record<string, unknown> =
    typeof publicData === 'object' && publicData !== null
      ? (publicData as Record<string, unknown>)
      : {};

  const displayName =
    normalizeNullableString(privateRecord.displayName) ??
    normalizeNullableString(publicRecord.displayName);
  const displayNameLowercase =
    normalizeNullableString(privateRecord.displayNameLowercase) ??
    normalizeNullableString(publicRecord.displayNameLowercase);
  const photoURL =
    normalizeNullableString(privateRecord.photoURL) ??
    normalizeNullableString(publicRecord.photoURL);

  const followersCount = normalizeNumber(
    publicRecord.followersCount,
    normalizeNumber(privateRecord.followersCount, 0),
  );
  const followingCount = normalizeNumber(
    publicRecord.followingCount,
    normalizeNumber(privateRecord.followingCount, 0),
  );
  const postsCount = normalizeNumber(
    publicRecord.postsCount,
    normalizeNumber(privateRecord.postsCount, 0),
  );
  const reputation = normalizeNumber(
    privateRecord.reputation,
    normalizeNumber(publicRecord.reputation, 0),
  );

  const karmaGlobal =
    typeof privateRecord.karmaGlobal === 'number'
      ? privateRecord.karmaGlobal
      : typeof publicRecord.karmaGlobal === 'number'
        ? publicRecord.karmaGlobal
        : undefined;

  const karmaByInterestRaw = privateRecord.karmaByInterest ?? publicRecord.karmaByInterest;
  const karmaByInterest =
    typeof karmaByInterestRaw === 'object' && karmaByInterestRaw !== null
      ? (karmaByInterestRaw as Record<string, number>)
      : undefined;

  const createdAt = toDate(privateRecord.createdAt) ?? toDate(publicRecord.createdAt) ?? new Date();
  const updatedAt = toDate(privateRecord.updatedAt) ?? toDate(publicRecord.updatedAt) ?? createdAt;

  return {
    uid,
    displayName,
    displayNameLowercase,
    photoURL,
    email: normalizeNullableString(privateRecord.email),
    bio: normalizeNullableString(privateRecord.bio) ?? normalizeNullableString(publicRecord.bio),
    role: normalizeNullableString(privateRecord.role) ?? normalizeNullableString(publicRecord.role),
    location:
      normalizeNullableString(privateRecord.location) ??
      normalizeNullableString(publicRecord.location),
    username:
      normalizeNullableString(privateRecord.username) ??
      normalizeNullableString(publicRecord.username),
    reputation,
    karmaGlobal,
    karmaByInterest,
    accountVisibility: normalizeAccountVisibility(privateRecord, publicRecord),
    followersCount,
    followingCount,
    postsCount,
    createdAt,
    updatedAt,
  };
};

const getCachedProfile = (
  uid: string,
  options?: { requirePrivate?: boolean },
): UserProfileRead | null | undefined => {
  const entry = profileCache.get(uid);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    profileCache.delete(uid);
    return undefined;
  }
  if (options?.requirePrivate && entry.scope !== 'private') return undefined;
  return entry.value;
};

const setCachedProfile = (uid: string, value: UserProfileRead | null, scope: CacheScope): void => {
  const existing = profileCache.get(uid);
  if (existing && existing.scope === 'private' && scope === 'public') {
    profileCache.set(uid, {
      value: existing.value,
      expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
      scope: existing.scope,
    });
    return;
  }

  profileCache.set(uid, { value, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS, scope });
};

export const getUserProfile = async (uid: string): Promise<UserProfileRead | null> => {
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });

  const currentUid = auth.currentUser?.uid ?? null;
  const shouldReadPrivate = currentUid === safeUid;

  const cached = getCachedProfile(safeUid, { requirePrivate: shouldReadPrivate });
  if (cached !== undefined) return cached;

  const privateRef = doc(db, 'users', safeUid);
  const publicRef = doc(db, 'users_public', safeUid);

  try {
    const [privateSnap, publicSnap] = await withTimeout(
      withRetry(
        async () => {
          return await Promise.all([
            shouldReadPrivate ? getDoc(privateRef) : Promise.resolve(null),
            getDoc(publicRef),
          ] as const);
        },
        { context: { op: 'profile.getUserProfile', uid: safeUid, shouldReadPrivate } },
      ),
      READ_TIMEOUT_MS,
      { context: { op: 'profile.getUserProfile', uid: safeUid, shouldReadPrivate } },
    );

    trackFirestoreRead('profile.getUserProfile', shouldReadPrivate ? 2 : 1);

    const privateData = privateSnap && privateSnap.exists() ? privateSnap.data() : null;
    const publicData = publicSnap.exists() ? publicSnap.data() : null;

    if (!privateData && !publicData) {
      setCachedProfile(safeUid, null, shouldReadPrivate ? 'private' : 'public');
      return null;
    }

    const profile = buildUserProfile(safeUid, privateData, publicData);
    setCachedProfile(safeUid, profile, shouldReadPrivate ? 'private' : 'public');
    return profile;
  } catch (error) {
    throw toAppError(error, { context: { op: 'profile.getUserProfile', uid: safeUid } });
  }
};

export const getUserProfilesByIds = async (
  uids: string[],
): Promise<Map<string, UserProfileRead | null>> => {
  const safeIds = validate(z.array(firestoreIdSchema).max(200), uids, {
    context: { uidsCount: uids?.length },
  });
  const uniqueIds = Array.from(new Set(safeIds));

  const result = new Map<string, UserProfileRead | null>();

  const pending: string[] = [];
  uniqueIds.forEach((id) => {
    const cached = getCachedProfile(id);
    if (cached !== undefined) {
      result.set(id, cached);
      return;
    }
    pending.push(id);
  });

  if (pending.length === 0) return result;

  // Fetch public profiles in chunks using `documentId() in [...]` (max 10 ids per query).
  const chunks: string[][] = [];
  for (let i = 0; i < pending.length; i += USERS_IN_QUERY_LIMIT) {
    chunks.push(pending.slice(i, i + USERS_IN_QUERY_LIMIT));
  }

  try {
    const snapshots = await withTimeout(
      withRetry(
        () =>
          Promise.all(
            chunks.map((chunk) =>
              getDocs(query(collection(db, 'users_public'), where(documentId(), 'in', chunk))),
            ),
          ),
        { context: { op: 'profile.getUserProfilesByIds', ids: pending.length } },
      ),
      READ_TIMEOUT_MS,
      { context: { op: 'profile.getUserProfilesByIds', ids: pending.length } },
    );

    let readCount = 0;
    const found = new Map<string, unknown>();

    snapshots.forEach((snap) => {
      readCount += snap.size;
      snap.docs.forEach((docSnap) => {
        found.set(docSnap.id, docSnap.data());
      });
    });

    trackFirestoreRead('profile.getUserProfilesByIds', readCount);

    pending.forEach((id) => {
      const publicData = found.has(id) ? found.get(id) : null;
      const profile = publicData ? buildUserProfile(id, null, publicData) : null;
      setCachedProfile(id, profile, 'public');
      result.set(id, profile);
    });

    return result;
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'profile.getUserProfilesByIds', ids: pending.length },
    });
  }
};
