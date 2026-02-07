import { writeBatch } from 'firebase/firestore';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import { batchWrite, withRetry, withTimeout } from '@/shared/lib/firebase-helpers';

describe('firebase-helpers', () => {
  it('withTimeout resolves when promise finishes in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });

  it('withTimeout throws TIMEOUT when promise does not finish', async () => {
    vi.useFakeTimers();

    const pending = new Promise<void>(() => {});
    const task = withTimeout(pending, 100);
    const assertion = expect(task).rejects.toMatchObject({ code: 'TIMEOUT' });

    await vi.advanceTimersByTimeAsync(100);
    await assertion;

    vi.useRealTimers();
  });

  it('withTimeout rejects invalid timeout values', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 0)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('withRetry retries retryable errors', async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ code: 'network-request-failed', message: 'offline' })
      .mockResolvedValueOnce('ok');

    await expect(withRetry(run, { retries: 2, backoffMs: 0 })).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('withRetry uses default retry options', async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ code: 'deadline-exceeded', message: 'slow' })
      .mockResolvedValueOnce('ok');

    await expect(withRetry(run)).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('withRetry does not retry non-retryable errors', async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new AppError('invalid', 'VALIDATION_FAILED'));

    await expect(withRetry(run, { retries: 2, backoffMs: 0 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('withRetry handles non-string source error codes', async () => {
    const run = vi.fn<() => Promise<string>>().mockRejectedValue({ code: 503, message: 'server' });

    await expect(withRetry(run, { retries: 1, backoffMs: 0 })).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('batchWrite applies operations and commits once', async () => {
    const setMock = vi.fn();
    const deleteMock = vi.fn();
    const commitMock = vi.fn().mockResolvedValue(undefined);

    vi.mocked(writeBatch).mockReturnValueOnce({
      set: setMock,
      delete: deleteMock,
      commit: commitMock,
    } as unknown as ReturnType<typeof writeBatch>);

    const firestore = {} as never;

    await batchWrite(firestore, [
      (batch) => batch.set({} as never, { hello: 'world' }),
      (batch) => batch.delete({} as never),
    ]);

    expect(writeBatch).toHaveBeenCalledWith(firestore);
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(commitMock).toHaveBeenCalledTimes(1);
  });

  it('batchWrite skips commit when operation list is empty', async () => {
    const writeBatchCalls = vi.mocked(writeBatch).mock.calls.length;
    const firestore = {} as never;

    await expect(batchWrite(firestore, [])).resolves.toBeUndefined();
    expect(vi.mocked(writeBatch).mock.calls.length).toBe(writeBatchCalls);
  });
});
