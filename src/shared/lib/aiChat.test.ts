import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendChatMessage, trimChatHistory } from './aiChat';

vi.mock('./firebase', () => ({
  auth: { currentUser: { getIdToken: vi.fn(async () => 'token_1') } },
}));

const respondWith = (payload: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => payload }) as unknown as Response),
  );

describe('sendChatMessage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the createGroup action from the API', async () => {
    respondWith({
      response: 'Listo.',
      history: [],
      action: { type: 'createGroup', groupId: 'group_1' },
    });

    await expect(sendChatMessage('crea un grupo')).resolves.toEqual({
      response: 'Listo.',
      history: [],
      action: { type: 'createGroup', groupId: 'group_1' },
    });
  });

  it.each([
    ['an unknown action type', { type: 'deleteGroup', groupId: 'group_1' }],
    ['a missing group id', { type: 'createGroup' }],
  ])('drops %s', async (_label, action) => {
    respondWith({ response: 'Listo.', history: [], action });

    const result = await sendChatMessage('crea un grupo');

    expect(result).not.toHaveProperty('action');
  });

  it('trims oversized history before sending and drops unsafe image URLs', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        ({
          ok: true,
          json: async () => ({
            response: 'ok',
            history: [{ role: 'user', parts: [{ text: 'hola' }] }],
            image: 'javascript:alert(1)',
          }),
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);

    const longHistory = Array.from({ length: 24 }, (_, idx) => ({
      role: idx % 2 === 0 ? ('user' as const) : ('model' as const),
      parts: [{ text: 'x'.repeat(2500) }],
    }));

    const result = await sendChatMessage('hola', longHistory);
    expect(result).not.toHaveProperty('image');

    const sentBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'));
    expect(sentBody.history.length).toBeLessThanOrEqual(20);
    expect(sentBody.history[0]?.role).toBe('user');
    expect(
      sentBody.history.every(
        (entry: { parts: Array<{ text: string }> }) => entry.parts[0]!.text.length <= 2000,
      ),
    ).toBe(true);
    const total = sentBody.history.reduce(
      (sum: number, entry: { parts: Array<{ text: string }> }) => sum + entry.parts[0]!.text.length,
      0,
    );
    expect(total).toBeLessThanOrEqual(12000);
    expect(trimChatHistory([{ role: 'model', parts: [{ text: 'solo' }] }])).toEqual([]);
  });
});
