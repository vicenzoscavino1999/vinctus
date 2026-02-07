import {
  acceptCollaborationRequest as acceptCollaborationRequestRaw,
  createCollaboration as createCollaborationRaw,
  deleteCollaboration as deleteCollaborationRaw,
  rejectCollaborationRequest as rejectCollaborationRequestRaw,
  sendCollaborationRequest as sendCollaborationRequestRaw,
  updateCollaboration as updateCollaborationRaw,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate } from '@/shared/lib/validators';
import {
  collaborationAuthorSnapshotSchema,
  collaborationIdSchema,
  collaborationRequestIdSchema,
  createCollaborationInputSchema,
  sendCollaborationRequestInputSchema,
  uidSchema,
  type CollaborationAuthorSnapshot,
  type CreateCollaborationInput,
} from '@/features/collaborations/api/types';

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

const normalizeTags = (tags: string[]): string[] => {
  const cleaned = tags
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, 6);
  return Array.from(new Set(cleaned));
};

const normalizeCreateInput = (input: CreateCollaborationInput): CreateCollaborationInput => ({
  ...input,
  title: input.title.trim(),
  context: input.context.trim(),
  seekingRole: input.seekingRole.trim(),
  location: normalizeNullableText(input.location),
  topic: normalizeNullableText(input.topic),
  tags: normalizeTags(input.tags),
});

export const createCollaboration = async (
  authorId: string,
  authorSnapshot: CollaborationAuthorSnapshot,
  input: CreateCollaborationInput,
): Promise<string> => {
  const safeAuthorId = validate(uidSchema, authorId, { field: 'authorId' });
  const safeAuthorSnapshot = validate(collaborationAuthorSnapshotSchema, authorSnapshot, {
    field: 'authorSnapshot',
  });
  const safeInput = validate(createCollaborationInputSchema, normalizeCreateInput(input), {
    field: 'input',
  });
  return runWrite('collaborations.createCollaboration', () =>
    createCollaborationRaw(safeAuthorId, safeAuthorSnapshot, safeInput),
  );
};

export const updateCollaboration = async (
  collaborationId: string,
  input: CreateCollaborationInput,
): Promise<void> => {
  const safeCollaborationId = validate(collaborationIdSchema, collaborationId, {
    field: 'collaborationId',
  });
  const safeInput = validate(createCollaborationInputSchema, normalizeCreateInput(input), {
    field: 'input',
  });
  return runWrite('collaborations.updateCollaboration', () =>
    updateCollaborationRaw(safeCollaborationId, safeInput),
  );
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
  const safeInput = validate(sendCollaborationRequestInputSchema, input, { field: 'input' });
  const normalizedInput = {
    ...safeInput,
    collaborationTitle: safeInput.collaborationTitle.trim(),
    message: normalizeNullableText(safeInput.message),
    fromUserName: normalizeNullableText(safeInput.fromUserName),
    fromUserPhoto: safeInput.fromUserPhoto ?? null,
  };
  return runWrite('collaborations.sendCollaborationRequest', () =>
    sendCollaborationRequestRaw(normalizedInput),
  );
};

export const deleteCollaboration = async (
  authorId: string,
  collaborationId: string,
): Promise<void> => {
  const safeAuthorId = validate(uidSchema, authorId, { field: 'authorId' });
  const safeCollaborationId = validate(collaborationIdSchema, collaborationId, {
    field: 'collaborationId',
  });
  return runWrite('collaborations.deleteCollaboration', () =>
    deleteCollaborationRaw(safeAuthorId, safeCollaborationId),
  );
};

export const acceptCollaborationRequest = async (requestId: string): Promise<void> => {
  const safeRequestId = validate(collaborationRequestIdSchema, requestId, { field: 'requestId' });
  return runWrite('collaborations.acceptCollaborationRequest', () =>
    acceptCollaborationRequestRaw(safeRequestId),
  );
};

export const rejectCollaborationRequest = async (requestId: string): Promise<void> => {
  const safeRequestId = validate(collaborationRequestIdSchema, requestId, { field: 'requestId' });
  return runWrite('collaborations.rejectCollaborationRequest', () =>
    rejectCollaborationRequestRaw(safeRequestId),
  );
};
