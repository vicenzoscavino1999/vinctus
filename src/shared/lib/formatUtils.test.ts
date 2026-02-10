import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toDate, formatRelativeTime, formatBytes } from '@/shared/lib/formatUtils';

// ---------------------------------------------------------------------------
// toDate
// ---------------------------------------------------------------------------

describe('toDate', () => {
  it('returns null for nullish values', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
  });

  it('returns the Date when given a Date instance', () => {
    const d = new Date('2025-01-15T12:00:00Z');
    expect(toDate(d)).toBe(d);
  });

  it('converts a Firestore-like Timestamp with toDate()', () => {
    const expected = new Date('2025-06-01T00:00:00Z');
    const firestoreTimestamp = { toDate: () => expected };
    expect(toDate(firestoreTimestamp)).toBe(expected);
  });

  it('ignores objects with a non-function toDate property', () => {
    expect(toDate({ toDate: 'not a function' })).toBeNull();
  });

  it('converts epoch milliseconds numbers', () => {
    const parsed = toDate(0);
    expect(parsed).not.toBeNull();
    expect(parsed?.getTime()).toBe(0);
  });

  it('returns null for unsupported types', () => {
    expect(toDate('some string')).toBeNull();
    expect(toDate({})).toBeNull();
    expect(toDate(Number.NaN)).toBeNull();
    expect(toDate(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Ahora" for null / undefined', () => {
    expect(formatRelativeTime(null)).toBe('Ahora');
    expect(formatRelativeTime(undefined)).toBe('Ahora');
  });

  it('returns "Ahora" for dates less than 1 minute ago', () => {
    const thirtySecondsAgo = new Date('2025-06-15T11:59:30Z');
    expect(formatRelativeTime(thirtySecondsAgo)).toBe('Ahora');
  });

  it('formats minutes', () => {
    const fiveMinAgo = new Date('2025-06-15T11:55:00Z');
    expect(formatRelativeTime(fiveMinAgo)).toBe('Hace 5 min');
  });

  it('formats hours', () => {
    const threeHoursAgo = new Date('2025-06-15T09:00:00Z');
    expect(formatRelativeTime(threeHoursAgo)).toBe('Hace 3 h');
  });

  it('formats days', () => {
    const twoDaysAgo = new Date('2025-06-13T12:00:00Z');
    expect(formatRelativeTime(twoDaysAgo)).toBe('Hace 2 d');
  });

  it('returns "Ahora" for future dates', () => {
    const future = new Date('2025-06-16T00:00:00Z');
    expect(formatRelativeTime(future)).toBe('Ahora');
  });

  it('handles Firestore Timestamps', () => {
    const twoHoursAgo = new Date('2025-06-15T10:00:00Z');
    const ts = { toDate: () => twoHoursAgo };
    expect(formatRelativeTime(ts)).toBe('Hace 2 h');
  });
});

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------

describe('formatBytes', () => {
  it('returns "0 B" for zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('returns "0 B" for negative numbers', () => {
    expect(formatBytes(-100)).toBe('0 B');
  });

  it('returns "0 B" for NaN', () => {
    expect(formatBytes(NaN)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(3.2 * 1024 * 1024)).toBe('3.2 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('caps at GB for very large values', () => {
    const twoTb = 2 * 1024 * 1024 * 1024 * 1024;
    expect(formatBytes(twoTb)).toBe('2048.0 GB');
  });
});
