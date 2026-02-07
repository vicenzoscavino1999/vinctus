import {
  acceptGroupJoinRequest as acceptGroupJoinRequestRaw,
  addGroupMember as addGroupMemberRaw,
  createGroup as createGroupRaw,
  getOrCreateGroupConversation as getOrCreateGroupConversationRaw,
  joinGroupWithSync as joinGroupWithSyncRaw,
  joinPublicGroup as joinPublicGroupRaw,
  leaveGroupWithSync as leaveGroupWithSyncRaw,
  rejectGroupJoinRequest as rejectGroupJoinRequestRaw,
  removeGroupMember as removeGroupMemberRaw,
  sendGroupJoinRequest as sendGroupJoinRequestRaw,
  updateGroup as updateGroupRaw,
  updateGroupMemberRole as updateGroupMemberRoleRaw,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate } from '@/shared/lib/validators';
import {
  createGroupInputSchema,
  groupIdSchema,
  groupRoleSchema,
  requestIdSchema,
  sendGroupJoinRequestInputSchema,
  uidSchema,
  updateGroupInputSchema,
  type CreateGroupInput,
} from '@/features/groups/api/types';

const WRITE_TIMEOUT_MS = 7000;
const WRITE_RETRYABLE_CODES = [
  'TIMEOUT',
  'NETWORK',
  'deadline-exceeded',
  'unavailable',
  'aborted',
  'resource-exhausted',
] as const;

const runWrite = async <T>(operation: string, fn: () => Promise<T>): Promise<T> => {
  try {
    return await withRetry(() => withTimeout(fn(), WRITE_TIMEOUT_MS, { operation }), {
      retries: 1,
      backoffMs: 200,
      retryableCodes: WRITE_RETRYABLE_CODES,
    });
  } catch (error) {
    throw toAppError(error, { operation });
  }
};

const normalizeNullableText = (value: string | null): string | null => {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const createGroup = async (ownerId: string, input: CreateGroupInput): Promise<string> => {
  const safeOwnerId = validate(uidSchema, ownerId, { field: 'ownerId' });
  const safeInput = validate(createGroupInputSchema, input, { field: 'input' });
  return runWrite('groups.createGroup', () => createGroupRaw(safeOwnerId, safeInput));
};

export const updateGroup = async (groupId: string, input: CreateGroupInput): Promise<void> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  const safeInput = validate(updateGroupInputSchema, input, { field: 'input' });
  return runWrite('groups.updateGroup', () => updateGroupRaw(safeGroupId, safeInput));
};

export const joinGroupWithSync = async (groupId: string, uid: string): Promise<void> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runWrite('groups.joinGroupWithSync', () => joinGroupWithSyncRaw(safeGroupId, safeUid));
};

export const leaveGroupWithSync = async (groupId: string, uid: string): Promise<void> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runWrite('groups.leaveGroupWithSync', () => leaveGroupWithSyncRaw(safeGroupId, safeUid));
};

export const addGroupMember = async (
  groupId: string,
  uid: string,
  role: 'member' | 'moderator' | 'admin' = 'member',
): Promise<void> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeRole = validate(groupRoleSchema, role, { field: 'role' });
  return runWrite('groups.addGroupMember', () => addGroupMemberRaw(safeGroupId, safeUid, safeRole));
};

export const updateGroupMemberRole = async (
  groupId: string,
  uid: string,
  role: 'member' | 'moderator' | 'admin',
): Promise<void> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeRole = validate(groupRoleSchema, role, { field: 'role' });
  return runWrite('groups.updateGroupMemberRole', () =>
    updateGroupMemberRoleRaw(safeGroupId, safeUid, safeRole),
  );
};

export const removeGroupMember = async (groupId: string, uid: string): Promise<void> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runWrite('groups.removeGroupMember', () => removeGroupMemberRaw(safeGroupId, safeUid));
};

export const joinPublicGroup = async (groupId: string, uid: string): Promise<void> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runWrite('groups.joinPublicGroup', () => joinPublicGroupRaw(safeGroupId, safeUid));
};

export const sendGroupJoinRequest = async (input: {
  groupId: string;
  groupName: string;
  fromUid: string;
  toUid: string;
  message: string | null;
  fromUserName: string | null;
  fromUserPhoto: string | null;
}): Promise<string> => {
  const safeInput = validate(sendGroupJoinRequestInputSchema, input, { field: 'input' });
  const normalizedInput = {
    ...safeInput,
    message: normalizeNullableText(safeInput.message),
    fromUserName: normalizeNullableText(safeInput.fromUserName),
  };
  return runWrite('groups.sendGroupJoinRequest', () => sendGroupJoinRequestRaw(normalizedInput));
};

export const acceptGroupJoinRequest = async (requestId: string): Promise<void> => {
  const safeRequestId = validate(requestIdSchema, requestId, { field: 'requestId' });
  return runWrite('groups.acceptGroupJoinRequest', () => acceptGroupJoinRequestRaw(safeRequestId));
};

export const rejectGroupJoinRequest = async (requestId: string): Promise<void> => {
  const safeRequestId = validate(requestIdSchema, requestId, { field: 'requestId' });
  return runWrite('groups.rejectGroupJoinRequest', () => rejectGroupJoinRequestRaw(safeRequestId));
};

export const getOrCreateGroupConversation = async (
  groupId: string,
  uid: string,
): Promise<string> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runWrite('groups.getOrCreateGroupConversation', () =>
    getOrCreateGroupConversationRaw(safeGroupId, safeUid),
  );
};
