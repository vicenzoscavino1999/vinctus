export { getOrCreateGroupConversation } from '@/features/chat/api/mutations';

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/shared/lib/firebase';
import { trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';
import { AppError, toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate, z } from '@/shared/lib/validators';

import type { CreateGroupInput, GroupJoinRequestRead, GroupVisibility } from './types';

const READ_TIMEOUT_MS = 5000;
const WRITE_TIMEOUT_MS = 5000;

const isValidFirestoreId = (value: string): boolean => !value.includes('/');

const firestoreIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(isValidFirestoreId, { message: 'Invalid Firestore ID' });

const shortIdSchema = z.string().trim().min(1).max(80).refine(isValidFirestoreId, {
  message: 'Invalid ID',
});

const nullableStringSchema = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable();

const groupVisibilitySchema = z.enum(['public', 'private']) satisfies z.ZodType<GroupVisibility>;

const groupMemberRoleSchema = z.enum(['member', 'moderator', 'admin']);

const createGroupInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(600),
  categoryId: shortIdSchema.nullable(),
  visibility: groupVisibilitySchema,
  iconUrl: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable(),
});

const joinRequestInputSchema = z
  .object({
    groupId: firestoreIdSchema,
    groupName: z.string().trim().min(1).max(120),
    fromUid: firestoreIdSchema,
    toUid: firestoreIdSchema,
    message: z
      .string()
      .trim()
      .max(1000)
      .transform((value) => (value.length > 0 ? value : null))
      .nullable(),
    fromUserName: z
      .string()
      .trim()
      .max(80)
      .transform((value) => (value.length > 0 ? value : null))
      .nullable(),
    fromUserPhoto: nullableStringSchema,
  })
  .refine((value) => value.fromUid !== value.toUid, { message: 'Invalid join request (same uid)' });

export const createGroup = async (ownerId: string, input: CreateGroupInput): Promise<string> => {
  const safeOwnerId = validate(firestoreIdSchema, ownerId, { context: { ownerId } });
  const safeInput = validate(createGroupInputSchema, input, {
    context: { op: 'groups.createGroup', ownerId: safeOwnerId },
  });

  const groupRef = doc(collection(db, 'groups'));
  const groupId = groupRef.id;
  const memberRef = doc(db, 'groups', groupId, 'members', safeOwnerId);
  const membershipRef = doc(db, 'users', safeOwnerId, 'memberships', groupId);

  try {
    await withTimeout(
      withRetry(
        () =>
          setDoc(groupRef, {
            name: safeInput.name,
            description: safeInput.description,
            categoryId: safeInput.categoryId,
            visibility: safeInput.visibility,
            ownerId: safeOwnerId,
            iconUrl: safeInput.iconUrl,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        { context: { op: 'groups.createGroup.group', ownerId: safeOwnerId } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'groups.createGroup.group', ownerId: safeOwnerId } },
    );

    const batch = writeBatch(db);
    batch.set(
      memberRef,
      {
        uid: safeOwnerId,
        groupId,
        role: 'admin',
        joinedAt: serverTimestamp(),
      },
      { merge: false },
    );
    batch.set(
      membershipRef,
      {
        groupId,
        joinedAt: serverTimestamp(),
      },
      { merge: false },
    );

    await withTimeout(
      withRetry(() => batch.commit(), {
        context: { op: 'groups.createGroup.members', groupId, ownerId: safeOwnerId },
      }),
      WRITE_TIMEOUT_MS,
      { context: { op: 'groups.createGroup.members', groupId, ownerId: safeOwnerId } },
    );

    trackFirestoreWrite('groups.createGroup', 3);
    return groupId;
  } catch (error) {
    await deleteDoc(groupRef).catch(() => {});
    throw toAppError(error, { context: { op: 'groups.createGroup', ownerId: safeOwnerId } });
  }
};

export const updateGroup = async (groupId: string, input: CreateGroupInput): Promise<void> => {
  const safeGroupId = validate(firestoreIdSchema, groupId, { context: { groupId } });
  const safeInput = validate(createGroupInputSchema, input, {
    context: { op: 'groups.updateGroup', groupId: safeGroupId },
  });

  try {
    await withTimeout(
      withRetry(
        () =>
          updateDoc(doc(db, 'groups', safeGroupId), {
            name: safeInput.name,
            description: safeInput.description,
            categoryId: safeInput.categoryId,
            visibility: safeInput.visibility,
            iconUrl: safeInput.iconUrl,
            updatedAt: serverTimestamp(),
          }),
        { context: { op: 'groups.updateGroup', groupId: safeGroupId } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'groups.updateGroup', groupId: safeGroupId } },
    );

    trackFirestoreWrite('groups.updateGroup', 1);
  } catch (error) {
    throw toAppError(error, { context: { op: 'groups.updateGroup', groupId: safeGroupId } });
  }
};

export const joinGroupWithSync = async (groupId: string, uid: string): Promise<void> => {
  const safeGroupId = validate(firestoreIdSchema, groupId, { context: { groupId } });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });

  const memberRef = doc(db, 'groups', safeGroupId, 'members', safeUid);
  const membershipRef = doc(db, 'users', safeUid, 'memberships', safeGroupId);

  const batch = writeBatch(db);
  batch.set(
    memberRef,
    {
      uid: safeUid,
      groupId: safeGroupId,
      role: 'member',
      joinedAt: serverTimestamp(),
    },
    { merge: false },
  );
  batch.set(
    membershipRef,
    {
      groupId: safeGroupId,
      joinedAt: serverTimestamp(),
    },
    { merge: false },
  );

  try {
    await withTimeout(
      withRetry(() => batch.commit(), {
        context: { op: 'groups.joinGroupWithSync', groupId: safeGroupId, uid: safeUid },
      }),
      WRITE_TIMEOUT_MS,
      { context: { op: 'groups.joinGroupWithSync', groupId: safeGroupId, uid: safeUid } },
    );

    trackFirestoreWrite('groups.joinGroupWithSync', 2);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'groups.joinGroupWithSync', groupId: safeGroupId, uid: safeUid },
    });
  }
};

