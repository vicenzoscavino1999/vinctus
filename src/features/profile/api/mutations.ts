import {
  acceptFollowRequest as acceptFollowRequestRaw,
  blockUser as blockUserRaw,
  cancelFollowRequest as cancelFollowRequestRaw,
  createContribution as createContributionRaw,
  createUserReport as createUserReportRaw,
  declineFollowRequest as declineFollowRequestRaw,
  deleteContribution as deleteContributionRaw,
  followCategoryWithSync as followCategoryWithSyncRaw,
  followPublicUser as followPublicUserRaw,
  getOrCreateDirectConversation as getOrCreateDirectConversationRaw,
  saveCategoryWithSync as saveCategoryWithSyncRaw,
  sendFollowRequest as sendFollowRequestRaw,
  unblockUser as unblockUserRaw,
  unfollowCategoryWithSync as unfollowCategoryWithSyncRaw,
  unfollowUser as unfollowUserRaw,
  unsaveCategoryWithSync as unsaveCategoryWithSyncRaw,
  updateContributionFile as updateContributionFileRaw,
  updateUserProfile as updateUserProfileRaw,
} from '@/shared/lib/firestore';
import type { UserReportReason } from '@/shared/lib/firestore';
import { LIMITS } from '@/shared/lib/firestore/firestoreContract';
import { deleteCollectionFile } from '@/shared/lib/storage';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate } from '@/shared/lib/validators';
import {
  createContributionInputSchema,
  uidSchema,
  categoryIdSchema,
  updateContributionFileInputSchema,
  userProfileUpdateSchema,
  type UserProfileUpdate,
  type ContributionType,
} from '@/features/profile/api/types';

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

const normalizeOptionalText = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeNullableText = (value: string | null | undefined): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const sendFollowRequest = async (fromUid: string, toUid: string): Promise<string> => {
  const safeFromUid = validate(uidSchema, fromUid, { field: 'fromUid' });
  const safeToUid = validate(uidSchema, toUid, { field: 'toUid' });
  return runWrite('profile.sendFollowRequest', () => sendFollowRequestRaw(safeFromUid, safeToUid));
};

export const cancelFollowRequest = async (fromUid: string, toUid: string): Promise<void> => {
  const safeFromUid = validate(uidSchema, fromUid, { field: 'fromUid' });
  const safeToUid = validate(uidSchema, toUid, { field: 'toUid' });
  return runWrite('profile.cancelFollowRequest', () =>
    cancelFollowRequestRaw(safeFromUid, safeToUid),
  );
};

export const acceptFollowRequest = async (fromUid: string, toUid: string): Promise<void> => {
  const safeFromUid = validate(uidSchema, fromUid, { field: 'fromUid' });
  const safeToUid = validate(uidSchema, toUid, { field: 'toUid' });
  return runWrite('profile.acceptFollowRequest', () =>
    acceptFollowRequestRaw(safeFromUid, safeToUid),
  );
};

export const declineFollowRequest = async (fromUid: string, toUid: string): Promise<void> => {
  const safeFromUid = validate(uidSchema, fromUid, { field: 'fromUid' });
  const safeToUid = validate(uidSchema, toUid, { field: 'toUid' });
  return runWrite('profile.declineFollowRequest', () =>
    declineFollowRequestRaw(safeFromUid, safeToUid),
  );
};

export const followPublicUser = async (followerUid: string, targetUid: string): Promise<void> => {
  const safeFollowerUid = validate(uidSchema, followerUid, { field: 'followerUid' });
  const safeTargetUid = validate(uidSchema, targetUid, { field: 'targetUid' });
  return runWrite('profile.followPublicUser', () =>
    followPublicUserRaw(safeFollowerUid, safeTargetUid),
  );
};

export const unfollowUser = async (followerUid: string, targetUid: string): Promise<void> => {
  const safeFollowerUid = validate(uidSchema, followerUid, { field: 'followerUid' });
  const safeTargetUid = validate(uidSchema, targetUid, { field: 'targetUid' });
  return runWrite('profile.unfollowUser', () => unfollowUserRaw(safeFollowerUid, safeTargetUid));
};

export const blockUser = async (currentUid: string, blockedUid: string): Promise<void> => {
  const safeCurrentUid = validate(uidSchema, currentUid, { field: 'currentUid' });
  const safeBlockedUid = validate(uidSchema, blockedUid, { field: 'blockedUid' });
  return runWrite('profile.blockUser', () => blockUserRaw(safeCurrentUid, safeBlockedUid));
};

export const unblockUser = async (currentUid: string, blockedUid: string): Promise<void> => {
  const safeCurrentUid = validate(uidSchema, currentUid, { field: 'currentUid' });
  const safeBlockedUid = validate(uidSchema, blockedUid, { field: 'blockedUid' });
  return runWrite('profile.unblockUser', () => unblockUserRaw(safeCurrentUid, safeBlockedUid));
};

