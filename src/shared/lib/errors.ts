const APP_ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'PERMISSION_DENIED',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'TIMEOUT',
  'NETWORK',
  'UNKNOWN',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

type ErrorContext = Record<string, unknown>;

const APP_ERROR_CODE_SET = new Set<string>(APP_ERROR_CODES);

const FIREBASE_TO_APP_ERROR: Record<string, AppErrorCode> = {
  unauthenticated: 'NOT_AUTHENTICATED',
  'auth/id-token-expired': 'NOT_AUTHENTICATED',
  'auth/invalid-user-token': 'NOT_AUTHENTICATED',
  'auth/user-token-expired': 'NOT_AUTHENTICATED',
  'permission-denied': 'PERMISSION_DENIED',
  'auth/insufficient-permission': 'PERMISSION_DENIED',
  'not-found': 'NOT_FOUND',
  'auth/user-not-found': 'NOT_FOUND',
  'invalid-argument': 'VALIDATION_FAILED',
  'failed-precondition': 'VALIDATION_FAILED',
  'auth/invalid-email': 'VALIDATION_FAILED',
  'auth/weak-password': 'VALIDATION_FAILED',
  'deadline-exceeded': 'TIMEOUT',
  unavailable: 'NETWORK',
  'network-request-failed': 'NETWORK',
};

const readErrorCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  if (!('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.trim().length > 0 ? code : null;
};

const readMessage = (error: unknown): string => {
  if (
    error instanceof Error &&
    typeof error.message === 'string' &&
    error.message.trim().length > 0
  ) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  return 'Unexpected error';
};

const mapToAppErrorCode = (code: string | null): AppErrorCode => {
  if (!code) return 'UNKNOWN';
  const normalized = code.trim();
  if (APP_ERROR_CODE_SET.has(normalized)) return normalized as AppErrorCode;
  return FIREBASE_TO_APP_ERROR[normalized] ?? 'UNKNOWN';
};

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly context: ErrorContext;
  public readonly cause: unknown;

  constructor(
    message: string,
    code: AppErrorCode = 'UNKNOWN',
    context: ErrorContext = {},
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.context = context;
    this.cause = options?.cause;
  }
}

export const isAppError = (error: unknown): error is AppError => {
  if (error instanceof AppError) return true;
  if (typeof error !== 'object' || error === null) return false;

  const candidate = error as { name?: unknown; code?: unknown };
  return (
    candidate.name === 'AppError' &&
    typeof candidate.code === 'string' &&
    APP_ERROR_CODE_SET.has(candidate.code)
  );
};

export const toAppError = (
  error: unknown,
  context: ErrorContext = {},
  fallbackCode: AppErrorCode = 'UNKNOWN',
): AppError => {
  if (isAppError(error)) {
    return new AppError(
      error.message,
      error.code,
      { ...error.context, ...context },
      { cause: error.cause },
    );
  }

  const codeFromSource = mapToAppErrorCode(readErrorCode(error));
  const resolvedCode = codeFromSource === 'UNKNOWN' ? fallbackCode : codeFromSource;

  return new AppError(readMessage(error), resolvedCode, context, { cause: error });
};
