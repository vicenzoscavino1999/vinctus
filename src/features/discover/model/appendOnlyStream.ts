export type AppendOnlyStream<T> = {
  /** Identifies the feed the items belong to (e.g. the active search); a new scope restarts it. */
  scope: string;
  items: T[];
};

/**
 * Grows a feed without reordering what the user already scrolled past: items already shown keep
 * their position, and new candidates only fill the room left up to `targetCount`.
 *
 * Returns `previous` itself when nothing changes, so it is safe to apply during render.
 */
export function appendToStream<T>(
  previous: AppendOnlyStream<T>,
  scope: string,
  candidates: readonly T[],
  targetCount: number,
  getKey: (item: T) => string,
): AppendOnlyStream<T> {
  const sameScope = previous.scope === scope;
  const kept = sameScope ? previous.items : [];
  const seen = new Set(kept.map(getKey));
  const appended: T[] = [];

  for (const item of candidates) {
    if (kept.length + appended.length >= targetCount) break;
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    appended.push(item);
  }

  if (sameScope && appended.length === 0) return previous;
  return { scope, items: [...kept, ...appended] };
}
