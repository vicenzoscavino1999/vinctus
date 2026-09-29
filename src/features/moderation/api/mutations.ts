import { httpsCallable } from 'firebase/functions';
import { functions } from '@/shared/lib/firebase';
import { updateModerationQueueItem as updateModerationQueueItemRaw } from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate } from '@/shared/lib/validators';
import {
  moderationEnforcementActionSchema,
  moderationQueueItemIdSchema,
  moderationQueueStatusSchema,
  moderationReviewActionSchema,
  moderationReviewNoteSchema,
  uidSchema,
  type ModerationEnforcementAction,
  type ModerationEnforcementResult,
  type ModerationQueueStatus,
} from '@/features/moderation/api/types';

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

export const updateModerationQueueStatus = async (input: {
  itemId: string;
  status: ModerationQueueStatus;
  reviewAction: string;
  reviewNote?: string | null;
  reviewedBy: string;
}): Promise<void> => {
  const safeItemId = validate(moderationQueueItemIdSchema, input.itemId, { field: 'itemId' });
  const safeStatus = validate(moderationQueueStatusSchema, input.status, { field: 'status' });
  const safeReviewAction = validate(moderationReviewActionSchema, input.reviewAction, {
    field: 'reviewAction',
  });
  const safeReviewNote = validate(moderationReviewNoteSchema, input.reviewNote, {
    field: 'reviewNote',
  });
  const safeReviewedBy = validate(uidSchema, input.reviewedBy, { field: 'reviewedBy' });

  return runWrite('moderation.updateModerationQueueStatus', () =>
    updateModerationQueueItemRaw(safeItemId, {
      status: safeStatus,
      reviewAction: safeReviewAction,
      reviewNote: safeReviewNote,
      reviewedBy: safeReviewedBy,
    }),
  );
};

/**
 * Removes the reported post/comment or suspends/restores the reported user. Runs in the
 * `moderationTakeAction` callable, which checks the caller is an app admin.
 */
export const applyModerationAction = async (input: {
  itemId: string;
  action: ModerationEnforcementAction;
  reviewNote?: string | null;
}): Promise<ModerationEnforcementResult> => {
  const safeItemId = validate(moderationQueueItemIdSchema, input.itemId, { field: 'itemId' });
  const safeAction = validate(moderationEnforcementActionSchema, input.action, {
    field: 'action',
  });
  const safeReviewNote = validate(moderationReviewNoteSchema, input.reviewNote, {
    field: 'reviewNote',
  });

  const takeAction = httpsCallable<
    { itemId: string; action: ModerationEnforcementAction; note: string | null },
    ModerationEnforcementResult
  >(functions, 'moderationTakeAction');

  try {
    const result = await takeAction({
      itemId: safeItemId,
      action: safeAction,
      note: safeReviewNote ?? null,
    });
    return result.data;
  } catch (error) {
    throw toAppError(error, { operation: 'moderation.applyModerationAction' });
  }
};
