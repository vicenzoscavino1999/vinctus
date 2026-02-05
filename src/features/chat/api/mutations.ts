import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate, z } from '@/shared/lib/validators';

import {
  blockUser as blockUserLegacy,
  clearConversationMute as clearConversationMuteLegacy,
  createGroupReport as createGroupReportLegacy,
  createUserReport as createUserReportLegacy,
  leaveGroupWithSync as leaveGroupWithSyncLegacy,
  sendMessage as sendMessageLegacy,
  setConversationMute as setConversationMuteLegacy,
  unblockUser as unblockUserLegacy,
} from '@/shared/lib/firestore';

import type { UserReportReason } from './types';

const READ_TIMEOUT_MS = 5000;
const WRITE_TIMEOUT_MS = 5000;

const firestoreIdSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !value.includes('/'), { message: 'Invalid Firestore ID' });

const messageTextSchema = z.string().max(2000);

const reportReasonSchema = z.enum(['spam', 'harassment', 'abuse', 'fake', 'other']);

const nullableIdSchema = firestoreIdSchema.nullable();

const reportDetailsSchema = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .optional();

const userReportInputSchema = z.object({
  reporterUid: firestoreIdSchema,
  reportedUid: firestoreIdSchema,
  reason: reportReasonSchema,
  details: reportDetailsSchema,
  conversationId: nullableIdSchema.optional(),
});

const groupReportInputSchema = z.object({
  reporterUid: firestoreIdSchema,
  groupId: firestoreIdSchema,
  reason: reportReasonSchema,
  details: reportDetailsSchema,
  conversationId: nullableIdSchema.optional(),
});

export const blockUser = async (currentUid: string, blockedUid: string): Promise<void> => {
  if (!currentUid || !blockedUid || currentUid === blockedUid) return;

  const safeCurrentUid = validate(firestoreIdSchema, currentUid, { context: { currentUid } });
  const safeBlockedUid = validate(firestoreIdSchema, blockedUid, { context: { blockedUid } });

  try {
    await withTimeout(
      withRetry(() => blockUserLegacy(safeCurrentUid, safeBlockedUid), {
        context: { op: 'chat.blockUser', currentUid: safeCurrentUid, blockedUid: safeBlockedUid },
      }),
      WRITE_TIMEOUT_MS,
      { context: { op: 'chat.blockUser', currentUid: safeCurrentUid, blockedUid: safeBlockedUid } },
    );

    // Legacy implementation performs a single batch commit (8 writes).
    trackFirestoreWrite('chat.blockUser', 8);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'chat.blockUser', currentUid: safeCurrentUid, blockedUid: safeBlockedUid },
    });
  }
};

export const unblockUser = async (currentUid: string, blockedUid: string): Promise<void> => {
  if (!currentUid || !blockedUid || currentUid === blockedUid) return;

  const safeCurrentUid = validate(firestoreIdSchema, currentUid, { context: { currentUid } });
  const safeBlockedUid = validate(firestoreIdSchema, blockedUid, { context: { blockedUid } });

  try {
    await withTimeout(
      withRetry(() => unblockUserLegacy(safeCurrentUid, safeBlockedUid), {
        context: { op: 'chat.unblockUser', currentUid: safeCurrentUid, blockedUid: safeBlockedUid },
      }),
      WRITE_TIMEOUT_MS,
      {
        context: { op: 'chat.unblockUser', currentUid: safeCurrentUid, blockedUid: safeBlockedUid },
      },
    );
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'chat.unblockUser', currentUid: safeCurrentUid, blockedUid: safeBlockedUid },
    });
  }
};