export const leaveGroupWithSync = async (groupId: string, uid: string): Promise<void> => {
  const safeGroupId = validate(firestoreIdSchema, groupId, { context: { groupId } });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });

  const memberRef = doc(db, 'groups', safeGroupId, 'members', safeUid);
  const membershipRef = doc(db, 'users', safeUid, 'memberships', safeGroupId);

  const batch = writeBatch(db);
  batch.delete(memberRef);
  batch.delete(membershipRef);

  try {
    await withTimeout(
      withRetry(() => batch.commit(), {
        context: { op: 'groups.leaveGroupWithSync', groupId: safeGroupId, uid: safeUid },
      }),
      WRITE_TIMEOUT_MS,
      { context: { op: 'groups.leaveGroupWithSync', groupId: safeGroupId, uid: safeUid } },
    );

    trackFirestoreWrite('groups.leaveGroupWithSync', 2);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'groups.leaveGroupWithSync', groupId: safeGroupId, uid: safeUid },
    });
  }
};

export const joinPublicGroup = async (groupId: string, uid: string): Promise<void> => {
  const safeGroupId = validate(firestoreIdSchema, groupId, { context: { groupId } });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });

  try {
    const groupSnap = await withTimeout(
      withRetry(() => getDoc(doc(db, 'groups', safeGroupId)), {
        context: { op: 'groups.joinPublicGroup.getGroup', groupId: safeGroupId },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'groups.joinPublicGroup.getGroup', groupId: safeGroupId } },
    );

    trackFirestoreRead('groups.joinPublicGroup.getGroup');

    if (!groupSnap.exists()) {
      throw new AppError('NOT_FOUND', 'Grupo no encontrado', { context: { groupId: safeGroupId } });
    }

    const visibility = (groupSnap.data() as { visibility?: unknown } | undefined)?.visibility;
    if (visibility !== 'public') {
      throw new AppError('PERMISSION_DENIED', 'Este grupo es privado', {
        context: { groupId: safeGroupId, visibility },
      });
    }

    await joinGroupWithSync(safeGroupId, safeUid);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'groups.joinPublicGroup', groupId: safeGroupId, uid: safeUid },
    });
  }
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
  const safe = validate(joinRequestInputSchema, input, {
    context: { op: 'groups.sendGroupJoinRequest', groupId: input?.groupId },
  });

  try {
    const existingQuery = query(
      collection(db, 'group_requests'),
      where('fromUid', '==', safe.fromUid),
      where('groupId', '==', safe.groupId),
      limit(1),
    );

    const existing = await withTimeout(
      withRetry(() => getDocs(existingQuery), {
        context: {
          op: 'groups.sendGroupJoinRequest.existing',
          groupId: safe.groupId,
          fromUid: safe.fromUid,
        },
      }),
      READ_TIMEOUT_MS,
      {
        context: {
          op: 'groups.sendGroupJoinRequest.existing',
          groupId: safe.groupId,
          fromUid: safe.fromUid,
        },
      },
    );

    trackFirestoreRead('groups.sendGroupJoinRequest.existing', existing.size);

    if (!existing.empty) {
      const data = existing.docs[0].data() as Partial<GroupJoinRequestRead> & { status?: unknown };
      if (data.status === 'pending') {
        throw new AppError('VALIDATION_FAILED', 'Ya enviaste una solicitud para este grupo.', {
          context: { groupId: safe.groupId, fromUid: safe.fromUid },
        });
      }
      if (data.status === 'accepted') {
        throw new AppError('VALIDATION_FAILED', 'Ya eres miembro de este grupo.', {
          context: { groupId: safe.groupId, fromUid: safe.fromUid },
        });
      }
    }

    const requestRef = doc(collection(db, 'group_requests'));
    await withTimeout(
      withRetry(
        () =>
          setDoc(requestRef, {
            groupId: safe.groupId,
            groupName: safe.groupName,
            fromUid: safe.fromUid,
            toUid: safe.toUid,
            status: 'pending',
            message: safe.message,
            fromUserName: safe.fromUserName,
            fromUserPhoto: safe.fromUserPhoto,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        {
          context: {
            op: 'groups.sendGroupJoinRequest.create',
            groupId: safe.groupId,
            fromUid: safe.fromUid,
          },
        },
      ),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'groups.sendGroupJoinRequest.create',
          groupId: safe.groupId,
          fromUid: safe.fromUid,
        },
      },
    );

    trackFirestoreWrite('groups.sendGroupJoinRequest', 1);
    return requestRef.id;
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'groups.sendGroupJoinRequest', groupId: safe.groupId, fromUid: safe.fromUid },
    });
  }
};

