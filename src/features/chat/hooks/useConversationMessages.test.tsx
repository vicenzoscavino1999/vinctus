import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  subscribeToMessages,
  fetchOlderMessages,
  type MessagePage,
  type MessageSubscriptionOptions,
} from '@/features/chat/api';
import { useConversationMessages } from './useConversationMessages';
vi.mock('@/features/chat/api', () => ({
  subscribeToMessages: vi.fn(),
  fetchOlderMessages: vi.fn(),
}));
let listeners: {
  id: string;
  options: MessageSubscriptionOptions;
  stop: ReturnType<typeof vi.fn>;
}[];
const page = (numbers: number[], cache = false, more = false): MessagePage => ({
  messages: numbers.map((n) => ({
    id: `m${n}`,
    clientCreatedAt: n,
    senderId: 'b',
    text: `${n}`,
    createdAt: new Date(n),
    clientId: `m${n}`,
  })),
  oldestCursor: numbers.length
    ? { clientCreatedAt: numbers[0], messageId: `m${numbers[0]}` }
    : null,
  isFromCache: cache,
  hasMore: more,
});
beforeEach(() => {
  vi.clearAllMocks();
  listeners = [];
  vi.mocked(subscribeToMessages).mockImplementation((id, _callback, options) => {
    const stop = vi.fn();
    listeners.push({ id, options: options!, stop });
    return stop;
  });
});
it('reports invalid IDs instead of throwing out of the subscription effect', () => {
  vi.mocked(subscribeToMessages).mockImplementationOnce(() => {
    throw new Error('Invalid ID');
  });
  const { result } = renderHook(() => useConversationMessages('invalid', 'a'));
  expect(result.current.error).not.toBeNull();
  expect(result.current.messages).toEqual([]);
});
it('pins the server boundary, retains partial caches and honors server deletions', async () => {
  const { result } = renderHook(() => useConversationMessages('dm_a_b', 'a'));
  act(() => listeners[listeners.length - 1]!.options.onPage?.(page([2, 3], false, true)));
  await waitFor(() => expect(listeners).toHaveLength(2));
  act(() => listeners[listeners.length - 1]!.options.onPage?.(page([3], true)));
  expect(result.current.messages.map((m) => m.id)).toEqual(['m2', 'm3']);
  act(() => listeners[listeners.length - 1]!.options.onPage?.(page([3])));
  expect(result.current.messages.map((m) => m.id)).toEqual(['m3']);
});
it('preserves newly arriving messages while fetching history', async () => {
  const { result } = renderHook(() => useConversationMessages('dm_a_b', 'a'));
  act(() => listeners[listeners.length - 1]!.options.onPage?.(page([3, 4], false, true)));
  let finish!: (value: MessagePage) => void;
  vi.mocked(fetchOlderMessages).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let loading!: Promise<void>;
  act(() => {
    loading = result.current.loadOlder();
  });
  act(() => listeners[listeners.length - 1]!.options.onPage?.(page([3, 4, 5])));
  await act(async () => {
    finish(page([1, 2]));
    await loading;
  });
  expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
});
it('clears the previous thread immediately and ignores old snapshots and history responses', async () => {
  const { result, rerender } = renderHook(({ id }) => useConversationMessages(id, 'a'), {
    initialProps: { id: 'dm_a_b' },
  });
  act(() => listeners[listeners.length - 1]!.options.onPage?.(page([3, 4], false, true)));
  const old = listeners[listeners.length - 1]!;
  let finish!: (value: MessagePage) => void;
  vi.mocked(fetchOlderMessages).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let loading!: Promise<void>;
  act(() => {
    loading = result.current.loadOlder();
  });
  rerender({ id: 'dm_a_c' });
  expect(result.current.messages).toEqual([]);
  act(() => old.options.onPage?.(page([8, 9])));
  await act(async () => {
    finish(page([1, 2]));
    await loading;
  });
  expect(result.current.messages).toEqual([]);
});
