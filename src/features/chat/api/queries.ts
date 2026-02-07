import {
  getBlockedUsers as getBlockedUsersRaw,
  getConversationMember as getConversationMemberRaw,
  getGroup as getGroupRaw,
  getGroupMemberCount as getGroupMemberCountRaw,
  getGroupPostsWeekCount as getGroupPostsWeekCountRaw,
  getUserProfile as getUserProfileRaw,
  isUserBlocked as isUserBlockedRaw,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate } from '@/shared/lib/validators';
import {
  conversationIdSchema,
  groupIdSchema,
  uidSchema,
  type ConversationMemberRead,
  type FirestoreGroup,
  type UserProfileRead,
} from '@/features/chat/api/types';

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

export const getBlockedUsers = async (uid: string): Promise<string[]> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runRead('chat.getBlockedUsers', () => getBlockedUsersRaw(safeUid));
};

export const getConversationMember = async (
  conversationId: string,
  uid: string,
): Promise<ConversationMemberRead | null> => {
  const safeConversationId = validate(conversationIdSchema, conversationId, {
    field: 'conversationId',
  });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runRead('chat.getConversationMember', () =>
    getConversationMemberRaw(safeConversationId, safeUid),
  );
};

export const getGroup = async (groupId: string): Promise<FirestoreGroup | null> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  return runRead('chat.getGroup', () => getGroupRaw(safeGroupId));
};

export const getGroupMemberCount = async (groupId: string): Promise<number> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  return runRead('chat.getGroupMemberCount', () => getGroupMemberCountRaw(safeGroupId));
};

export const getGroupPostsWeekCount = async (groupId: string): Promise<number> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  return runRead('chat.getGroupPostsWeekCount', () => getGroupPostsWeekCountRaw(safeGroupId));
};

export const getUserProfile = async (uid: string): Promise<UserProfileRead | null> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runRead('chat.getUserProfile', () => getUserProfileRaw(safeUid));
};

export const isUserBlocked = async (currentUid: string, otherUid: string): Promise<boolean> => {
  const safeCurrentUid = validate(uidSchema, currentUid, { field: 'currentUid' });
  const safeOtherUid = validate(uidSchema, otherUid, { field: 'otherUid' });
  return runRead('chat.isUserBlocked', () => isUserBlockedRaw(safeCurrentUid, safeOtherUid));
};