export const reportUserProfile = async (input: {
  reporterUid: string;
  reportedUid: string;
  reason: UserReportReason;
  details?: string | null;
}): Promise<string> => {
  const safeReporterUid = validate(uidSchema, input.reporterUid, { field: 'reporterUid' });
  const safeReportedUid = validate(uidSchema, input.reportedUid, { field: 'reportedUid' });
  if (safeReporterUid === safeReportedUid) {
    throw toAppError(new Error('No puedes reportarte a ti mismo.'), {
      operation: 'profile.reportUserProfile',
    });
  }
  const trimmedDetails = input.details?.trim();
  const safeDetails = trimmedDetails
    ? trimmedDetails.slice(0, LIMITS.reports.detailsMaxLength)
    : null;
  return runWrite('profile.reportUserProfile', () =>
    createUserReportRaw({
      reporterUid: safeReporterUid,
      reportedUid: safeReportedUid,
      reason: input.reason,
      details: safeDetails,
      conversationId: null,
    }),
  );
};

export const getOrCreateDirectConversation = async (
  uid1: string,
  uid2: string,
): Promise<string> => {
  const safeUid1 = validate(uidSchema, uid1, { field: 'uid1' });
  const safeUid2 = validate(uidSchema, uid2, { field: 'uid2' });
  return runWrite('profile.getOrCreateDirectConversation', () =>
    getOrCreateDirectConversationRaw(safeUid1, safeUid2),
  );
};

export const updateUserProfile = async (uid: string, updates: UserProfileUpdate): Promise<void> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeUpdates = validate(userProfileUpdateSchema, updates, { field: 'updates' });
  const normalizedUpdates: UserProfileUpdate = {
    displayName: normalizeOptionalText(safeUpdates.displayName),
    photoURL: safeUpdates.photoURL,
    bio: normalizeNullableText(safeUpdates.bio),
    role: normalizeNullableText(safeUpdates.role),
    location: normalizeNullableText(safeUpdates.location),
    username: normalizeNullableText(safeUpdates.username),
  };
  return runWrite('profile.updateUserProfile', () =>
    updateUserProfileRaw(safeUid, normalizedUpdates),
  );
};

export const createContribution = async (input: {
  userId: string;
  type: ContributionType;
  title: string;
  description?: string | null;
  link?: string | null;
  categoryId?: string | null;
}): Promise<string> => {
  const safeInput = validate(createContributionInputSchema, input, { field: 'input' });
  const normalizedInput = {
    ...safeInput,
    title: safeInput.title.trim(),
    description: normalizeNullableText(safeInput.description),
    link: normalizeNullableText(safeInput.link),
    categoryId: normalizeNullableText(safeInput.categoryId),
  };
  return runWrite('profile.createContribution', () => createContributionRaw(normalizedInput));
};

export const updateContributionFile = async (
  contributionId: string,
  input: {
    fileUrl: string;
    filePath: string;
    fileName: string;
    fileSize: number;
    fileType: string;
  },
): Promise<void> => {
  const safeContributionId = validate(uidSchema, contributionId, { field: 'contributionId' });
  const safeInput = validate(updateContributionFileInputSchema, input, { field: 'input' });
  return runWrite('profile.updateContributionFile', () =>
    updateContributionFileRaw(safeContributionId, safeInput),
  );
};

export const deleteContribution = async (
  contributionId: string,
  filePath?: string | null,
): Promise<void> => {
  const safeContributionId = validate(uidSchema, contributionId, { field: 'contributionId' });
  const safeFilePath = normalizeNullableText(filePath);
  if (safeFilePath) {
    try {
      await deleteCollectionFile(safeFilePath);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== 'storage/object-not-found') {
        console.warn('Failed to delete contribution attachment before doc delete:', error);
      }
    }
  }
  return runWrite('profile.deleteContribution', () => deleteContributionRaw(safeContributionId));
};

export const saveCategoryWithSync = async (categoryId: string, uid: string): Promise<void> => {
  const safeCategoryId = validate(categoryIdSchema, categoryId, { field: 'categoryId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runWrite('profile.saveCategoryWithSync', () =>
    saveCategoryWithSyncRaw(safeCategoryId, safeUid),
  );
};

export const unsaveCategoryWithSync = async (categoryId: string, uid: string): Promise<void> => {
  const safeCategoryId = validate(categoryIdSchema, categoryId, { field: 'categoryId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runWrite('profile.unsaveCategoryWithSync', () =>
    unsaveCategoryWithSyncRaw(safeCategoryId, safeUid),
  );
};

export const followCategoryWithSync = async (categoryId: string, uid: string): Promise<void> => {
  const safeCategoryId = validate(categoryIdSchema, categoryId, { field: 'categoryId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runWrite('profile.followCategoryWithSync', () =>
    followCategoryWithSyncRaw(safeCategoryId, safeUid),
  );
};

export const unfollowCategoryWithSync = async (categoryId: string, uid: string): Promise<void> => {
  const safeCategoryId = validate(categoryIdSchema, categoryId, { field: 'categoryId' });
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runWrite('profile.unfollowCategoryWithSync', () =>
    unfollowCategoryWithSyncRaw(safeCategoryId, safeUid),
  );
};
