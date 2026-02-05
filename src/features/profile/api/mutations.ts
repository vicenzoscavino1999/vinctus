import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import {
  acceptFollowRequest as acceptFollowRequestLegacy,
  cancelFollowRequest as cancelFollowRequestLegacy,
  declineFollowRequest as declineFollowRequestLegacy,
  getOrCreateDirectConversation as getOrCreateDirectConversationLegacy,
  sendFollowRequest as sendFollowRequestLegacy,
} from '@/shared/lib/firestore';
import { trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { AppError, toAppError } from '@/shared/lib/errors';
import { db } from '@/shared/lib/firebase';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate, z } from '@/shared/lib/validators';

import type { ContributionType } from './types';

const WRITE_TIMEOUT_MS = 5000;

const firestoreIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !value.includes('/'), { message: 'Invalid Firestore ID' });

const contributionTypeSchema = z.enum(['project', 'paper', 'cv', 'certificate', 'other']);

const nullableTextSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable();

const userProfileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  photoURL: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional(),
  bio: nullableTextSchema(500).optional(),
  role: nullableTextSchema(120).optional(),
  location: nullableTextSchema(120).optional(),
  username: z.string().trim().min(1).max(40).optional(),
});

const createContributionInputSchema = z.object({
  userId: firestoreIdSchema,
  type: contributionTypeSchema,
  title: z.string().trim().min(1).max(140),
  description: nullableTextSchema(2000).optional(),
  link: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional(),
  categoryId: z
    .string()
    .trim()
    .max(100)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .optional(),
});

const contributionFileInputSchema = z.object({
  fileUrl: z.string().trim().min(1).max(500),
  filePath: z.string().trim().min(1).max(600),
  fileName: z.string().trim().min(1).max(140),
  fileSize: z.number().int().min(0).max(26_214_400),
  fileType: z.string().trim().min(1).max(120),
});

const assertDifferentUids = (
  firstUid: string,
  secondUid: string,
  context: Record<string, unknown>,
): void => {
  if (firstUid === secondUid) {
    throw new AppError('VALIDATION_FAILED', 'Invalid operation with the same uid', { context });
  }
};

export const updateUserProfile = async (
  uid: string,
  updates: {
    displayName?: string;
    photoURL?: string | null;
    bio?: string;
    role?: string;
    location?: string;
    username?: string;
  },
): Promise<void> => {
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });
  const safeUpdates = validate(userProfileUpdateSchema, updates, {
    context: { op: 'profile.updateUserProfile', uid: safeUid },
  });

  const userUpdates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  const publicUpdates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (safeUpdates.displayName !== undefined) {
    userUpdates.displayName = safeUpdates.displayName;
    userUpdates.displayNameLowercase = safeUpdates.displayName.toLowerCase();
    publicUpdates.displayName = safeUpdates.displayName;
    publicUpdates.displayNameLowercase = safeUpdates.displayName.toLowerCase();
  }

  if (safeUpdates.bio !== undefined) {
    userUpdates.bio = safeUpdates.bio;
  }

  if (safeUpdates.photoURL !== undefined) {
    userUpdates.photoURL = safeUpdates.photoURL;
    publicUpdates.photoURL = safeUpdates.photoURL;
  }

  if (safeUpdates.role !== undefined) {
    userUpdates.role = safeUpdates.role;
  }

  if (safeUpdates.location !== undefined) {
    userUpdates.location = safeUpdates.location;
  }

  if (safeUpdates.username !== undefined) {
    userUpdates.username = safeUpdates.username;
    publicUpdates.username = safeUpdates.username;
  }

  try {
    await withTimeout(
      withRetry(
        async () => {
          const batch = writeBatch(db);
          batch.set(doc(db, 'users', safeUid), userUpdates, { merge: true });
          batch.set(doc(db, 'users_public', safeUid), publicUpdates, { merge: true });
          await batch.commit();
        },
        { context: { op: 'profile.updateUserProfile', uid: safeUid } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'profile.updateUserProfile', uid: safeUid } },
    );
    trackFirestoreWrite('profile.updateUserProfile', 2);
  } catch (error) {
    throw toAppError(error, { context: { op: 'profile.updateUserProfile', uid: safeUid } });
  }
};

