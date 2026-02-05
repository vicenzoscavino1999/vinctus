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

import type {
  CollaborationAuthorSnapshot,
  CollaborationRead,
  CreateCollaborationInput,
} from './types';

const READ_TIMEOUT_MS = 5000;
const WRITE_TIMEOUT_MS = 5000;

const firestoreIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !value.includes('/'), { message: 'Invalid Firestore ID' });

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable();

const collaborationModeSchema = z.enum(['virtual', 'presencial']);
const collaborationLevelSchema = z.enum(['principiante', 'intermedio', 'experto']);

const authorSnapshotSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  photoURL: nullableText(500),
});

const createCollaborationInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    context: z.string().trim().min(1).max(120),
    seekingRole: z.string().trim().min(1).max(80),
    mode: collaborationModeSchema,
    location: nullableText(120),
    level: collaborationLevelSchema,
    topic: nullableText(160),
    tags: z
      .array(z.string().trim().min(1).max(40))
      .max(6)
      .transform((value) => Array.from(new Set(value))),
  })
  .refine((input) => input.mode === 'virtual' || !!input.location, {
    message: 'Location is required for presencial mode',
    path: ['location'],
  });

const collaborationRequestInputSchema = z
  .object({
    collaborationId: firestoreIdSchema,
    collaborationTitle: z.string().trim().min(1).max(120),
    fromUid: firestoreIdSchema,
    toUid: firestoreIdSchema,
    message: nullableText(1000),
    fromUserName: nullableText(80),
    fromUserPhoto: nullableText(500),
  })
  .refine((input) => input.fromUid !== input.toUid, {
    message: 'Cannot send request to same user',
    path: ['toUid'],
  });

const requestStatusSchema = z.enum(['pending', 'accepted', 'rejected']);

export const createCollaboration = async (
  authorId: string,
  authorSnapshot: CollaborationAuthorSnapshot,
  input: CreateCollaborationInput,
): Promise<string> => {
  const safeAuthorId = validate(firestoreIdSchema, authorId, { context: { authorId } });
  const safeAuthorSnapshot = validate(authorSnapshotSchema, authorSnapshot, {
    context: { op: 'collaborations.createCollaboration', authorId: safeAuthorId },
  });
  const safeInput = validate(createCollaborationInputSchema, input, {
    context: { op: 'collaborations.createCollaboration', authorId: safeAuthorId },
  });

  const collaborationRef = doc(collection(db, 'collaborations'));

  try {
    await withTimeout(
      withRetry(
        () =>
          setDoc(
            collaborationRef,
            {
              title: safeInput.title,
              context: safeInput.context,
              seekingRole: safeInput.seekingRole,
              mode: safeInput.mode,
              location: safeInput.location,
              level: safeInput.level,
              topic: safeInput.topic,
              tags: safeInput.tags,
              authorId: safeAuthorId,
              authorSnapshot: safeAuthorSnapshot,
              status: 'open',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: false },
          ),
        { context: { op: 'collaborations.createCollaboration', authorId: safeAuthorId } },
      ),
      WRITE_TIMEOUT_MS,
      { context: { op: 'collaborations.createCollaboration', authorId: safeAuthorId } },
    );

    trackFirestoreWrite('collaborations.createCollaboration');
    return collaborationRef.id;
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'collaborations.createCollaboration', authorId: safeAuthorId },
    });
  }
};

export const updateCollaboration = async (
  collaborationId: string,
  input: CreateCollaborationInput,
): Promise<void> => {
  const safeCollaborationId = validate(firestoreIdSchema, collaborationId, {
    context: { collaborationId },
  });
  const safeInput = validate(createCollaborationInputSchema, input, {
    context: {
      op: 'collaborations.updateCollaboration',
      collaborationId: safeCollaborationId,
    },
  });

  try {
    await withTimeout(
      withRetry(
        () =>
          updateDoc(doc(db, 'collaborations', safeCollaborationId), {
            title: safeInput.title,
            context: safeInput.context,
            seekingRole: safeInput.seekingRole,
            mode: safeInput.mode,
            location: safeInput.location,
            level: safeInput.level,
            topic: safeInput.topic,
            tags: safeInput.tags,
            updatedAt: serverTimestamp(),
          }),
        {
          context: {
            op: 'collaborations.updateCollaboration',
            collaborationId: safeCollaborationId,
          },
        },
      ),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'collaborations.updateCollaboration',
          collaborationId: safeCollaborationId,
        },
      },
    );

    trackFirestoreWrite('collaborations.updateCollaboration');
  } catch (error) {
    throw toAppError(error, {
      context: {
        op: 'collaborations.updateCollaboration',
        collaborationId: safeCollaborationId,
      },
    });
  }
};

