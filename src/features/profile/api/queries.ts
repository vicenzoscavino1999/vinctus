import type { DocumentSnapshot, Unsubscribe } from 'firebase/firestore';
import {
  getAccountVisibilityServer as getAccountVisibilityServerRaw,
  getContributionsByCategory as getContributionsByCategoryRaw,
  getFollowList as getFollowListRaw,
  getFollowStatus as getFollowStatusRaw,
  getIncomingFollowRequests as getIncomingFollowRequestsRaw,
  getRecentUsers as getRecentUsersRaw,
  getUserContributions as getUserContributionsRaw,
  getUserProfile as getUserProfileRaw,
  isUserBlocked as isUserBlockedRaw,
  searchUsersByDisplayName as searchUsersByDisplayNameRaw,
  subscribeToUserProfile as subscribeToUserProfileRaw,
} from '@/shared/lib/firestore';
import { AppError, toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { safeLimit, validate } from '@/shared/lib/validators';
import {
  accountVisibilitySchema,
  categoryIdSchema,
  followListTypeSchema,
  profilePageLimitSchema,
  profileSearchQuerySchema,
  uidSchema,
  type AccountVisibility,
  type ContributionRead,
  type FollowRequestWithUser,
  type FollowStatus,
  type FollowUserRead,
  type PaginatedResult,
  type PublicUserRead,
  type UserProfileRead,
} from '@/features/profile/api/types';

const READ_TIMEOUT_MS = 5000;
const READ_RETRYABLE_CODES = [
  'TIMEOUT',
  'NETWORK',
  'deadline-exceeded',
  'unavailable',
  'aborted',
] as const;

const runRead = async <T>(operation: string, fn: () => Promise<T>): Promise<T> => {
  try {
    return await withRetry(() => withTimeout(fn(), READ_TIMEOUT_MS, { operation }), {
      retries: 2,
      backoffMs: 150,
      retryableCodes: READ_RETRYABLE_CODES,
    });
  } catch (error) {
    throw toAppError(error, { operation });
  }
};

const wrapUnsubscribe = (operation: string, unsubscribe: Unsubscribe): Unsubscribe => {
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    try {
      unsubscribe();
    } catch (error) {
      console.error(`[${operation}] unsubscribe failed`, error);
    }
  };
};

const ensureCallback = <T>(value: unknown, field: string): T => {
  if (typeof value === 'function') return value as T;
  throw new AppError('Validation failed', 'VALIDATION_FAILED', { field });
};

export const getContributionsByCategory = async (
  categoryId: string,
  limitCount: number = 12,
): Promise<ContributionRead[]> => {
  const safeCategoryId = validate(categoryIdSchema, categoryId, { field: 'categoryId' });
  const safeLimitCount = validate(profilePageLimitSchema, safeLimit(limitCount, 12), {
    field: 'limitCount',
  });
  return runRead('profile.getContributionsByCategory', () =>
    getContributionsByCategoryRaw(safeCategoryId, safeLimitCount),
  );
};

export const getAccountVisibilityServer = async (uid: string): Promise<AccountVisibility> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runRead('profile.getAccountVisibilityServer', () =>
    getAccountVisibilityServerRaw(safeUid),
  );
};

export const getFollowList = async (
  uid: string,
  list: 'followers' | 'following',
  pageSize: number = 20,
  cursor?: DocumentSnapshot | null,
): Promise<PaginatedResult<FollowUserRead>> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeList = validate(followListTypeSchema, list, { field: 'list' });
  const safePageSize = validate(profilePageLimitSchema, safeLimit(pageSize, 20), {
    field: 'pageSize',
  });
  return runRead('profile.getFollowList', () =>
    getFollowListRaw(safeUid, safeList, safePageSize, cursor),
  );
};

