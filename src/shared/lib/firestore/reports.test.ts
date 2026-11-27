import { beforeEach, describe, expect, it, vi } from 'vitest';

const setDoc = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({ id: 'report_1' })),
  serverTimestamp: vi.fn(() => 'now'),
  setDoc,
}));
vi.mock('@/shared/lib/firebase', () => ({ db: {} }));

const { createAIResponseReport } = await import('./reports');

describe('createAIResponseReport', () => {
  beforeEach(() => setDoc.mockClear());

  it('is built like the native app: ai_assistant, the context and the excerpt', async () => {
    await createAIResponseReport({
      reporterUid: 'u1',
      contextId: 'arena_d1',
      excerpt: 'Una respuesta',
      reason: 'abuse',
      details: ' ofensiva ',
    });

    expect(setDoc).toHaveBeenCalledWith(
      { id: 'report_1' },
      expect.objectContaining({
        reporterUid: 'u1',
        reportedUid: 'ai_assistant',
        reason: 'abuse',
        details: '[IA arena_d1] Una respuesta | Motivo: ofensiva',
        conversationId: 'ai_arena_d1',
        status: 'open',
      }),
      { merge: false },
    );
  });

  it('caps the excerpt so the report fits the rules', async () => {
    await createAIResponseReport({
      reporterUid: 'u1',
      contextId: 'chat',
      excerpt: 'x'.repeat(5000),
      reason: 'spam',
    });
    const payload = (setDoc.mock.calls[0] as unknown[])[1] as { details: string };
    expect(payload.details).toBe(`[IA chat] ${'x'.repeat(900)}`);
  });
});
