/** Lowercase and strip accents, so "Física" and "fisica" match. */
export const normalizeKeyword = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** True only for absolute http(s) URLs, so links never carry `javascript:` or other schemes. */
export const isSafeHttpUrl = (value: string | null | undefined): value is string => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};