export const getFollowStatus = async (
  currentUid: string,
  targetUid: string,
  targetVisibility?: AccountVisibility,
): Promise<{ status: FollowStatus; requestId?: string; isMutual?: boolean }> => {
  const safeCurrentUid = validate(uidSchema, currentUid, { field: 'currentUid' });
  const safeTargetUid = validate(uidSchema, targetUid, { field: 'targetUid' });
  const safeTargetVisibility =
    targetVisibility === undefined
      ? undefined
      : validate(accountVisibilitySchema, targetVisibility, { field: 'targetVisibility' });
  return runRead('profile.getFollowStatus', () =>
    getFollowStatusRaw(safeCurrentUid, safeTargetUid, safeTargetVisibility),
  );
};

export const getIncomingFollowRequests = async (
  uid: string,
  pageSize: number = 20,
  cursor?: DocumentSnapshot | null,
): Promise<PaginatedResult<FollowRequestWithUser>> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safePageSize = validate(profilePageLimitSchema, safeLimit(pageSize, 20), {
    field: 'pageSize',
  });
  return runRead('profile.getIncomingFollowRequests', () =>
    getIncomingFollowRequestsRaw(safeUid, safePageSize, cursor),
  );
};

export const getRecentUsers = async (
  limitCount: number = 15,
  excludeUid?: string,
): Promise<PublicUserRead[]> => {
  const safeLimitCount = validate(profilePageLimitSchema, safeLimit(limitCount, 15), {
    field: 'limitCount',
  });
  const safeExcludeUid =
    typeof excludeUid === 'string' && excludeUid.trim().length > 0
      ? validate(uidSchema, excludeUid, { field: 'excludeUid' })
      : undefined;
  return runRead('profile.getRecentUsers', () => getRecentUsersRaw(safeLimitCount, safeExcludeUid));
};

export const searchUsersByDisplayName = async (
  queryText: string,
  limitCount: number = 10,
): Promise<PublicUserRead[]> => {
  const safeQueryText = validate(profileSearchQuerySchema, queryText, { field: 'queryText' });
  const safeLimitCount = validate(profilePageLimitSchema, safeLimit(limitCount, 10), {
    field: 'limitCount',
  });
  return runRead('profile.searchUsersByDisplayName', () =>
    searchUsersByDisplayNameRaw(safeQueryText, safeLimitCount),
  );
};

export const subscribeToUserProfile = (
  uid: string,
  onData: (profile: UserProfileRead | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeOnData = ensureCallback<typeof onData>(onData, 'onData');
  const safeOnError = onError
    ? ensureCallback<(error: Error) => void>(onError, 'onError')
    : undefined;
  let active = true;

  try {
    const unsubscribe = subscribeToUserProfileRaw(
      safeUid,
      (profile) => {
        if (!active) return;
        safeOnData(profile as UserProfileRead | null);
      },
      safeOnError
        ? (error) => {
            if (!active) return;
            safeOnError(error);
          }
        : undefined,
    );

    return wrapUnsubscribe('profile.subscribeToUserProfile', () => {
      active = false;
      unsubscribe();
    });
  } catch (error) {
    throw toAppError(error, { operation: 'profile.subscribeToUserProfile' });
  }
};

export const getUserContributions = async (uid: string): Promise<ContributionRead[]> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runRead('profile.getUserContributions', () => getUserContributionsRaw(safeUid));
};

export const getUserProfile = async (uid: string): Promise<UserProfileRead | null> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runRead('profile.getUserProfile', async () => {
    const profile = await getUserProfileRaw(safeUid);
    return profile as UserProfileRead | null;
  });
};

export const isUserBlocked = async (currentUid: string, otherUid: string): Promise<boolean> => {
  const safeCurrentUid = validate(uidSchema, currentUid, { field: 'currentUid' });
  const safeOtherUid = validate(uidSchema, otherUid, { field: 'otherUid' });
  return runRead('profile.isUserBlocked', () => isUserBlockedRaw(safeCurrentUid, safeOtherUid));
};