export const acceptGroupJoinRequest = async (requestId: string): Promise<void> => {
  const safeRequestId = validate(firestoreIdSchema, requestId, { context: { requestId } });

  try {
    const requestRef = doc(db, 'group_requests', safeRequestId);
    const requestSnap = await withTimeout(
      withRetry(() => getDoc(requestRef), {
        context: { op: 'groups.acceptGroupJoinRequest.get', requestId: safeRequestId },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'groups.acceptGroupJoinRequest.get', requestId: safeRequestId } },
    );

    trackFirestoreRead('groups.acceptGroupJoinRequest.get');

    if (!requestSnap.exists()) {
      throw new AppError('NOT_FOUND', 'Solicitud no encontrada', {
        context: { requestId: safeRequestId },
      });
    }

    const data = requestSnap.data() as Partial<GroupJoinRequestRead> & Record<string, unknown>;
    if (data.status !== 'pending') return;

    const groupId = typeof data.groupId === 'string' ? data.groupId : null;
    const memberUid = typeof data.fromUid === 'string' ? data.fromUid : null;

    if (!groupId || !memberUid) {
      throw new AppError('UNKNOWN', 'Solicitud invalida', {
        context: { requestId: safeRequestId },
      });
    }

    const memberRef = doc(db, 'groups', groupId, 'members', memberUid);
    const membershipRef = doc(db, 'users', memberUid, 'memberships', groupId);

    const batch = writeBatch(db);
    batch.update(requestRef, {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });
    batch.set(
      memberRef,
      {
        uid: memberUid,
        groupId,
        role: 'member',
        joinedAt: serverTimestamp(),
      },
      { merge: false },
    );
    batch.set(
      membershipRef,
      {
        groupId,
        joinedAt: serverTimestamp(),
      },
      { merge: false },
    );

    await withTimeout(
      withRetry(() => batch.commit(), {
        context: {
          op: 'groups.acceptGroupJoinRequest.commit',
          requestId: safeRequestId,
          groupId,
          memberUid,
        },
      }),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'groups.acceptGroupJoinRequest.commit',
          requestId: safeRequestId,
          groupId,
          memberUid,
        },
      },
    );

    trackFirestoreWrite('groups.acceptGroupJoinRequest', 3);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'groups.acceptGroupJoinRequest', requestId: safeRequestId },
    });
  }
};

