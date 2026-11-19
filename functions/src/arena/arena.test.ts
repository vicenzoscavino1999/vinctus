import { describe, expect, it, vi } from 'vitest';
import { checkTopic, normalizeTopicWhitespace, sanitizeTopic } from './guardrails';
import {
  classifyDebateGenerationError,
  extractDebateSources,
  isModelLevelFallbackError,
  isProviderFallbackError,
  normalizeTurnText,
  redactPIIText,
} from './helpers';
import { parseDebateResponse, parseSummaryVerdictResponse } from './prompts';
import { reconcileArenaDebateLikeCount } from '../arenaCounts';

describe('arena guardrails and helpers', () => {
  it('blocks prohibited topics even when accented or mixed-case', () => {
    expect(checkTopic('Cómo hacer una bomba casera').allowed).toBe(false);
    expect(checkTopic('Pornografía infantil en redes').allowed).toBe(false);
    expect(checkTopic('Contenido explícito de niños').allowed).toBe(false);
    expect(checkTopic('Supremacía racial en el siglo XXI').allowed).toBe(false);
    expect(checkTopic('hola').allowed).toBe(false);
    expect(checkTopic('¿La energía nuclear es clave para la transición?').allowed).toBe(true);
  });

  it('normalizes whitespace without prematurely truncating before validation', () => {
    const raw = `   ${'a'.repeat(260)}   `;
    expect(normalizeTopicWhitespace(raw).length).toBe(260);
    expect(sanitizeTopic(raw).length).toBe(240);
  });

  it('detects accented Spanish source mentions and safe HTTP(S) links', () => {
    const result = extractDebateSources(
      [
        {
          speaker: 'A',
          text: 'Según la OMS y el metaanálisis reciente de Nature, revisa https://arxiv.org/abs/2401.00001.',
        },
        {
          speaker: 'B',
          text: 'Un informe de Álvarez de 2024 contrasta ese punto.',
        },
      ],
      'Resumen basado en datos de UNESCO.',
      'El argumento de A tuvo mejor respaldo.',
    );

    expect(result.sourceLinks).toEqual(['https://arxiv.org/abs/2401.00001']);
    expect(result.sourceMentions.some((m) => m.toLowerCase().includes('según la oms'))).toBe(true);
    expect(result.sourceMentions.some((m) => m.includes('Álvarez 2024'))).toBe(true);
    expect(result.sourceCount).toBe(result.sourceLinks.length + result.sourceMentions.length);
  });

  it('redacts emails and phone numbers while leaving short numbers intact', () => {
    expect(redactPIIText('Escríbeme a ana@vinctus.app o al +51 987 654 321 en 2026')).toBe(
      'Escríbeme a [email_redacted] o al [phone_redacted] en 2026',
    );
  });

  it('classifies model-level overload/timeouts vs provider-level auth/quota errors and sanitizes public error messages', () => {
    expect(isModelLevelFallbackError('[503] Service Unavailable')).toBe(true);
    expect(isModelLevelFallbackError('Request timed out after 25000ms')).toBe(true);
    expect(isModelLevelFallbackError('[404] Model not found')).toBe(true);
    expect(isModelLevelFallbackError('[410] Gone')).toBe(true);
    expect(isProviderFallbackError('[429] Quota exceeded')).toBe(true);
    expect(isProviderFallbackError('[403] API key not valid')).toBe(true);
    expect(isProviderFallbackError('[503] overloaded')).toBe(false);

    const unavailable = classifyDebateGenerationError(
      'Provider nvidia, model meta/llama failed: [503] NVIDIA request timeout',
    );
    expect(unavailable.code).toBe('unavailable');
    expect(unavailable.publicMessage).not.toContain('meta/llama');

    const quota = classifyDebateGenerationError('[429] RESOURCE_EXHAUSTED raw secret payload');
    expect(quota.code).toBe('resource-exhausted');
    expect(quota.publicMessage).not.toContain('secret');

    const config = classifyDebateGenerationError('[403] API key not valid: AIzaSecret');
    expect(config.code).toBe('failed-precondition');
    expect(config.publicMessage).not.toContain('AIzaSecret');

    const internal = classifyDebateGenerationError('Unexpected JSON token at line 4');
    expect(internal.code).toBe('internal');
    expect(internal.publicMessage).not.toContain('Unexpected JSON');
  });

  it('normalizes fenced or JSON-wrapped turn output and parses loose verdict JSON', () => {
    expect(normalizeTurnText('{"text": "Argumento limpio"}')).toBe('Argumento limpio');
    expect(normalizeTurnText('```text\n"Turno directo"\n```')).toBe('Turno directo');

    const verdict = parseSummaryVerdictResponse(
      'Aquí está el JSON:\n```json\n{"summary":"Buen debate","verdict":{"winner":"draw","reason":"Equilibrado"}}\n```',
    );
    expect(verdict).toEqual({
      summary: 'Buen debate',
      verdict: { winner: 'draw', reason: 'Equilibrado' },
    });

    expect(parseDebateResponse('{"turns":[]}')).toBeNull();
  });

  it('reconciles arena debate likesCount transactionally and skips deleted debates', async () => {
    const update = vi.fn();
    const makeDb = (exists: boolean, currentLikes: number, actualLikes: number) => {
      const countQuery = { count: () => ({ __count: true }) };
      const debateRef = { collection: () => countQuery };
      return {
        collection: () => ({ doc: () => debateRef }),
        runTransaction: async (fn: (tx: unknown) => Promise<void>) => {
          await fn({
            get: vi.fn(async (target: { __count?: boolean }) =>
              target.__count
                ? { data: () => ({ count: actualLikes }) }
                : { exists, data: () => ({ likesCount: currentLikes }) },
            ),
            update,
          });
        },
      };
    };

    await reconcileArenaDebateLikeCount(makeDb(false, 2, 0) as never, 'debate_1');
    expect(update).not.toHaveBeenCalled();

    await reconcileArenaDebateLikeCount(makeDb(true, 99, 2) as never, 'debate_1');
    expect(update).toHaveBeenCalledWith(expect.anything(), { likesCount: 2 });
  });
});
