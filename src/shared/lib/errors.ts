export type AppErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'UNKNOWN';

export type AppErrorContext = Record<string, unknown>;

type AppErrorOptions = {
  context?: AppErrorContext;
  cause?: unknown;
};

const mapExternalCode = (code: unknown): AppErrorCode | null => {
  if (typeof code !== 'string') return null;

  switch (code) {
    case 'unauthenticated':
      return 'NOT_AUTHENTICATED';
    case 'permission-denied':
      return 'PERMISSION_DENIED';
    case 'not-found':
      return 'NOT_FOUND';
    case 'deadline-exceeded':
      return 'TIMEOUT';
    case 'unavailable':
      return 'NETWORK';
    default:
      return null;
  }
};

const extractExternalCode = (value: unknown): string | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  if (!('code' in value)) return undefined;
  const code = (value as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
};

const extractMessage = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message || value.name;

  if (typeof value === 'object' && value !== null && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }

  return null;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly context?: AppErrorContext;
  readonly cause?: unknown;

  constructor(code: AppErrorCode, message: string, options?: AppErrorOptions) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.context = options?.context;
    this.cause = options?.cause;
  }
}

export const isAppError = (value: unknown): value is AppError => {
  if (value instanceof AppError) return true;
  if (typeof value !== 'object' || value === null) return false;
  if (!('name' in value) || !('code' in value) || !('message' in value)) return false;
  return (value as { name?: unknown }).name === 'AppError';
};

export const toAppError = (
  error: unknown,
  fallback?: { code?: AppErrorCode; message?: string; context?: AppErrorContext },
): AppError => {
  if (isAppError(error)) return error;

  const externalCode = extractExternalCode(error);
  const mapped = mapExternalCode(externalCode);

  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? (error as { name?: unknown }).name
      : undefined;

  const codeFromName: AppErrorCode | null =
    name === 'AbortError' ? 'TIMEOUT' : name === 'TimeoutError' ? 'TIMEOUT' : null;

  const code = mapped ?? codeFromName ?? fallback?.code ?? 'UNKNOWN';
  const message = extractMessage(error) ?? fallback?.message ?? 'Unknown error';

  const context: AppErrorContext | undefined =
    externalCode || fallback?.context
      ? {
          ...(externalCode ? { externalCode } : null),
          ...(fallback?.context ?? null),
        }
      : undefined;

  return new AppError(code, message, { context, cause: error });
};
