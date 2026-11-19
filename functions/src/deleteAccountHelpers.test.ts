import { describe, expect, it } from 'vitest';
import {
  GENERIC_DELETION_FAILURE_MESSAGE,
  STALE_PROCESSING_MS,
  STALE_QUEUED_MS,
  isStaleDeletionJob,
  isStaleProcessingJob,
  isStaleQueuedJob,
  sanitizeDeletionErrorMessage,
} from './deleteAccountHelpers';

describe('deleteAccountHelpers', () => {
  it('detects stale processing jobs so timed-out workers can be retried', () => {
    const now = 1_700_000_000_000;
    expect(isStaleProcessingJob(undefined, now)).toBe(false);
    expect(isStaleProcessingJob({ status: 'queued', startedAt: new Date(0) }, now)).toBe(false);
    expect(
      isStaleProcessingJob({ status: 'processing', startedAt: new Date(now - 60_000) }, now),
    ).toBe(false);
    expect(
      isStaleProcessingJob(
        { status: 'processing', startedAt: new Date(now - STALE_PROCESSING_MS) },
        now,
      ),
    ).toBe(true);
    expect(
      isStaleProcessingJob(
        {
          status: 'processing',
          updatedAt: { toMillis: () => now - STALE_PROCESSING_MS - 1_000 },
        },
        now,
      ),
    ).toBe(true);
    expect(isStaleProcessingJob({ status: 'processing' }, now)).toBe(true);
  });

  it('detects stale queued jobs so missed triggers can be recovered', () => {
    const now = 1_700_000_000_000;
    expect(isStaleQueuedJob({ status: 'queued', updatedAt: new Date(now - 30_000) }, now)).toBe(
      false,
    );
    expect(
      isStaleQueuedJob({ status: 'queued', updatedAt: new Date(now - STALE_QUEUED_MS) }, now),
    ).toBe(true);
    expect(
      isStaleDeletionJob(
        { status: 'queued', requestedAt: new Date(now - STALE_QUEUED_MS - 1_000) },
        now,
      ),
    ).toBe(true);
    expect(isStaleDeletionJob({ status: 'completed', updatedAt: new Date(0) }, now)).toBe(false);
  });

  it('sanitizes internal error strings before exposing lastError to clients', () => {
    expect(sanitizeDeletionErrorMessage(null)).toBeNull();
    expect(sanitizeDeletionErrorMessage('')).toBeNull();
    expect(sanitizeDeletionErrorMessage('   ')).toBeNull();
    expect(sanitizeDeletionErrorMessage('PERMISSION_DENIED: internal bucket secret_key_123')).toBe(
      GENERIC_DELETION_FAILURE_MESSAGE,
    );
    expect(sanitizeDeletionErrorMessage(GENERIC_DELETION_FAILURE_MESSAGE)).toBe(
      GENERIC_DELETION_FAILURE_MESSAGE,
    );
  });
});
