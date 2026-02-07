import type { DocumentSnapshot } from 'firebase/firestore';
import {
  getFollowing as getFollowingRaw,
  getGroup as getGroupRaw,
  getGroupJoinStatus as getGroupJoinStatusRaw,
  getGroupMemberCount as getGroupMemberCountRaw,
  getGroupMembers as getGroupMembersRaw,
  getGroupMembersPage as getGroupMembersPageRaw,
  getGroupPostsWeekCount as getGroupPostsWeekCountRaw,
  getGroups as getGroupsRaw,
  getGroupsByCategory as getGroupsByCategoryRaw,
  getPendingGroupJoinRequests as getPendingGroupJoinRequestsRaw,
  getPostsByGroup as getPostsByGroupRaw,
  getUserProfile as getUserProfileRaw,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { safeLimit, validate } from '@/shared/lib/validators';
import {
  categoryIdSchema,
  groupIdSchema,
  groupPageLimitSchema,
  groupRequestLimitSchema,
  uidSchema,
  type FirestoreGroup,
  type GroupJoinRequestRead,
  type GroupJoinStatus,
  type GroupMemberRead,
  type PaginatedResult,
  type PostRead,
  type UserProfileRead,
} from '@/features/groups/api/types';

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

export const getFollowing = async (uid: string): Promise<UserProfileRead[]> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runRead('groups.getFollowing', async () => {
    const profiles = await getFollowingRaw(safeUid);
    return profiles as UserProfileRead[];
  });
};

export const getGroups = async (): Promise<FirestoreGroup[]> =>
  runRead('groups.getGroups', () => getGroupsRaw());

export const getGroupsByCategory = async (categoryId: string): Promise<FirestoreGroup[]> => {
  const safeCategoryId = validate(categoryIdSchema, categoryId, { field: 'categoryId' });
  return runRead('groups.getGroupsByCategory', () => getGroupsByCategoryRaw(safeCategoryId));
};

export const getGroup = async (groupId: string): Promise<FirestoreGroup | null> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  return runRead('groups.getGroup', () => getGroupRaw(safeGroupId));
};

export const getGroupJoinStatus = async (
  groupId: string,
  uid: string,
): Promise<GroupJoinStatus> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runRead('groups.getGroupJoinStatus', () => getGroupJoinStatusRaw(safeGroupId, safeUid));
};

export const getGroupMemberCount = async (groupId: string): Promise<number> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  return runRead('groups.getGroupMemberCount', () => getGroupMemberCountRaw(safeGroupId));
};

export const getGroupMembers = async (
  groupId: string,
  limitCount: number = 30,
): Promise<GroupMemberRead[]> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  const safePageSize = validate(groupPageLimitSchema, safeLimit(limitCount, 30), {
    field: 'limitCount',
  });
  return runRead('groups.getGroupMembers', () => getGroupMembersRaw(safeGroupId, safePageSize));
};

export const getGroupMembersPage = async (
  groupId: string,
  pageSize: number = 30,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResult<GroupMemberRead>> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  const safePageSize = validate(groupPageLimitSchema, safeLimit(pageSize, 30), {
    field: 'pageSize',
  });
  return runRead('groups.getGroupMembersPage', () =>
    getGroupMembersPageRaw(safeGroupId, safePageSize, lastDoc),
  );
};

export const getGroupPostsWeekCount = async (groupId: string): Promise<number> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  return runRead('groups.getGroupPostsWeekCount', () => getGroupPostsWeekCountRaw(safeGroupId));
};

export const getPendingGroupJoinRequests = async (
  ownerId: string,
  limitCount: number = 50,
): Promise<GroupJoinRequestRead[]> => {
  const safeOwnerId = validate(uidSchema, ownerId, { field: 'ownerId' });
  const safeLimitCount = validate(groupRequestLimitSchema, safeLimit(limitCount, 50), {
    field: 'limitCount',
  });
  return runRead('groups.getPendingGroupJoinRequests', () =>
    getPendingGroupJoinRequestsRaw(safeOwnerId, safeLimitCount),
  );
};

export const getPostsByGroup = async (
  groupId: string,
  pageSize: number = 30,
  lastDoc?: DocumentSnapshot,
): Promise<PaginatedResult<PostRead>> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  const safePageSize = validate(groupPageLimitSchema, safeLimit(pageSize, 30), {
    field: 'pageSize',
  });
  return runRead('groups.getPostsByGroup', () =>
    getPostsByGroupRaw(safeGroupId, safePageSize, lastDoc),
  );
};

export const getUserProfile = async (uid: string): Promise<UserProfileRead | null> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runRead('groups.getUserProfile', async () => {
    const profile = await getUserProfileRaw(safeUid);
    return profile as UserProfileRead | null;
  });
};
