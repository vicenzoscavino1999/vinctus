import { describe, expect, it, vi } from 'vitest';
import { ConversationOutbox } from './ConversationOutbox';

vi.mock('@/features/chat/api', () => ({ sendMessage: vi.fn(), uploadMessageAttachment: vi.fn() }));
const makeDeps = () => ({
  send: vi.fn().mockResolvedValue(undefined),
  upload: vi.fn().mockResolvedValue({
    kind: 'file',
    url: 'https://example.com/audio',
    path: 'p',
    fileName: 'audio.wav',
    contentType: 'audio/wav',
    size: 2,
  }),
});
const audio = () => new File(['xx'], 'audio.wav', { type: 'audio/wav' });

describe('conversation outbox', () => {
  it('preserves newer drafts, staged files and the retry ID after an acknowledgement failure', async () => {
    const deps = makeDeps();
    let reject!: (error: Error) => void;
    deps.send.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const outbox = new ConversationOutbox(deps);
    outbox.draft('a', 'dm_a_b', 'primero');
    outbox.add('a', 'dm_a_b', [audio()]);
    const sending = outbox.send('a', 'dm_a_b');
    await vi.waitFor(() => expect(deps.send).toHaveBeenCalledOnce());
    outbox.draft('a', 'dm_a_b', 'segundo');
    outbox.add('a', 'dm_a_b', [audio()]);
    reject(new Error('acknowledgement lost'));
    await sending;
    const failed = outbox.snapshot('a', 'dm_a_b').failed[0];
    expect(failed.files).toHaveLength(1);
    await outbox.send('a', 'dm_a_b', failed);
    expect(deps.upload).toHaveBeenCalledOnce();
    expect(deps.send.mock.calls[0][6]).toBe(deps.send.mock.calls[1][6]);
    expect(outbox.snapshot('a', 'dm_a_b')).toMatchObject({
      draft: 'segundo',
      failed: [],
      pending: null,
    });
    expect(outbox.snapshot('a', 'dm_a_b').files).toHaveLength(1);
  });
  it('isolates late failures and drafts between conversations and accounts', async () => {
    const deps = makeDeps();
    deps.send.mockRejectedValue(new Error('offline'));
    const outbox = new ConversationOutbox(deps);
    outbox.draft('a', 'dm_a_b', 'mensaje anterior');
    const sending = outbox.send('a', 'dm_a_b');
    outbox.draft('a', 'dm_a_c', 'otro chat');
    outbox.draft('c', 'dm_a_b', 'otra cuenta');
    await sending;
    expect(outbox.snapshot('a', 'dm_a_c')).toMatchObject({ draft: 'otro chat', failed: [] });
    expect(outbox.snapshot('c', 'dm_a_b')).toMatchObject({ draft: 'otra cuenta', failed: [] });
    expect(outbox.snapshot('a', 'dm_a_b').failed).toHaveLength(1);
  });
  it('prevents simultaneous submits and sends attachment-only messages', async () => {
    const deps = makeDeps();
    const outbox = new ConversationOutbox(deps);
    outbox.add('a', 'dm_a_b', [audio()]);
    await Promise.all([outbox.send('a', 'dm_a_b'), outbox.send('a', 'dm_a_b')]);
    expect(deps.send).toHaveBeenCalledOnce();
    expect(deps.send.mock.calls[0][2]).toBe('');
    expect(deps.send.mock.calls[0][5]).toHaveLength(1);
  });
  it('retains successful partial uploads when another file fails', async () => {
    const deps = makeDeps();
    deps.upload
      .mockResolvedValueOnce({ path: 'first' })
      .mockRejectedValueOnce(new Error('offline'));
    const outbox = new ConversationOutbox(deps);
    outbox.add('a', 'dm_a_b', [audio(), audio()]);
    await outbox.send('a', 'dm_a_b');
    await outbox.send('a', 'dm_a_b', outbox.snapshot('a', 'dm_a_b').failed[0]);
    expect(deps.upload).toHaveBeenCalledTimes(3);
    expect(deps.send).toHaveBeenCalledOnce();
  });
  it('rejects unsupported attachments and enforces the shared count limit', () => {
    const outbox = new ConversationOutbox(makeDeps());
    expect(() =>
      outbox.add('a', 'dm_a_b', [new File(['x'], 'bad.js', { type: 'application/javascript' })]),
    ).toThrow();
    outbox.add('a', 'dm_a_b', Array.from({ length: 10 }, audio));
    expect(() => outbox.add('a', 'dm_a_b', [audio()])).toThrow('10');
    outbox.remove('a', 'dm_a_b', outbox.snapshot('a', 'dm_a_b').files[0].id);
    expect(() => outbox.add('a', 'dm_a_b', [audio()])).not.toThrow();
  });
});