export const createUserReport = async (input: {
  reporterUid: string;
  reportedUid: string;
  reason: UserReportReason;
  details?: string | null;
  conversationId?: string | null;
}): Promise<string> => {
  const safe = validate(userReportInputSchema, input, { context: { op: 'chat.createUserReport' } });

  try {
    const reportId = await withTimeout(
      withRetry(
        () =>
          createUserReportLegacy({
            reporterUid: safe.reporterUid,
            reportedUid: safe.reportedUid,
            reason: safe.reason,
            details: safe.details ?? null,
            conversationId: safe.conversationId ?? null,
          }),
        {
          context: {
            op: 'chat.createUserReport',
            reporterUid: safe.reporterUid,
            reportedUid: safe.reportedUid,
          },
        },
      ),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'chat.createUserReport',
          reporterUid: safe.reporterUid,
          reportedUid: safe.reportedUid,
        },
      },
    );

    trackFirestoreWrite('chat.createUserReport', 1);
    return reportId;
  } catch (error) {
    throw toAppError(error, {
      context: {
        op: 'chat.createUserReport',
        reporterUid: safe.reporterUid,
        reportedUid: safe.reportedUid,
      },
    });
  }
};

export const createGroupReport = async (input: {
  reporterUid: string;
  groupId: string;
  reason: UserReportReason;
  details?: string | null;
  conversationId?: string | null;
}): Promise<string> => {
  const safe = validate(groupReportInputSchema, input, {
    context: { op: 'chat.createGroupReport' },
  });

  try {
    const reportId = await withTimeout(
      withRetry(
        () =>
          createGroupReportLegacy({
            reporterUid: safe.reporterUid,
            groupId: safe.groupId,
            reason: safe.reason,
            details: safe.details ?? null,
            conversationId: safe.conversationId ?? null,
          }),
        {
          context: {
            op: 'chat.createGroupReport',
            reporterUid: safe.reporterUid,
            groupId: safe.groupId,
          },
        },
      ),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'chat.createGroupReport',
          reporterUid: safe.reporterUid,
          groupId: safe.groupId,
        },
      },
    );

    trackFirestoreWrite('chat.createGroupReport', 1);
    return reportId;
  } catch (error) {
    throw toAppError(error, {
      context: {
        op: 'chat.createGroupReport',
        reporterUid: safe.reporterUid,
        groupId: safe.groupId,
      },
    });
  }
};

export const getOrCreateGroupConversation = async (
  groupId: string,
  uid: string,
): Promise<string> => {
  const safeGroupId = validate(firestoreIdSchema, groupId, { context: { groupId } });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });

  const conversationId = `grp_${safeGroupId}`;
  const convRef = doc(db, 'conversations', conversationId);

  let convExists = false;
  try {
    const convSnap = await withTimeout(
      withRetry(() => getDoc(convRef), {
        context: {
          op: 'chat.getOrCreateGroupConversation.getConversation',
          conversationId,
          uid: safeUid,
        },
      }),
      READ_TIMEOUT_MS,
      {
        context: {
          op: 'chat.getOrCreateGroupConversation.getConversation',
          conversationId,
          uid: safeUid,
        },
      },
    );
    trackFirestoreRead('chat.getOrCreateGroupConversation.getConversation');
    convExists = convSnap.exists();
  } catch (error) {
    // Reading a non-existent conversation can still throw PERMISSION_DENIED under restrictive rules.
    const appError = toAppError(error, {
      context: {
        op: 'chat.getOrCreateGroupConversation.getConversation',
        conversationId,
        uid: safeUid,
      },
    });
    if (appError.code !== 'PERMISSION_DENIED') {
      throw appError;
    }
    convExists = false;
  }

  if (!convExists) {
    try {
      await withTimeout(
        withRetry(
          () =>
            setDoc(
              convRef,
              {
                type: 'group',
                groupId: safeGroupId,
                lastMessage: null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: false },
            ),
          {
            context: {
              op: 'chat.getOrCreateGroupConversation.createConversation',
              conversationId,
              uid: safeUid,
            },
          },
        ),
        WRITE_TIMEOUT_MS,
        {
          context: {
            op: 'chat.getOrCreateGroupConversation.createConversation',
            conversationId,
            uid: safeUid,
          },
        },
      );

      trackFirestoreWrite('chat.getOrCreateGroupConversation.createConversation', 1);
    } catch (error) {
      const appError = toAppError(error, {
        context: {
          op: 'chat.getOrCreateGroupConversation.createConversation',
          conversationId,
          uid: safeUid,
        },
      });

      // If the doc exists now, our setDoc becomes an update and will be rejected by rules.
      if (appError.code !== 'PERMISSION_DENIED') {
        throw appError;
      }
    }
  }

  const memberRef = doc(db, `conversations/${conversationId}/members`, safeUid);

  try {
    const memberSnap = await withTimeout(
      withRetry(() => getDoc(memberRef), {
        context: {
          op: 'chat.getOrCreateGroupConversation.getMember',
          conversationId,
          uid: safeUid,
        },
      }),
      READ_TIMEOUT_MS,
      {
        context: {
          op: 'chat.getOrCreateGroupConversation.getMember',
          conversationId,
          uid: safeUid,
        },
      },
    );
    trackFirestoreRead('chat.getOrCreateGroupConversation.getMember');

    if (memberSnap.exists()) {
      return conversationId;
    }
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'chat.getOrCreateGroupConversation.getMember', conversationId, uid: safeUid },
    });
  }

  try {
    await withTimeout(
      withRetry(
        () =>
          setDoc(
            memberRef,
            {
              uid: safeUid,
              role: 'member',
              joinedAt: serverTimestamp(),
              lastReadClientAt: Date.now(),
              lastReadAt: serverTimestamp(),
              muted: false,
              mutedUntil: null,
            },
            { merge: false },
          ),
        {
          context: {
            op: 'chat.getOrCreateGroupConversation.createMember',
            conversationId,
            uid: safeUid,
          },
        },
      ),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'chat.getOrCreateGroupConversation.createMember',
          conversationId,
          uid: safeUid,
        },
      },
    );
    trackFirestoreWrite('chat.getOrCreateGroupConversation.createMember', 1);
  } catch (error) {
    throw toAppError(error, {
      context: {
        op: 'chat.getOrCreateGroupConversation.createMember',
        conversationId,
        uid: safeUid,
      },
    });
  }

  return conversationId;
};

