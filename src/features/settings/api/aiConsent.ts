import { z } from 'zod';
import {
  getServerAIConsent as getServerAIConsentRaw,
  setServerAIConsent as setServerAIConsentRaw,
  type AIConsentSource,
  type ServerAIConsentRead,
} from '@/shared/lib/firestore';
import { toAppError } from '@/shared/lib/errors';
import { withRetry, withTimeout } from '@/shared/lib/firebase-helpers';
import { validate } from '@/shared/lib/validators';
import { uidSchema } from '@/features/settings/api/types';

const READ_TIMEOUT_MS = 5000;
const WRITE_TIMEOUT_MS = 7000;
const READ_RETRYABLE_CODES = [
  'TIMEOUT',
  'NETWORK',
  'deadline-exceeded',
  'unavailable',
  'aborted',
] as const;
const WRITE_RETRYABLE_CODES = [
  'TIMEOUT',
  'NETWORK',
  'deadline-exceeded',
  'unavailable',
  'aborted',
  'resource-exhausted',
] as const;

const aiConsentSourceSchema = z.enum(['settings', 'ai_chat', 'arena', 'migration']);
const serverAiConsentReadSchema = z.object({
  granted: z.boolean(),
  recorded: z.boolean(),
  source: aiConsentSourceSchema.nullable(),
  updatedAt: z.date().nullable(),
});

const runRead = async <T>(operation: string, fn: () => Promise<T>): Promise<T> => {
  try {
    return await withRetry(() => withTimeout(fn(), READ_TIMEOUT_MS, { operation }), {
      retries: 2,
      backoffMs: 150,
      retryableCodes: READ_RETRYABLE_CODES,
    });
  } catch (error) {
    throw toAppError(error, { operation });
  }
};

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

export const getServerAIConsent = async (uid: string): Promise<ServerAIConsentRead> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  return runRead('settings.getServerAIConsent', async () => {
    const consent = await getServerAIConsentRaw(safeUid);
    return validate(serverAiConsentReadSchema, consent, { field: 'consent' });
  });
};

export const updateServerAIConsent = async (
  uid: string,
  granted: boolean,
  source: AIConsentSource = 'settings',
): Promise<void> => {
  const safeUid = validate(uidSchema, uid, { field: 'uid' });
  const safeGranted = validate(z.boolean(), granted, { field: 'granted' });
  const safeSource = validate(aiConsentSourceSchema, source, { field: 'source' });
  return runWrite('settings.updateServerAIConsent', () =>
    setServerAIConsentRaw(safeUid, { granted: safeGranted, source: safeSource }),
  );
};
