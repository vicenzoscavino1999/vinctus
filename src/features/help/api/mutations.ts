import { createSupportTicket as createSupportTicketRaw } from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate } from '@/shared/lib/validators';
import {
  createSupportTicketInputSchema,
  type CreateSupportTicketInput,
} from '@/features/help/api/types';

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

export const createSupportTicket = async (input: CreateSupportTicketInput): Promise<string> => {
  const safeInput = validate(createSupportTicketInputSchema, input, { field: 'input' });
  const normalizedInput = {
    ...safeInput,
    email: normalizeNullableText(safeInput.email),
    title: safeInput.title.trim(),
    message: safeInput.message.trim(),
    appVersion: safeInput.appVersion.trim(),
  };
  return runWrite('help.createSupportTicket', () => createSupportTicketRaw(normalizedInput));
};