export const sendCollaborationRequest = async (input: {
  collaborationId: string;
  collaborationTitle: string;
  fromUid: string;
  toUid: string;
  message: string | null;
  fromUserName: string | null;
  fromUserPhoto: string | null;
}): Promise<string> => {
  const safeInput = validate(collaborationRequestInputSchema, input, {
    context: {
      op: 'collaborations.sendCollaborationRequest',
      collaborationId: input?.collaborationId,
    },
  });

  try {
    const existingQuery = query(
      collection(db, 'collaboration_requests'),
      where('fromUid', '==', safeInput.fromUid),
      where('collaborationId', '==', safeInput.collaborationId),
      limit(1),
    );

    const existingSnap = await withTimeout(
      withRetry(() => getDocs(existingQuery), {
        context: {
          op: 'collaborations.sendCollaborationRequest.existing',
          collaborationId: safeInput.collaborationId,
          fromUid: safeInput.fromUid,
        },
      }),
      READ_TIMEOUT_MS,
      {
        context: {
          op: 'collaborations.sendCollaborationRequest.existing',
          collaborationId: safeInput.collaborationId,
          fromUid: safeInput.fromUid,
        },
      },
    );

    trackFirestoreRead('collaborations.sendCollaborationRequest.existing', existingSnap.size);

    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      const existingData =
        typeof existingDoc.data() === 'object' && existingDoc.data() !== null
          ? (existingDoc.data() as Record<string, unknown>)
          : {};

      const status = validate(requestStatusSchema, existingData.status ?? 'pending', {
        context: { op: 'collaborations.sendCollaborationRequest.existingStatus' },
      });

      if (status === 'pending') {
        throw new AppError('VALIDATION_FAILED', 'Ya enviaste una solicitud para este proyecto.', {
          context: { collaborationId: safeInput.collaborationId, fromUid: safeInput.fromUid },
        });
      }

      if (status === 'accepted') {
        throw new AppError('VALIDATION_FAILED', 'Esta solicitud ya fue aceptada.', {
          context: { collaborationId: safeInput.collaborationId, fromUid: safeInput.fromUid },
        });
      }

      await withTimeout(
        withRetry(() => deleteDoc(existingDoc.ref), {
          context: {
            op: 'collaborations.sendCollaborationRequest.deleteRejected',
            collaborationId: safeInput.collaborationId,
            fromUid: safeInput.fromUid,
          },
        }),
        WRITE_TIMEOUT_MS,
        {
          context: {
            op: 'collaborations.sendCollaborationRequest.deleteRejected',
            collaborationId: safeInput.collaborationId,
            fromUid: safeInput.fromUid,
          },
        },
      );

      trackFirestoreWrite('collaborations.sendCollaborationRequest.deleteRejected');
    }

    const requestRef = doc(collection(db, 'collaboration_requests'));

    await withTimeout(
      withRetry(
        () =>
          setDoc(
            requestRef,
            {
              collaborationId: safeInput.collaborationId,
              collaborationTitle: safeInput.collaborationTitle,
              fromUid: safeInput.fromUid,
              toUid: safeInput.toUid,
              status: 'pending',
              message: safeInput.message,
              fromUserName: safeInput.fromUserName,
              fromUserPhoto: safeInput.fromUserPhoto,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: false },
          ),
        {
          context: {
            op: 'collaborations.sendCollaborationRequest.create',
            collaborationId: safeInput.collaborationId,
            fromUid: safeInput.fromUid,
          },
        },
      ),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'collaborations.sendCollaborationRequest.create',
          collaborationId: safeInput.collaborationId,
          fromUid: safeInput.fromUid,
        },
      },
    );

    trackFirestoreWrite('collaborations.sendCollaborationRequest.create');
    return requestRef.id;
  } catch (error) {
    throw toAppError(error, {
      context: {
        op: 'collaborations.sendCollaborationRequest',
        collaborationId: safeInput.collaborationId,
        fromUid: safeInput.fromUid,
      },
    });
  }
};

