import { writeBatch, type Firestore, type WriteBatch } from 'firebase/firestore';
import { AppError, type AppErrorCode, toAppError } from '@/shared/lib/errors';

const DEFAULT_RETRYABLE_CODES = [
  'TIMEOUT',
  'NETWORK',
  'deadline-exceeded',
  'aborted',
  'unavailable',
  'resource-exhausted',
  'network-request-failed',
] as const;

type RetryableCode = AppErrorCode | (typeof DEFAULT_RETRYABLE_CODES)[number];

type RetryOptions = {
  retries?: number;
  backoffMs?: number;
  maxBackoffMs?: number;
  retryableCodes?: readonly RetryableCode[];
};

export type BatchOperation = (batch: WriteBatch) => void;

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const readSourceCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  if (!('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
};

const isRetryable = (error: unknown, retryableCodeSet: Set<string>): boolean => {
  if (error instanceof AppError && retryableCodeSet.has(error.code)) return true;

  const normalizedCode = toAppError(error).code;
  if (retryableCodeSet.has(normalizedCode)) return true;

  const sourceCode = readSourceCode(error);
  return sourceCode !== null && retryableCodeSet.has(sourceCode);
};

export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs = 5000,
  context: Record<string, unknown> = {},
): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new AppError('Invalid timeout value', 'VALIDATION_FAILED', { timeoutMs, ...context });
  }

  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new AppError(`Operation timed out after ${timeoutMs}ms`, 'TIMEOUT', context));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const withRetry = async <T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> => {
  const retries = Math.max(0, Math.trunc(options.retries ?? 2));
  const backoffMs = Math.max(0, Math.trunc(options.backoffMs ?? 200));
  const maxBackoffMs = Math.max(backoffMs, Math.trunc(options.maxBackoffMs ?? 2000));
  const retryableCodes = new Set<string>(options.retryableCodes ?? DEFAULT_RETRYABLE_CODES);

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= retries || !isRetryable(error, retryableCodes)) {
        throw toAppError(error, { attempt, retries });
      }

      const waitMs = Math.min(maxBackoffMs, backoffMs * 2 ** attempt);
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    }
  }

  throw toAppError(lastError);
};

export const batchWrite = async (
  firestore: Firestore,
  operations: readonly BatchOperation[],
): Promise<void> => {
  if (operations.length === 0) return;

  const batch = writeBatch(firestore);
  operations.forEach((operation) => operation(batch));
  await batch.commit();
};
