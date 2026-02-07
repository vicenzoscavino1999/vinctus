interface RateLimitState {
  dayCount: number;
  dayKey: string;
  minuteCount: number;
  minuteWindowStartMs: number;
  updatedAtMs: number;
}

export interface RateLimitOptions {
  dayLimit: number;
  keyPrefix: string;
  minuteLimit: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingDay: number;
  remainingMinute: number;
  retryAfterSeconds: number;
}

const MINUTE_MS = 60_000;
const STALE_ENTRY_MS = 2 * 24 * 60 * 60 * 1000;
const stores = new Map<string, RateLimitState>();

function getDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function computeSecondsUntilNextUtcDay(nowMs: number): number {
  const now = new Date(nowMs);
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - nowMs) / 1000));
}

function pruneOldEntries(nowMs: number): void {
  if (stores.size === 0) {
    return;
  }
  if (Math.random() > 0.03) {
    return;
  }
  for (const [key, state] of stores.entries()) {
    if (nowMs - state.updatedAtMs > STALE_ENTRY_MS) {
      stores.delete(key);
    }
  }
}

export function checkRateLimit(
  identity: string,
  options: RateLimitOptions,
  nowMs = Date.now(),
): RateLimitResult {
  pruneOldEntries(nowMs);

  const key = `${options.keyPrefix}:${identity}`;
  const today = getDayKey(nowMs);
  const state = stores.get(key) ?? {
    dayCount: 0,
    dayKey: today,
    minuteCount: 0,
    minuteWindowStartMs: nowMs,
    updatedAtMs: nowMs,
  };

  if (state.dayKey !== today) {
    state.dayKey = today;
    state.dayCount = 0;
  }

  if (nowMs - state.minuteWindowStartMs >= MINUTE_MS) {
    state.minuteWindowStartMs = nowMs;
    state.minuteCount = 0;
  }

  const minuteExceeded = state.minuteCount >= options.minuteLimit;
  const dayExceeded = state.dayCount >= options.dayLimit;

  if (minuteExceeded || dayExceeded) {
    state.updatedAtMs = nowMs;
    stores.set(key, state);
    const retryAfterSeconds = minuteExceeded
      ? Math.max(1, Math.ceil((state.minuteWindowStartMs + MINUTE_MS - nowMs) / 1000))
      : computeSecondsUntilNextUtcDay(nowMs);
    return {
      allowed: false,
      remainingDay: Math.max(0, options.dayLimit - state.dayCount),
      remainingMinute: Math.max(0, options.minuteLimit - state.minuteCount),
      retryAfterSeconds,
    };
  }

  state.minuteCount += 1;
  state.dayCount += 1;
  state.updatedAtMs = nowMs;
  stores.set(key, state);

  return {
    allowed: true,
    remainingDay: Math.max(0, options.dayLimit - state.dayCount),
    remainingMinute: Math.max(0, options.minuteLimit - state.minuteCount),
    retryAfterSeconds: 0,
  };
}

export function resetRateLimitStore(): void {
  stores.clear();
}