export const deleteCollaboration = async (
  authorId: string,
  collaborationId: string,
): Promise<void> => {
  const safeAuthorId = validate(firestoreIdSchema, authorId, { context: { authorId } });
  const safeCollaborationId = validate(firestoreIdSchema, collaborationId, {
    context: { collaborationId },
  });

  const collaborationRef = doc(db, 'collaborations', safeCollaborationId);

  try {
    const collaborationSnap = await withTimeout(
      withRetry(() => getDoc(collaborationRef), {
        context: {
          op: 'collaborations.deleteCollaboration.get',
          collaborationId: safeCollaborationId,
        },
      }),
      READ_TIMEOUT_MS,
      {
        context: {
          op: 'collaborations.deleteCollaboration.get',
          collaborationId: safeCollaborationId,
        },
      },
    );

    trackFirestoreRead('collaborations.deleteCollaboration.get');

    if (!collaborationSnap.exists()) {
      throw new AppError('NOT_FOUND', 'Proyecto no encontrado', {
        context: { collaborationId: safeCollaborationId },
      });
    }

    const collaborationData = collaborationSnap.data() as Partial<CollaborationRead>;
    if (collaborationData.authorId !== safeAuthorId) {
      throw new AppError('PERMISSION_DENIED', 'No puedes eliminar este proyecto', {
        context: {
          collaborationId: safeCollaborationId,
          authorId: safeAuthorId,
          ownerId: collaborationData.authorId,
        },
      });
    }

    const pendingRequestsQuery = query(
      collection(db, 'collaboration_requests'),
      where('collaborationId', '==', safeCollaborationId),
      where('toUid', '==', safeAuthorId),
      where('status', '==', 'pending'),
    );

    const pendingRequestsSnap = await withTimeout(
      withRetry(() => getDocs(pendingRequestsQuery), {
        context: {
          op: 'collaborations.deleteCollaboration.pendingRequests',
          collaborationId: safeCollaborationId,
        },
      }),
      READ_TIMEOUT_MS,
      {
        context: {
          op: 'collaborations.deleteCollaboration.pendingRequests',
          collaborationId: safeCollaborationId,
        },
      },
    );

    trackFirestoreRead(
      'collaborations.deleteCollaboration.pendingRequests',
      pendingRequestsSnap.size,
    );

    const batch = writeBatch(db);
    pendingRequestsSnap.docs.forEach((requestDoc) => {
      batch.update(requestDoc.ref, {
        status: 'rejected',
        updatedAt: serverTimestamp(),
      });
    });
    batch.delete(collaborationRef);

    await withTimeout(
      withRetry(() => batch.commit(), {
        context: {
          op: 'collaborations.deleteCollaboration.commit',
          collaborationId: safeCollaborationId,
        },
      }),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'collaborations.deleteCollaboration.commit',
          collaborationId: safeCollaborationId,
        },
      },
    );

    trackFirestoreWrite('collaborations.deleteCollaboration', pendingRequestsSnap.size + 1);
  } catch (error) {
    throw toAppError(error, {
      context: {
        op: 'collaborations.deleteCollaboration',
        collaborationId: safeCollaborationId,
        authorId: safeAuthorId,
      },
    });
  }
};

const updateRequestStatus = async (
  requestId: string,
  status: 'accepted' | 'rejected',
): Promise<void> => {
  const safeRequestId = validate(firestoreIdSchema, requestId, { context: { requestId } });

  try {
    const requestRef = doc(db, 'collaboration_requests', safeRequestId);

    const requestSnap = await withTimeout(
      withRetry(() => getDoc(requestRef), {
        context: { op: 'collaborations.updateRequestStatus.get', requestId: safeRequestId },
      }),
      READ_TIMEOUT_MS,
      { context: { op: 'collaborations.updateRequestStatus.get', requestId: safeRequestId } },
    );

    trackFirestoreRead('collaborations.updateRequestStatus.get');

    if (!requestSnap.exists()) {
      throw new AppError('NOT_FOUND', 'Solicitud no encontrada', {
        context: { requestId: safeRequestId },
      });
    }

    const currentStatus =
      (requestSnap.data() as { status?: unknown } | undefined)?.status ?? 'pending';

    if (currentStatus === status) return;

    await withTimeout(
      withRetry(
        () =>
          updateDoc(requestRef, {
            status,
            updatedAt: serverTimestamp(),
          }),
        {
          context: {
            op: 'collaborations.updateRequestStatus.update',
            requestId: safeRequestId,
            status,
          },
        },
      ),
      WRITE_TIMEOUT_MS,
      {
        context: {
          op: 'collaborations.updateRequestStatus.update',
          requestId: safeRequestId,
          status,
        },
      },
    );

    trackFirestoreWrite('collaborations.updateRequestStatus');
  } catch (error) {
    throw toAppError(error, {
      context: { op: 'collaborations.updateRequestStatus', requestId: safeRequestId, status },
    });
  }
};

export const acceptCollaborationRequest = async (requestId: string): Promise<void> => {
  await updateRequestStatus(requestId, 'accepted');
};

export const rejectCollaborationRequest = async (requestId: string): Promise<void> => {
  await updateRequestStatus(requestId, 'rejected');
};
