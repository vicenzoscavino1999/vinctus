import { AppError, toAppError, type AppErrorContext } from './errors';

type TimeoutOptions = {
  message?: string;
  context?: AppErrorContext;
};

export const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
  options?: TimeoutOptions,
): Promise<T> => {
  if (!Number.isFinite(ms) || ms < 1) {
    throw new AppError('VALIDATION_FAILED', 'Invalid timeout', { context: { ms } });
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new AppError('TIMEOUT', options?.message ?? `Timed out after ${ms}ms`, {
          context: { ...options?.context, ms },
        }),
      );
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export type RetryOptions = {
  retries?: number;
  backoff?: number;
  maxBackoffMs?: number;
  retryableCodes?: readonly string[];
  context?: AppErrorContext;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const withRetry = async <T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> => {
  const retries = options?.retries ?? 2;
  const baseBackoff = options?.backoff ?? 250;
  const maxBackoffMs = options?.maxBackoffMs ?? 4000;

  if (!Number.isInteger(retries) || retries < 0) {
    throw new AppError('VALIDATION_FAILED', 'Invalid retries', { context: { retries } });
  }

  const retryable = new Set(
    options?.retryableCodes ?? [
      'NETWORK',
      'TIMEOUT',
      'unavailable',
      'deadline-exceeded',
      'resource-exhausted',
      'aborted',
    ],
  );

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const appError = toAppError(error, { context: options?.context });

      const externalCode =
        typeof appError.context?.externalCode === 'string' ? appError.context.externalCode : null;

      const shouldRetry =
        attempt < retries &&
        (retryable.has(appError.code) || (externalCode ? retryable.has(externalCode) : false));

      if (!shouldRetry) {
        throw appError;
      }

      const delayMs = Math.min(maxBackoffMs, baseBackoff * 2 ** attempt);
      await sleep(delayMs);
    }
  }

  throw new AppError('UNKNOWN', 'Retry loop exited unexpectedly');
};
