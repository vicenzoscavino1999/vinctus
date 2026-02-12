import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteAccount,
  getAccountDeletionStatus,
  requestAccountDeletion,
  startAccountDeletion,
} from '@/features/settings/api/deleteAccount';

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

vi.mock('@/shared/lib/firebase', () => ({
  functions: { app: 'test-app' },
}));

const firebaseFunctions = await import('firebase/functions');

describe('settings deleteAccount api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests async account deletion job when callable is available', async () => {
    const requestCallable = vi.fn().mockResolvedValue({
      data: { accepted: true, status: 'queued', jobId: 'user_1' },
    });

    vi.mocked(firebaseFunctions.httpsCallable).mockImplementation((_, name) => {
      if (name === 'requestAccountDeletion') {
        return requestCallable as never;
      }
      throw new Error(`Unexpected callable: ${name as string}`);
    });

    await expect(deleteAccount()).resolves.toBeUndefined();
    expect(requestCallable).toHaveBeenCalledTimes(1);
    expect(firebaseFunctions.httpsCallable).toHaveBeenCalledWith(
      { app: 'test-app' },
      'requestAccountDeletion',
    );
  });

  it('returns async status payload from startAccountDeletion', async () => {
    const requestCallable = vi.fn().mockResolvedValue({
      data: { accepted: true, status: 'queued', jobId: 'user_1' },
    });

    vi.mocked(firebaseFunctions.httpsCallable).mockImplementation((_, name) => {
      if (name === 'requestAccountDeletion') {
        return requestCallable as never;
      }
      throw new Error(`Unexpected callable: ${name as string}`);
    });

    await expect(startAccountDeletion()).resolves.toEqual({
      mode: 'async',
      status: 'queued',
      jobId: 'user_1',
    });
  });

  it('falls back to legacy deleteUserAccount when request callable is missing', async () => {
    const requestCallable = vi.fn().mockRejectedValue({ code: 'functions/not-found' });
    const legacyCallable = vi.fn().mockResolvedValue({ data: { success: true } });

    vi.mocked(firebaseFunctions.httpsCallable).mockImplementation((_, name) => {
      if (name === 'requestAccountDeletion') {
        return requestCallable as never;
      }
      if (name === 'deleteUserAccount') {
        return legacyCallable as never;
      }
      throw new Error(`Unexpected callable: ${name as string}`);
    });

    await expect(deleteAccount()).resolves.toBeUndefined();
    expect(requestCallable).toHaveBeenCalledTimes(1);
    expect(legacyCallable).toHaveBeenCalledTimes(1);
  });

  it('returns legacy status payload when async callable is missing', async () => {
    const requestCallable = vi.fn().mockRejectedValue({ code: 'functions/not-found' });
    const legacyCallable = vi.fn().mockResolvedValue({ data: { success: true } });

    vi.mocked(firebaseFunctions.httpsCallable).mockImplementation((_, name) => {
      if (name === 'requestAccountDeletion') {
        return requestCallable as never;
      }
      if (name === 'deleteUserAccount') {
        return legacyCallable as never;
      }
      throw new Error(`Unexpected callable: ${name as string}`);
    });

    await expect(startAccountDeletion()).resolves.toEqual({
      mode: 'legacy',
      status: 'processing',
      jobId: null,
    });
  });

  it('exposes requestAccountDeletion response', async () => {
    const requestCallable = vi.fn().mockResolvedValue({
      data: { accepted: true, status: 'processing', jobId: 'user_1' },
    });

    vi.mocked(firebaseFunctions.httpsCallable).mockImplementation((_, name) => {
      if (name === 'requestAccountDeletion') {
        return requestCallable as never;
      }
      throw new Error(`Unexpected callable: ${name as string}`);
    });

    await expect(requestAccountDeletion()).resolves.toEqual({
      accepted: true,
      status: 'processing',
      jobId: 'user_1',
    });
  });

  it('throws when requestAccountDeletion is not accepted', async () => {
    const requestCallable = vi.fn().mockResolvedValue({
      data: { accepted: false, status: 'failed', jobId: 'user_1' },
    });

    vi.mocked(firebaseFunctions.httpsCallable).mockImplementation((_, name) => {
      if (name === 'requestAccountDeletion') {
        return requestCallable as never;
      }
      throw new Error(`Unexpected callable: ${name as string}`);
    });

    await expect(requestAccountDeletion()).rejects.toThrow(
      'Account deletion request was not accepted',
    );
  });

  it('fetches account deletion status', async () => {
    const statusCallable = vi.fn().mockResolvedValue({
      data: {
        status: 'processing',
        jobId: 'user_1',
        updatedAt: '2026-02-11T16:00:00.000Z',
        completedAt: null,
        lastError: null,
      },
    });

    vi.mocked(firebaseFunctions.httpsCallable).mockImplementation((_, name) => {
      if (name === 'getAccountDeletionStatus') {
        return statusCallable as never;
      }
      throw new Error(`Unexpected callable: ${name as string}`);
    });

    await expect(getAccountDeletionStatus()).resolves.toEqual({
      status: 'processing',
      jobId: 'user_1',
      updatedAt: '2026-02-11T16:00:00.000Z',
      completedAt: null,
      lastError: null,
    });
  });
});
