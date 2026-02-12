import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDebate,
  likeArenaDebateWithSync,
  saveArenaDebateWithSync,
  unlikeArenaDebateWithSync,
  unsaveArenaDebateWithSync,
} from '@/features/arena/api/mutations';

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

vi.mock('@/shared/lib/firebase', () => ({
  functions: { app: 'test-app' },
}));

vi.mock('@/shared/lib/firestore', () => ({
  likeArenaDebateWithSync: vi.fn(),
  saveArenaDebateWithSync: vi.fn(),
  unlikeArenaDebateWithSync: vi.fn(),
  unsaveArenaDebateWithSync: vi.fn(),
}));

const firebaseFunctions = await import('firebase/functions');
const firestore = await import('@/shared/lib/firestore');

describe('arena api mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a debate through callable and returns payload', async () => {
    const callable = vi.fn().mockResolvedValueOnce({
      data: {
        success: true,
        debateId: 'debate_1',
        summary: 'Resumen',
        verdict: { winner: 'A', reason: 'x' },
        remaining: 9,
      },
    });

    vi.mocked(firebaseFunctions.httpsCallable).mockReturnValueOnce(callable as never);

    await expect(
      createDebate({
        topic: 'Tema',
        personaA: 'scientist',
        personaB: 'philosopher',
      }),
    ).resolves.toEqual({
      success: true,
      debateId: 'debate_1',
      summary: 'Resumen',
      verdict: { winner: 'A', reason: 'x' },
      remaining: 9,
    });
    expect(firebaseFunctions.httpsCallable).toHaveBeenCalledWith(
      { app: 'test-app' },
      'createDebate',
    );
  });

  it('maps details.reason error from callable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const callable = vi.fn().mockRejectedValueOnce({
      code: 'functions/internal',
      details: { reason: 'Motivo detallado' },
    });
    vi.mocked(firebaseFunctions.httpsCallable).mockReturnValueOnce(callable as never);

    await expect(createDebate({ topic: 'Tema', personaA: 'a', personaB: 'b' })).rejects.toThrow(
      'Motivo detallado',
    );
  });

  it('maps resource exhausted with fallback message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const callable = vi.fn().mockRejectedValueOnce({
      code: 'functions/resource-exhausted',
      message: '',
    });
    vi.mocked(firebaseFunctions.httpsCallable).mockReturnValueOnce(callable as never);

    await expect(createDebate({ topic: 'Tema', personaA: 'a', personaB: 'b' })).rejects.toThrow(
      'Has alcanzado el limite diario de debates.',
    );
  });

  it('maps known callable error codes to user messages', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const scenarios: Array<{ error: unknown; expected: string }> = [
      {
        error: { code: 'functions/unauthenticated' },
        expected: 'Debes iniciar sesion para crear un debate.',
      },
      {
        error: { code: 'functions/invalid-argument', message: '' },
        expected: 'Los datos del debate no son validos.',
      },
      {
        error: { code: 'functions/failed-precondition', message: '' },
        expected: 'Arena no esta configurada todavia.',
      },
      {
        error: { code: 'functions/unavailable', message: '' },
        expected: 'El servicio de IA esta temporalmente no disponible.',
      },
      {
        error: { code: 'functions/internal' },
        expected: 'Error interno al generar el debate. Intenta de nuevo.',
      },
      {
        error: { code: 'functions/already-exists', message: '' },
        expected: 'Ya existe un debate en proceso. Intenta nuevamente.',
      },
      {
        error: { code: 'functions/unknown', message: 'Error remoto' },
        expected: 'Error remoto',
      },
      {
        error: { code: 'functions/unknown', message: '' },
        expected: 'Error al crear el debate.',
      },
    ];

    for (const scenario of scenarios) {
      const callable = vi.fn().mockRejectedValueOnce(scenario.error);
      vi.mocked(firebaseFunctions.httpsCallable).mockReturnValueOnce(callable as never);

      await expect(createDebate({ topic: 'Tema', personaA: 'a', personaB: 'b' })).rejects.toThrow(
        scenario.expected,
      );
    }
  });

  it('sanitizes and forwards saveArenaDebate payload', async () => {
    vi.mocked(firestore.saveArenaDebateWithSync).mockResolvedValueOnce();
    const longSummary = ` ${'a'.repeat(3200)} `;

    await expect(
      saveArenaDebateWithSync(
        {
          debateId: ' debate_1 ',
          topic: ` ${'t'.repeat(300)} `,
          personaA: ` ${'A'.repeat(120)} `,
          personaB: ` ${'B'.repeat(120)} `,
          summary: longSummary,
          verdictWinner: 'invalid' as never,
        },
        ' user_1 ',
      ),
    ).resolves.toBeUndefined();

    expect(firestore.saveArenaDebateWithSync).toHaveBeenCalledWith(
      {
        debateId: 'debate_1',
        topic: 't'.repeat(240),
        personaA: 'A'.repeat(80),
        personaB: 'B'.repeat(80),
        summary: 'a'.repeat(3000),
        verdictWinner: null,
      },
      'user_1',
    );
  });

  it('rejects saveArenaDebateWithSync when required fields are incomplete', async () => {
    await expect(
      saveArenaDebateWithSync(
        {
          debateId: 'debate_1',
          topic: '',
          personaA: 'A',
          personaB: 'B',
        },
        'user_1',
      ),
    ).rejects.toThrow('No se pudo guardar el debate por datos incompletos.');
    expect(firestore.saveArenaDebateWithSync).not.toHaveBeenCalled();
  });

  it('validates debate id + uid for unsave/like/unlike mutations', async () => {
    await expect(unsaveArenaDebateWithSync(' ', 'user_1')).rejects.toThrow(
      'No se pudo actualizar el guardado del debate.',
    );
    await expect(likeArenaDebateWithSync('debate_1', ' ')).rejects.toThrow(
      'No se pudo registrar el like del debate.',
    );
    await expect(unlikeArenaDebateWithSync(' ', 'user_1')).rejects.toThrow(
      'No se pudo actualizar el like del debate.',
    );
  });

  it('forwards unsave/like/unlike mutations with sanitized ids', async () => {
    vi.mocked(firestore.unsaveArenaDebateWithSync).mockResolvedValueOnce();
    vi.mocked(firestore.likeArenaDebateWithSync).mockResolvedValueOnce();
    vi.mocked(firestore.unlikeArenaDebateWithSync).mockResolvedValueOnce();

    await expect(unsaveArenaDebateWithSync(' debate_1 ', ' user_1 ')).resolves.toBeUndefined();
    await expect(likeArenaDebateWithSync(' debate_1 ', ' user_1 ')).resolves.toBeUndefined();
    await expect(unlikeArenaDebateWithSync(' debate_1 ', ' user_1 ')).resolves.toBeUndefined();

    expect(firestore.unsaveArenaDebateWithSync).toHaveBeenCalledWith('debate_1', 'user_1');
    expect(firestore.likeArenaDebateWithSync).toHaveBeenCalledWith('debate_1', 'user_1');
    expect(firestore.unlikeArenaDebateWithSync).toHaveBeenCalledWith('debate_1', 'user_1');
  });
});
