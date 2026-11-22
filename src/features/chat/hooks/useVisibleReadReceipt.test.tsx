import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { markConversationRead } from '@/features/chat/api';
import { useVisibleReadReceipt } from './useVisibleReadReceipt';
vi.mock('@/features/chat/api', () => ({ markConversationRead: vi.fn() }));
beforeEach(() => {
  vi.mocked(markConversationRead).mockReset().mockResolvedValue(undefined);
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
it('acknowledges only visible messages and catches up during a pending read', async () => {
  let finish!: () => void;
  vi.mocked(markConversationRead).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { rerender } = renderHook(
    ({ timestamp }) => useVisibleReadReceipt('dm_a_b', 'a', timestamp),
    { initialProps: { timestamp: null as number | null } },
  );
  expect(markConversationRead).not.toHaveBeenCalled();
  rerender({ timestamp: 1 });
  await waitFor(() => expect(markConversationRead).toHaveBeenCalledWith('dm_a_b', 'a', 1));
  rerender({ timestamp: 2 });
  await act(async () => {
    finish();
  });
  await waitFor(() => expect(markConversationRead).toHaveBeenLastCalledWith('dm_a_b', 'a', 2));
});
it('does not acknowledge arrivals after the window becomes hidden', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  renderHook(() => useVisibleReadReceipt('dm_a_b', 'a', 2));
  expect(markConversationRead).not.toHaveBeenCalled();
});
it('ignores late failures from the previous conversation and permits an explicit retry', async () => {
  let reject!: (error: Error) => void;
  vi.mocked(markConversationRead).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const { result, rerender } = renderHook(({ id }) => useVisibleReadReceipt(id, 'a', 2), {
    initialProps: { id: 'dm_a_b' },
  });
  rerender({ id: 'dm_a_c' });
  await act(async () => {
    reject(new Error('old failure'));
  });
  expect(result.current.error).toBeNull();
  vi.mocked(markConversationRead).mockRejectedValueOnce(new Error('offline'));
  rerender({ id: 'dm_a_d' });
  await waitFor(() => expect(result.current.error).not.toBeNull());
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.error).toBeNull());
});
