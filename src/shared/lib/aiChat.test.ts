import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendChatMessage } from './aiChat';

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
});