export const createContribution = async (input: {
  userId: string;
  type: ContributionType;
  title: string;
  description?: string | null;
  link?: string | null;
  categoryId?: string | null;
}): Promise<string> => {
  const safeInput = validate(createContributionInputSchema, input, {
    context: { op: 'profile.createContribution', userId: input?.userId },
  });

  const contributionRef = doc(collection(db, 'contributions'));

  try {
    await withTimeout(
      withRetry(
        () =>
          setDoc(
            contributionRef,
            {
              userId: safeInput.userId,
              type: safeInput.type,
              title: safeInput.title,
              description: safeInput.description ?? null,
              categoryId: safeInput.categoryId ?? null,
              link: safeInput.link ?? null,
              fileUrl: null,
              filePath: null,
              fileName: null,
              fileSize: null,
              fileType: null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: false },
          ),
        { context: { op: 'profile.createContribution', userId: safeInput.userId } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'profile.createContribution', userId: safeInput.userId } },
    );
    trackFirestoreWrite('profile.createContribution');
    return contributionRef.id;
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'profile.createContribution', userId: safeInput.userId },
    });
  }
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
  const safeContributionId = validate(firestoreIdSchema, contributionId, {
    context: { contributionId },
  });
  const safeInput = validate(contributionFileInputSchema, input, {
    context: { op: 'profile.updateContributionFile', contributionId: safeContributionId },
  });

  try {
    await withTimeout(
      withRetry(
        () =>
          updateDoc(doc(db, 'contributions', safeContributionId), {
            fileUrl: safeInput.fileUrl,
            filePath: safeInput.filePath,
            fileName: safeInput.fileName,
            fileSize: safeInput.fileSize,
            fileType: safeInput.fileType,
            updatedAt: serverTimestamp(),
          }),
        { context: { op: 'profile.updateContributionFile', contributionId: safeContributionId } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'profile.updateContributionFile', contributionId: safeContributionId } },
    );
    trackFirestoreWrite('profile.updateContributionFile');
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'profile.updateContributionFile', contributionId: safeContributionId },
    });
  }
};

export const saveCategoryWithSync = async (categoryId: string, uid: string): Promise<void> => {
  const safeCategoryId = validate(firestoreIdSchema, categoryId, { context: { categoryId } });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });

  try {
    await withTimeout(
      withRetry(
        async () => {
          const batch = writeBatch(db);
          batch.set(
            doc(db, 'users', safeUid, 'savedCategories', safeCategoryId),
            {
              categoryId: safeCategoryId,
              createdAt: serverTimestamp(),
            },
            { merge: false },
          );
          await batch.commit();
        },
        {
          context: { op: 'profile.saveCategoryWithSync', uid: safeUid, categoryId: safeCategoryId },
        },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'profile.saveCategoryWithSync', uid: safeUid, categoryId: safeCategoryId } },
    );
    trackFirestoreWrite('profile.saveCategoryWithSync');
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'profile.saveCategoryWithSync', uid: safeUid, categoryId: safeCategoryId },
    });
  }
};

export const unsaveCategoryWithSync = async (categoryId: string, uid: string): Promise<void> => {
  const safeCategoryId = validate(firestoreIdSchema, categoryId, { context: { categoryId } });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });

  try {
    await withTimeout(
      withRetry(
        async () => {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'users', safeUid, 'savedCategories', safeCategoryId));
          await batch.commit();
        },
        {
          context: {
            op: 'profile.unsaveCategoryWithSync',
            uid: safeUid,
            categoryId: safeCategoryId,
          },
        },
      ),
      WRITE_TIMEOUT_MS,
      {
        context: { op: 'profile.unsaveCategoryWithSync', uid: safeUid, categoryId: safeCategoryId },
      },
    );
    trackFirestoreWrite('profile.unsaveCategoryWithSync');
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'profile.unsaveCategoryWithSync', uid: safeUid, categoryId: safeCategoryId },
    });
  }
};

export const sendFollowRequest = async (fromUid: string, toUid: string): Promise<string> => {
  const safeFromUid = validate(firestoreIdSchema, fromUid, { context: { fromUid } });
  const safeToUid = validate(firestoreIdSchema, toUid, { context: { toUid } });
  assertDifferentUids(safeFromUid, safeToUid, { fromUid: safeFromUid, toUid: safeToUid });

  try {
    return await withTimeout(
      withRetry(() => sendFollowRequestLegacy(safeFromUid, safeToUid), {
        context: { op: 'profile.sendFollowRequest', fromUid: safeFromUid, toUid: safeToUid },
      }),
      WRITE_TIMEOUT_MS,
      { context: { op: 'profile.sendFollowRequest', fromUid: safeFromUid, toUid: safeToUid } },
    );
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'profile.sendFollowRequest', fromUid: safeFromUid, toUid: safeToUid },
    });
  }
};

export const cancelFollowRequest = async (fromUid: string, toUid: string): Promise<void> => {
  const safeFromUid = validate(firestoreIdSchema, fromUid, { context: { fromUid } });
  const safeToUid = validate(firestoreIdSchema, toUid, { context: { toUid } });

  try {
    await withTimeout(
      withRetry(() => cancelFollowRequestLegacy(safeFromUid, safeToUid), {
        context: { op: 'profile.cancelFollowRequest', fromUid: safeFromUid, toUid: safeToUid },
      }),
      WRITE_TIMEOUT_MS,
      { context: { op: 'profile.cancelFollowRequest', fromUid: safeFromUid, toUid: safeToUid } },
    );
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'profile.cancelFollowRequest', fromUid: safeFromUid, toUid: safeToUid },
    });
  }
};

