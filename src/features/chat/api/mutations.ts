import { z } from 'zod';
import {
  blockUser as blockUserRaw,
  clearConversationMute as clearConversationMuteRaw,
  createGroupReport as createGroupReportRaw,
  createUserReport as createUserReportRaw,
  getOrCreateGroupConversation as getOrCreateGroupConversationRaw,
  leaveGroupWithSync as leaveGroupWithSyncRaw,
  markConversationRead as markConversationReadRaw,
  sendMessage as sendMessageRaw,
  setConversationMute as setConversationMuteRaw,
  unblockUser as unblockUserRaw,
  type MessageAttachmentRead,
} from '@/shared/lib/firestore';
import { AppError, toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate } from '@/shared/lib/validators';
import {
  conversationIdSchema,
  createGroupReportInputSchema,
  createUserReportInputSchema,
  groupIdSchema,
  messageAttachmentSchema,
  sendMessageTextSchema,
  uidSchema,
  type UserReportReason,
} from '@/features/chat/api/types';

const WRITE_TIMEOUT_MS = 7000;
const WRITE_RETRYABLE_CODES = [
  'TIMEOUT',
  'NETWORK',
  'deadline-exceeded',
  'unavailable',
  'aborted',
  'resource-exhausted',
] as const;

const senderNameSchema = z.string().trim().max(120).nullable().optional();
const senderPhotoSchema = z.string().trim().url().nullable().optional();
const attachmentsSchema = z.array(messageAttachmentSchema).max(10).optional();

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

export const blockUser = async (currentUid: string, blockedUid: string): Promise<void> => {
  const safeCurrentUid = validate(uidSchema, currentUid, { field: 'currentUid' });
  const safeBlockedUid = validate(uidSchema, blockedUid, { field: 'blockedUid' });
  return runWrite('chat.blockUser', () => blockUserRaw(safeCurrentUid, safeBlockedUid));
};

export const unblockUser = async (currentUid: string, blockedUid: string): Promise<void> => {
  const safeCurrentUid = validate(uidSchema, currentUid, { field: 'currentUid' });
  const safeBlockedUid = validate(uidSchema, blockedUid, { field: 'blockedUid' });
  return runWrite('chat.unblockUser', () => unblockUserRaw(safeCurrentUid, safeBlockedUid));
};

export const clearConversationMute = async (conversationId: string, uid: string): Promise<void> => {
  const safeConversationId = validate(conversationIdSchema, conversationId, {
    field: 'conversationId',
  });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runWrite('chat.clearConversationMute', () =>
    clearConversationMuteRaw(safeConversationId, safeUid),
  );
};

export const setConversationMute = async (
  conversationId: string,
  uid: string,
  mutedUntil: Date | null,
): Promise<void> => {
  const safeConversationId = validate(conversationIdSchema, conversationId, {
    field: 'conversationId',
  });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });

  if (mutedUntil && Number.isNaN(mutedUntil.getTime())) {
    throw new AppError('Validation failed', 'VALIDATION_FAILED', { field: 'mutedUntil' });
  }

  return runWrite('chat.setConversationMute', () =>
    setConversationMuteRaw(safeConversationId, safeUid, mutedUntil),
  );
};

export const createUserReport = async (input: {
  reporterUid: string;
  reportedUid: string;
  reason: UserReportReason;
  details?: string | null;
  conversationId?: string | null;
}): Promise<string> => {
  const safeInput = validate(createUserReportInputSchema, input, { field: 'input' });
  return runWrite('chat.createUserReport', () => createUserReportRaw(safeInput));
};

export const createGroupReport = async (input: {
  reporterUid: string;
  groupId: string;
  reason: UserReportReason;
  details?: string | null;
  conversationId?: string | null;
}): Promise<string> => {
  const safeInput = validate(createGroupReportInputSchema, input, { field: 'input' });
  return runWrite('chat.createGroupReport', () => createGroupReportRaw(safeInput));
};

export const getOrCreateGroupConversation = async (
  groupId: string,
  uid: string,
): Promise<string> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runWrite('chat.getOrCreateGroupConversation', () =>
    getOrCreateGroupConversationRaw(safeGroupId, safeUid),
  );
};

export const leaveGroupWithSync = async (groupId: string, uid: string): Promise<void> => {
  const safeGroupId = validate(groupIdSchema, groupId, { field: 'groupId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runWrite('chat.leaveGroupWithSync', () => leaveGroupWithSyncRaw(safeGroupId, safeUid));
};

export const markConversationRead = async (conversationId: string, uid: string): Promise<void> => {
  const safeConversationId = validate(conversationIdSchema, conversationId, {
    field: 'conversationId',
  });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runWrite('chat.markConversationRead', () =>
    markConversationReadRaw(safeConversationId, safeUid),
  );
};

export const sendMessage = async (
  conversationId: string,
  uid: string,
  text: string,
  senderName?: string | null,
  senderPhotoURL?: string | null,
  attachments?: MessageAttachmentRead[],
  clientIdOverride?: string,
): Promise<void> => {
  const safeConversationId = validate(conversationIdSchema, conversationId, {
    field: 'conversationId',
  });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeText = validate(sendMessageTextSchema, text ?? '', { field: 'text' });
  const safeSenderName = validate(senderNameSchema, senderName, { field: 'senderName' });
  const safeSenderPhotoURL = validate(senderPhotoSchema, senderPhotoURL, {
    field: 'senderPhotoURL',
  });
  const safeAttachments = validate(attachmentsSchema, attachments, {
    field: 'attachments',
  }) as Parameters<typeof sendMessageRaw>[5];

  const hasText = safeText.trim().length > 0;
  const hasAttachments = Array.isArray(safeAttachments) && safeAttachments.length > 0;
  if (!hasText && !hasAttachments) {
    throw new AppError('Validation failed', 'VALIDATION_FAILED', {
      field: 'text',
      reason: 'Message cannot be empty',
    });
  }

  return runWrite('chat.sendMessage', () =>
    sendMessageRaw(
      safeConversationId,
      safeUid,
      safeText,
      safeSenderName,
      safeSenderPhotoURL,
      safeAttachments,
      clientIdOverride,
    ),
  );
};
