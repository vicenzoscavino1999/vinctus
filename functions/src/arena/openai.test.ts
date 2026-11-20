import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateWithOpenAI } from './openai';
import { parseSummaryVerdictResponse } from './prompts';

const request = {
  apiKey: 'test-key',
  modelName: 'gpt-6.1-terra',
  prompt: 'Debate de prueba',
  timeoutMs: 5_000,
};

afterEach(() => vi.unstubAllGlobals());

describe('OpenAI Arena adapter', () => {
  it('extracts the debate turn from response messages and disables provider storage', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        status: 'completed',
        output: [
          { type: 'reasoning' },
          { type: 'message', content: [{ type: 'output_text', text: ' Argumento. ' }] },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(generateWithOpenAI({ ...request, structuredVerdict: false })).resolves.toBe(
      'Argumento.',
    );
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({
      input: request.prompt,
      model: request.modelName,
      store: false,
    });
    expect(body).not.toHaveProperty('text');
  });

  it('requests a strict verdict and returns a value the existing Arena parser accepts', async () => {
    const verdict = { summary: 'Resumen', verdict: { winner: 'draw', reason: 'Empate' } };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(verdict) }] },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);

    const result = await generateWithOpenAI({ ...request, structuredVerdict: true });
    expect(parseSummaryVerdictResponse(result)).toEqual(verdict);
    const body = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
    expect(body.text.format).toMatchObject({
      type: 'json_schema',
      strict: true,
      schema: { required: ['summary', 'verdict'], additionalProperties: false },
    });
  });

  it('does not pass upstream error bodies through to logs or users', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'Private diagnostic' }, { status: 401 })),
    );
    await expect(generateWithOpenAI({ ...request, structuredVerdict: false })).rejects.toThrow(
      '[401] OpenAI authentication failed',
    );
  });
});