export const acceptFollowRequest = async (fromUid: string, toUid: string): Promise<void> => {
  const safeFromUid = validate(firestoreIdSchema, fromUid, { context: { fromUid } });
  const safeToUid = validate(firestoreIdSchema, toUid, { context: { toUid } });

  try {
    await withTimeout(
      withRetry(() => acceptFollowRequestLegacy(safeFromUid, safeToUid), {
        context: { op: 'profile.acceptFollowRequest', fromUid: safeFromUid, toUid: safeToUid },
      }),
      WRITE_TIMEOUT_MS,
      { context: { op: 'profile.acceptFollowRequest', fromUid: safeFromUid, toUid: safeToUid } },
    );
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'profile.acceptFollowRequest', fromUid: safeFromUid, toUid: safeToUid },
    });
  }
};

export const declineFollowRequest = async (fromUid: string, toUid: string): Promise<void> => {
  const safeFromUid = validate(firestoreIdSchema, fromUid, { context: { fromUid } });
  const safeToUid = validate(firestoreIdSchema, toUid, { context: { toUid } });

  try {
    await withTimeout(
      withRetry(() => declineFollowRequestLegacy(safeFromUid, safeToUid), {
        context: { op: 'profile.declineFollowRequest', fromUid: safeFromUid, toUid: safeToUid },
      }),
      WRITE_TIMEOUT_MS,
      { context: { op: 'profile.declineFollowRequest', fromUid: safeFromUid, toUid: safeToUid } },
    );
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'profile.declineFollowRequest', fromUid: safeFromUid, toUid: safeToUid },
    });
  }
};

export const followPublicUser = async (followerUid: string, targetUid: string): Promise<void> => {
  const safeFollowerUid = validate(firestoreIdSchema, followerUid, { context: { followerUid } });
  const safeTargetUid = validate(firestoreIdSchema, targetUid, { context: { targetUid } });
  assertDifferentUids(safeFollowerUid, safeTargetUid, {
    followerUid: safeFollowerUid,
    targetUid: safeTargetUid,
  });

  try {
    await withTimeout(
      withRetry(
        async () => {
          const batch = writeBatch(db);
          batch.set(
            doc(db, 'users', safeTargetUid, 'followers', safeFollowerUid),
            {
              uid: safeFollowerUid,
              createdAt: serverTimestamp(),
            },
            { merge: false },
          );
          batch.set(
            doc(db, 'users', safeFollowerUid, 'following', safeTargetUid),
            {
              uid: safeTargetUid,
              createdAt: serverTimestamp(),
            },
            { merge: false },
          );
          await batch.commit();
        },
        {
          context: {
            op: 'profile.followPublicUser',
            followerUid: safeFollowerUid,
            targetUid: safeTargetUid,
          },
        },
      ),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'profile.followPublicUser',
          followerUid: safeFollowerUid,
          targetUid: safeTargetUid,
        },
      },
    );
    trackFirestoreWrite('profile.followPublicUser', 2);
  } catch (error) {
    throw toAppError(error, {
      context: {
        op: 'profile.followPublicUser',
        followerUid: safeFollowerUid,
        targetUid: safeTargetUid,
      },
    });
  }
};

export const unfollowUser = async (followerUid: string, targetUid: string): Promise<void> => {
  const safeFollowerUid = validate(firestoreIdSchema, followerUid, { context: { followerUid } });
  const safeTargetUid = validate(firestoreIdSchema, targetUid, { context: { targetUid } });

  try {
    await withTimeout(
      withRetry(
        async () => {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'users', safeTargetUid, 'followers', safeFollowerUid));
          batch.delete(doc(db, 'users', safeFollowerUid, 'following', safeTargetUid));
          await batch.commit();
        },
        {
          context: {
            op: 'profile.unfollowUser',
            followerUid: safeFollowerUid,
            targetUid: safeTargetUid,
          },
        },
      ),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'profile.unfollowUser',
          followerUid: safeFollowerUid,
          targetUid: safeTargetUid,
        },
      },
    );
    trackFirestoreWrite('profile.unfollowUser', 2);
  } catch (error) {
    throw toAppError(error, {
      context: {
        op: 'profile.unfollowUser',
        followerUid: safeFollowerUid,
        targetUid: safeTargetUid,
      },
    });
  }
};

export const getOrCreateDirectConversation = async (
  uid1: string,
  uid2: string,
): Promise<string> => {
  const safeUid1 = validate(firestoreIdSchema, uid1, { context: { uid1 } });
  const safeUid2 = validate(firestoreIdSchema, uid2, { context: { uid2 } });
  assertDifferentUids(safeUid1, safeUid2, { uid1: safeUid1, uid2: safeUid2 });

  try {
    return await withTimeout(
      withRetry(() => getOrCreateDirectConversationLegacy(safeUid1, safeUid2), {
        context: { op: 'profile.getOrCreateDirectConversation', uid1: safeUid1, uid2: safeUid2 },
      }),
      WRITE_TIMEOUT_MS,
      { context: { op: 'profile.getOrCreateDirectConversation', uid1: safeUid1, uid2: safeUid2 } },
    );
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'profile.getOrCreateDirectConversation', uid1: safeUid1, uid2: safeUid2 },
    });
  }
};
