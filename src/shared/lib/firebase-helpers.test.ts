import { describe, it, expect, vi, afterEach } from 'vitest';
import { withRetry, withTimeout } from './firebase-helpers';

afterEach(() => {
  vi.useRealTimers();
});

describe('firebase-helpers', () => {
  it('withTimeout resolves if promise resolves before timeout', async () => {
    await expect(withTimeout(Promise.resolve(123), 50)).resolves.toBe(123);
  });

  it('withTimeout rejects with TIMEOUT', async () => {
    vi.useFakeTimers();
    const never = new Promise<void>(() => {});
    const promise = withTimeout(never, 100);
    const expectation = expect(promise).rejects.toMatchObject({
      name: 'AppError',
      code: 'TIMEOUT',
    });

    await vi.advanceTimersByTimeAsync(100);
    await expectation;
  });

  it('withRetry retries on retryable external codes', async () => {
    vi.useFakeTimers();

    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        throw Object.assign(new Error('Network'), { code: 'unavailable' });
      }
      return 'ok';
    });

    const promise = withRetry(fn, { retries: 5, backoff: 10 });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('withRetry does not retry on non-retryable errors', async () => {
    vi.useFakeTimers();

    const fn = vi.fn(async () => {
      throw new Error('Boom');
    });

    const promise = withRetry(fn, { retries: 3, backoff: 10 });
    await expect(promise).rejects.toMatchObject({ name: 'AppError', code: 'UNKNOWN' });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
