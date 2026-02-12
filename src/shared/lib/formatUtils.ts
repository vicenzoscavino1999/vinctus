/**
 * Shared formatting utilities used across the app.
 *
 * Centralises toDate, formatRelativeTime and formatBytes so that every
 * feature imports from a single source instead of duplicating the logic.
 */

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Safely convert a Firestore Timestamp, Date, or unknown value to a
 * native Date object, returning null when conversion is not possible.
 */
export const toDate = (value: unknown): Date | null => {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  // Firestore Timestamp (has a toDate method)
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const toDateCandidate = (value as { toDate?: unknown }).toDate;
    if (typeof toDateCandidate === 'function') {
      const parsed = toDateCandidate.call(value);
      return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed : null;
    }
  }

  return null;
};

// ---------------------------------------------------------------------------
// Relative time formatting
// ---------------------------------------------------------------------------

/**
 * Render a human-friendly relative timestamp in Spanish.
 *
 * Examples: "Ahora", "Hace 5 min", "Hace 2 h", "Hace 3 d"
 *
 * Accepts raw Firestore Timestamps, Date objects, or null/undefined.
 */
export const formatRelativeTime = (value: unknown): string => {
  const date = toDate(value);
  if (!date) return 'Ahora';

  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Ahora';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;

  const days = Math.floor(hours / 24);
  return `Hace ${days} d`;
};

// ---------------------------------------------------------------------------
// Byte formatting
// ---------------------------------------------------------------------------

/**
 * Format a byte count into a human-readable string with SI-style units.
 *
 * Examples: "0 B", "512 B", "1.5 KB", "3.2 MB", "1.1 GB"
 */
export const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = value;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return unitIndex === 0 ? `${size} ${units[unitIndex]}` : `${size.toFixed(1)} ${units[unitIndex]}`;
};
