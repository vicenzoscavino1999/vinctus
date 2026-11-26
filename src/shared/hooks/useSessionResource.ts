import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

export type SessionResourceState<T> = {
  data: T | undefined;
  error: unknown;
  /** True while a request is running, also when older data is already shown. */
  loading: boolean;
};

export type SessionResource<T> = SessionResourceState<T> & {
  /** Asks again, even when the data is still fresh (for "Reintentar"). */
  reload: () => void;
};

type Entry = {
  state: SessionResourceState<unknown>;
  fetchedAt: number;
  inFlight: Promise<void> | null;
  listeners: Set<() => void>;
};

const IDLE: SessionResourceState<never> = { data: undefined, error: null, loading: false };
const entries = new Map<string, Entry>();

const entryFor = (key: string): Entry => {
  let entry = entries.get(key);
  if (!entry) {
    entry = { state: IDLE, fetchedAt: 0, inFlight: null, listeners: new Set() };
    entries.set(key, entry);
  }
  return entry;
};

const publish = (entry: Entry, state: SessionResourceState<unknown>) => {
  entry.state = state;
  entry.listeners.forEach((listener) => listener());
};

const refresh = (key: string, load: () => Promise<unknown>): Promise<void> => {
  const entry = entryFor(key);
  if (entry.inFlight) return entry.inFlight;
  publish(entry, { ...entry.state, loading: true });
  const run = load().then(
    (data) => {
      entry.fetchedAt = Date.now();
      publish(entry, { data, error: null, loading: false });
    },
    (error: unknown) => {
      // Keep what was already shown; the error lets the section offer a retry.
      publish(entry, { data: entry.state.data, error, loading: false });
    },
  );
  entry.inFlight = run.finally(() => {
    entry.inFlight = null;
  });
  return entry.inFlight;
};

/**
 * Data that stays in memory for the whole session, keyed by `key` (put the user's uid in it when
 * the data depends on who reads it). Coming back to a page shows the last data at once and asks
 * again in the background once it is older than `maxAgeMs`. Several components with the same key
 * share one request. A `null` key loads nothing.
 */
export function useSessionResource<T>(
  key: string | null,
  load: () => Promise<T>,
  maxAgeMs = 5 * 60_000,
): SessionResource<T> {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!key) return () => undefined;
      const entry = entryFor(key);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [key],
  );
  const getSnapshot = useCallback(
    () => (key ? entryFor(key).state : IDLE) as SessionResourceState<T>,
    [key],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!key) return;
    const entry = entryFor(key);
    const stale = entry.fetchedAt === 0 || Date.now() - entry.fetchedAt > maxAgeMs;
    if (stale && !entry.inFlight) {
      void refresh(key, () => loadRef.current());
    }
  }, [key, maxAgeMs]);

  const reload = useCallback(() => {
    if (key) void refresh(key, () => loadRef.current());
  }, [key]);

  return { ...state, reload };
}

/** Drops cached data whose key starts with `prefix` (everything without one). For sign-out and tests. */
export function clearSessionResources(prefix = ''): void {
  for (const key of Array.from(entries.keys())) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}