export const sendMessage = async (
  conversationId: string,
  uid: string,
  text: string,
  senderName?: string | null,
  senderPhotoURL?: string | null,
  attachments?: unknown[],
  clientIdOverride?: string,
): Promise<void> => {
  const safeConversationId = validate(firestoreIdSchema, conversationId, {
    context: { conversationId },
  });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });
  const safeText = validate(messageTextSchema, text, {
    context: { conversationId: safeConversationId },
  });

  try {
    await withTimeout(
      withRetry(
        () =>
          sendMessageLegacy(
            safeConversationId,
            safeUid,
            safeText,
            senderName ?? null,
            senderPhotoURL ?? null,
            // The legacy API expects `MessageAttachmentWrite[]`; this UI path is still text-first, so we keep
            // attachments as-is but only pass arrays.
            Array.isArray(attachments) ? (attachments as never[]) : undefined,
            clientIdOverride,
          ),
        { context: { op: 'chat.sendMessage', conversationId: safeConversationId, uid: safeUid } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'chat.sendMessage', conversationId: safeConversationId, uid: safeUid } },
    );

    // Message + conversation lastMessage update.
    trackFirestoreWrite('chat.sendMessage', 2);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'chat.sendMessage', conversationId: safeConversationId, uid: safeUid },
    });
  }
};

