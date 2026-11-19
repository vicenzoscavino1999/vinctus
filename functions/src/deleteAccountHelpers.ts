export const STALE_PROCESSING_MS = 15 * 60 * 1000;
export const STALE_QUEUED_MS = 5 * 60 * 1000;
export const GENERIC_DELETION_FAILURE_MESSAGE =
  'No se pudo completar la eliminacion de la cuenta. Intenta solicitarla de nuevo.';

export type TimestampLike =
  | Date
  | { toMillis?: () => number; toDate?: () => Date }
  | number
  | string
  | null
  | undefined;

export function timestampToMillis(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { toMillis?: unknown; toDate?: unknown };
    if (typeof candidate.toMillis === 'function') {
      const ms = (candidate.toMillis as () => number)();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof candidate.toDate === 'function') {
      const date = (candidate.toDate as () => Date)();
      if (date instanceof Date && Number.isFinite(date.getTime())) {
        return date.getTime();
      }
    }
  }
  return null;
}

/**
 * Returns true if a `processing` deletion job has been running past `staleMs`
 * (e.g. worker timed out or crashed), so a retry can safely re-queue it.
 */
export function isStaleProcessingJob(
  data: Record<string, unknown> | undefined,
  nowMs = Date.now(),
  staleMs = STALE_PROCESSING_MS,
): boolean {
  if (!data || data.status !== 'processing') {
    return false;
  }
  const referenceMs = timestampToMillis(data.startedAt) ?? timestampToMillis(data.updatedAt);
  if (referenceMs === null) {
    return true;
  }
  return nowMs - referenceMs >= staleMs;
}

/**
 * Returns true if a `queued` deletion job was never picked up past `staleMs`
 * (e.g. missed trigger delivery), so a retry can safely re-trigger it.
 */
export function isStaleQueuedJob(
  data: Record<string, unknown> | undefined,
  nowMs = Date.now(),
  staleMs = STALE_QUEUED_MS,
): boolean {
  if (!data || data.status !== 'queued') {
    return false;
  }
  const referenceMs = timestampToMillis(data.updatedAt) ?? timestampToMillis(data.requestedAt);
  if (referenceMs === null) {
    return true;
  }
  return nowMs - referenceMs >= staleMs;
}

export function isStaleDeletionJob(
  data: Record<string, unknown> | undefined,
  nowMs = Date.now(),
): boolean {
  return isStaleProcessingJob(data, nowMs) || isStaleQueuedJob(data, nowMs);
}

/**
 * Prevents raw internal/Admin SDK error details from leaking to clients via
 * `deletionJobs/{uid}.lastError`.
 */
export function sanitizeDeletionErrorMessage(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  if (value.trim() === GENERIC_DELETION_FAILURE_MESSAGE) {
    return GENERIC_DELETION_FAILURE_MESSAGE;
  }
  return GENERIC_DELETION_FAILURE_MESSAGE;
}