export const rejectGroupJoinRequest = async (requestId: string): Promise<void> => {
  const safeRequestId = validate(firestoreIdSchema, requestId, { context: { requestId } });

  try {
    await withTimeout(
      withRetry(
        () =>
          updateDoc(doc(db, 'group_requests', safeRequestId), {
            status: 'rejected',
            updatedAt: serverTimestamp(),
          }),
        { context: { op: 'groups.rejectGroupJoinRequest', requestId: safeRequestId } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'groups.rejectGroupJoinRequest', requestId: safeRequestId } },
    );

    trackFirestoreWrite('groups.rejectGroupJoinRequest', 1);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'groups.rejectGroupJoinRequest', requestId: safeRequestId },
    });
  }
};

export const updateGroupMemberRole = async (
  groupId: string,
  uid: string,
  role: 'member' | 'moderator' | 'admin',
): Promise<void> => {
  const safeGroupId = validate(firestoreIdSchema, groupId, { context: { groupId } });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });
  const safeRole = validate(groupMemberRoleSchema, role, { context: { role } });

  try {
    await withTimeout(
      withRetry(
        () => updateDoc(doc(db, 'groups', safeGroupId, 'members', safeUid), { role: safeRole }),
        { context: { op: 'groups.updateGroupMemberRole', groupId: safeGroupId, uid: safeUid } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'groups.updateGroupMemberRole', groupId: safeGroupId, uid: safeUid } },
    );

    trackFirestoreWrite('groups.updateGroupMemberRole', 1);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'groups.updateGroupMemberRole', groupId: safeGroupId, uid: safeUid },
    });
  }
};

export const removeGroupMember = async (groupId: string, uid: string): Promise<void> => {
  const safeGroupId = validate(firestoreIdSchema, groupId, { context: { groupId } });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });

  const memberRef = doc(db, 'groups', safeGroupId, 'members', safeUid);
  const membershipRef = doc(db, 'users', safeUid, 'memberships', safeGroupId);

  const batch = writeBatch(db);
  batch.delete(memberRef);
  batch.delete(membershipRef);

  try {
    await withTimeout(
      withRetry(() => batch.commit(), {
        context: { op: 'groups.removeGroupMember', groupId: safeGroupId, uid: safeUid },
      }),
      WRITE_TIMEOUT_MS,
      { context: { op: 'groups.removeGroupMember', groupId: safeGroupId, uid: safeUid } },
    );

    trackFirestoreWrite('groups.removeGroupMember', 2);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'groups.removeGroupMember', groupId: safeGroupId, uid: safeUid },
    });
  }
};

export const addGroupMember = async (
  groupId: string,
  uid: string,
  role: 'member' | 'moderator' | 'admin' = 'member',
): Promise<void> => {
  const safeGroupId = validate(firestoreIdSchema, groupId, { context: { groupId } });
  const safeUid = validate(firestoreIdSchema, uid, { context: { uid } });
  const safeRole = validate(groupMemberRoleSchema, role, { context: { role } });

  const memberRef = doc(db, 'groups', safeGroupId, 'members', safeUid);
  const membershipRef = doc(db, 'users', safeUid, 'memberships', safeGroupId);

  try {
    const batch = writeBatch(db);
    batch.set(
      memberRef,
      {
        uid: safeUid,
        groupId: safeGroupId,
        role: safeRole,
        joinedAt: serverTimestamp(),
      },
      { merge: false },
    );
    batch.set(
      membershipRef,
      {
        groupId: safeGroupId,
        joinedAt: serverTimestamp(),
      },
      { merge: false },
    );

    await withTimeout(
      withRetry(() => batch.commit(), {
        context: { op: 'groups.addGroupMember', groupId: safeGroupId, uid: safeUid },
      }),
      WRITE_TIMEOUT_MS,
      { context: { op: 'groups.addGroupMember', groupId: safeGroupId, uid: safeUid } },
    );

    trackFirestoreWrite('groups.addGroupMember', 2);
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'groups.addGroupMember', groupId: safeGroupId, uid: safeUid },
    });
  }
};