export const markConversationRead = async (conversationId: string, uid: string): Promise<void> => {
  let safeConversationId: string;
  let safeUid: string;

  try {
    safeConversationId = validate(firestoreIdSchema, conversationId, {
      context: { conversationId },
    });
    safeUid = validate(firestoreIdSchema, uid, { context: { uid } });
  } catch (error) {
    console.error('Error validating markConversationRead input:', error);
    return;
  }

  const memberRef = doc(db, `conversations/${safeConversationId}/members`, safeUid);

  try {
    await withTimeout(
      withRetry(
        () =>
          writeBatch(db)
            .update(memberRef, {
              lastReadClientAt: Date.now(),
              lastReadAt: serverTimestamp(),
            })
            .commit(),
        {
          context: {
            op: 'chat.markConversationRead.update',
            conversationId: safeConversationId,
            uid: safeUid,
          },
        },
      ),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'chat.markConversationRead.update',
          conversationId: safeConversationId,
          uid: safeUid,
        },
      },
    );

    trackFirestoreWrite('chat.markConversationRead', 1);
    return;
  } catch (error) {
    const appError = toAppError(error, {
      context: {
        op: 'chat.markConversationRead.update',
        conversationId: safeConversationId,
        uid: safeUid,
      },
    });

    // Firestore rules can throw PERMISSION_DENIED for an update on a missing doc due to rule evaluation.
    // Fallback to "create member doc" for both NOT_FOUND and PERMISSION_DENIED.
    if (appError.code !== 'NOT_FOUND' && appError.code !== 'PERMISSION_DENIED') {
      console.error('Error marking conversation read:', error);
      return;
    }
  }

  try {
    await withTimeout(
      withRetry(
        () =>
          setDoc(
            memberRef,
            {
              uid: safeUid,
              role: 'member',
              joinedAt: serverTimestamp(),
              lastReadClientAt: Date.now(),
              lastReadAt: serverTimestamp(),
              muted: false,
              mutedUntil: null,
            },
            { merge: false },
          ),
        {
          context: {
            op: 'chat.markConversationRead.create',
            conversationId: safeConversationId,
            uid: safeUid,
          },
        },
      ),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'chat.markConversationRead.create',
          conversationId: safeConversationId,
          uid: safeUid,
        },
      },
    );

    trackFirestoreWrite('chat.markConversationRead', 1);
  } catch (error) {
    console.error('Error creating conversation member:', error);
  }
};

export const setConversationMute = async (
  conversationId: string,
  uid: string,
  mutedUntil: Date | null,
): Promise<void> => {
  const safeConversationId = validate(firestoreIdSchema, conversationId, {
    context: { conversationId },
  });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });

  if (mutedUntil && (!(mutedUntil instanceof Date) || Number.isNaN(mutedUntil.getTime()))) {
    throw toAppError(new Error('Invalid mutedUntil date'), {
      code: 'VALIDATION_FAILED',
      context: { op: 'chat.setConversationMute', conversationId: safeConversationId, uid: safeUid },
    });
  }

  try {
    await withTimeout(
      withRetry(() => setConversationMuteLegacy(safeConversationId, safeUid, mutedUntil), {
        context: {
          op: 'chat.setConversationMute',
          conversationId: safeConversationId,
          uid: safeUid,
        },
      }),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'chat.setConversationMute',
          conversationId: safeConversationId,
          uid: safeUid,
        },
      },
    );
    trackFirestoreWrite('chat.setConversationMute', 1);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'chat.setConversationMute', conversationId: safeConversationId, uid: safeUid },
    });
  }
};

export const clearConversationMute = async (conversationId: string, uid: string): Promise<void> => {
  const safeConversationId = validate(firestoreIdSchema, conversationId, {
    context: { conversationId },
  });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });

  try {
    await withTimeout(
      withRetry(() => clearConversationMuteLegacy(safeConversationId, safeUid), {
        context: {
          op: 'chat.clearConversationMute',
          conversationId: safeConversationId,
          uid: safeUid,
        },
      }),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'chat.clearConversationMute',
          conversationId: safeConversationId,
          uid: safeUid,
        },
      },
    );
    trackFirestoreWrite('chat.clearConversationMute', 1);
  } catch (error) {
    throw toAppError(error, {
      context: {
        op: 'chat.clearConversationMute',
        conversationId: safeConversationId,
        uid: safeUid,
      },
    });
  }
};

export const leaveGroupWithSync = async (groupId: string, uid: string): Promise<void> => {
  const safeGroupId = validate(firestoreIdSchema, groupId, { context: { groupId } });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });

  try {
    await withTimeout(
      withRetry(() => leaveGroupWithSyncLegacy(safeGroupId, safeUid), {
        context: { op: 'chat.leaveGroupWithSync', groupId: safeGroupId, uid: safeUid },
      }),
      WRITE_TIMEOUT_MS,
      { context: { op: 'chat.leaveGroupWithSync', groupId: safeGroupId, uid: safeUid } },
    );
    trackFirestoreWrite('chat.leaveGroupWithSync', 2);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'chat.leaveGroupWithSync', groupId: safeGroupId, uid: safeUid },
    });
  }
};
