import { beforeEach, describe, expect, it, vi } from 'vitest';
type Listener = { next: (value: unknown) => void; error?: (error: unknown) => void };
const mocks = vi.hoisted(() => ({
  listeners: new Map<string, Listener>(),
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  onSnapshot: vi.fn(),
  getDocs: vi.fn(),
  endAt: vi.fn(),
  startAfter: vi.fn(),
}));
vi.mock('firebase/firestore', () => {
  const path = (...args: unknown[]) => ({
    path: args.filter((value) => typeof value === 'string').join('/'),
  });
  return {
    collection: path,
    doc: path,
    query: (base: { path: string }, ...constraints: unknown[]) => ({ ...base, constraints }),
    orderBy: (...args: unknown[]) => args,
    documentId: () => '__name__',
    limit: (count: number) => ({ limit: count }),
    endAt: mocks.endAt,
    startAfter: mocks.startAfter,
    getDocsFromServer: mocks.getDocs,
    getDoc: mocks.get,
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    serverTimestamp: () => 'server-time',
    Timestamp: class {},
    writeBatch: vi.fn(),
    runTransaction: (_db: unknown, callback: (tx: unknown) => unknown) =>
      callback({ get: mocks.get, set: mocks.set, update: mocks.update }),
    onSnapshot: mocks.onSnapshot,
  };
});
import {
  sendMessage,
  markConversationRead,
  subscribeToConversations,
  subscribeToMessages,
  fetchOlderMessages,
  messageFromSnapshot,
} from '@/shared/lib/firestore/messaging';
const missing = () => ({ exists: () => false });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.listeners.clear();
  mocks.get.mockResolvedValue(missing());
  mocks.onSnapshot.mockImplementation(
    (target: { path: string }, second: unknown, third: unknown, fourth: unknown) => {
      const next = typeof second === 'function' ? second : third;
      const error = typeof second === 'function' ? third : fourth;
      mocks.listeners.set(target.path, {
        next: next as Listener['next'],
        error: error as Listener['error'],
      });
      return vi.fn();
    },
  );
});
describe('Firestore chat invariants', () => {
  it('does not overwrite a committed native/web message after an acknowledgement failure', async () => {
    await sendMessage('dm_a_b', 'a', 'hola', null, null, [], 'stable-id');
    mocks.get.mockResolvedValue({
      exists: () => true,
      data: () => ({ senderId: 'a', text: 'hola', attachments: [] }),
    });
    await sendMessage('dm_a_b', 'a', 'hola', null, null, [], 'stable-id');
    expect(mocks.set).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledOnce();
    await expect(
      sendMessage('dm_a_b', 'b', 'other text', null, null, [], 'stable-id'),
    ).rejects.toThrow();
  });
  it('never moves the shared read position backwards or changes membership roles', async () => {
    mocks.get.mockResolvedValue({
      exists: () => true,
      data: () => ({ lastReadClientAt: 500, role: 'admin' }),
    });
    await markConversationRead('grp_g', 'a', 200);
    expect(mocks.update).not.toHaveBeenCalled();
    await markConversationRead('grp_g', 'a', 700);
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), {
      lastReadClientAt: 700,
      lastReadAt: 'server-time',
    });
  });
  it('keeps loaded conversations on listener errors and suppresses callbacks after closing', () => {
    const changes = vi.fn();
    const errors = vi.fn();
    const stop = subscribeToConversations('a', changes, errors);
    const index = mocks.listeners.get('users/a/directConversations')!;
    index.next({ docs: [{ id: 'dm_a_b' }] });
    const conversation = mocks.listeners.get('conversations/dm_a_b')!;
    conversation.next({
      exists: () => true,
      data: () => ({ type: 'direct', memberIds: ['a', 'b'] }),
    });
    expect(changes.mock.lastCall?.[0]).toHaveLength(1);
    conversation.error?.(new Error('offline'));
    expect(changes.mock.lastCall?.[0]).toHaveLength(1);
    expect(errors).toHaveBeenCalledOnce();
    const listeners = mocks.onSnapshot.mock.calls.length;
    stop();
    index.next({ docs: [{ id: 'dm_a_c' }] });
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(listeners);
  });
  it('uses both cursor fields and keeps the opened message window live', async () => {
    const cursor = { clientCreatedAt: 100, messageId: 'same-time-message' };
    const stop = subscribeToMessages('dm_a_b', vi.fn(), { through: cursor });
    expect(mocks.endAt).toHaveBeenCalledWith(100, 'same-time-message');
    mocks.getDocs.mockResolvedValue({ docs: [], metadata: { fromCache: false } });
    expect(await fetchOlderMessages('dm_a_b', cursor)).toMatchObject({
      messages: [],
      hasMore: false,
    });
    expect(mocks.startAfter).toHaveBeenCalledWith(100, 'same-time-message');
    stop();
  });
  it('retains captions and native kind=file MIME metadata when parsing messages', () => {
    const message = messageFromSnapshot({
      id: 'native-uuid',
      data: () => ({
        senderId: 'a',
        text: 'caption',
        attachments: [
          null,
          {
            kind: 'file',
            contentType: 'audio/mp4',
            fileName: 'Nota.m4a',
            path: 'p',
            url: 'https://example.com/audio',
            size: 20,
          },
        ],
        clientCreatedAt: 100,
      }),
    });
    expect(message.text).toBe('caption');
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments?.[0]).toMatchObject({ kind: 'file', contentType: 'audio/mp4' });
    expect(message.createdAt.getTime()).toBe(100);
  });
});
