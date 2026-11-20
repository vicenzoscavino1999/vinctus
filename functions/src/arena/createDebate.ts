/**
 * Arena AI - Callable Endpoints
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import { Timestamp } from 'firebase-admin/firestore';
import { GoogleGenerativeAI, ResponseSchema, SchemaType } from '@google/generative-ai';
import { CreateDebateRequest, Debate, Turn } from './types';
import { PERSONAS, getPersona } from './personas';
import { buildSummaryVerdictPrompt, buildTurnPrompt, parseSummaryVerdictResponse } from './prompts';
import { generateWithOpenAI } from './openai';
import { checkRateLimit, getUsage, refundRateLimit } from './rateLimit';
import { checkTopic, normalizeTopicWhitespace } from './guardrails';
import {
  classifyDebateGenerationError,
  extractDebateSources,
  isModelLevelFallbackError,
  isProviderFallbackError,
  normalizeTurnText,
  redactPIIText,
} from './helpers';
import { COLLECTIONS, LIMITS, SUBCOLLECTIONS } from '../firestoreContract';

const REGION = 'us-central1';
const ARENA_DEBATES_COLLECTION = COLLECTIONS.arenaDebates;
// The web and the native app check the same limit before calling.
const MAX_TOPIC_CHARS = parseInt(
  process.env.AI_MAX_TOPIC_CHARS || String(LIMITS.arena.topicMaxLength),
  10,
);
const CLIENT_DEBATE_ID_REGEX = /^[A-Za-z0-9_-]{8,120}$/;
// gemini-2.0-flash* were shut down and gemini-2.5-flash* are scheduled for shutdown; once a model
// returns 404 the next candidate is tried, so the 3.8 / -latest entries take over automatically.
const DEFAULT_GEMINI_MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.8-flash',
  'gemini-flash-latest',
] as const;
// moonshotai/kimi-k2-instruct was retired on NVIDIA (410 Gone).
const DEFAULT_NVIDIA_MODEL_CANDIDATES = ['meta/llama-3.3-70b-instruct'] as const;
const DEFAULT_NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-6.1-terra';
const DEFAULT_PROVIDER_ORDER = ['gemini', 'nvidia'] as const;
type AIProvider = (typeof DEFAULT_PROVIDER_ORDER)[number];

interface UserDocShape {
  settings?: {
    ai?: {
      consentGranted?: unknown;
    };
  };
}

const summaryVerdictResponseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
    verdict: {
      type: SchemaType.OBJECT,
      properties: {
        winner: {
          type: SchemaType.STRING,
          format: 'enum',
          enum: ['A', 'B', 'draw'],
        },
        reason: { type: SchemaType.STRING },
      },
      required: ['winner', 'reason'],
    },
  },
  required: ['summary', 'verdict'],
};

const normalizeSecret = (value: string | undefined): string =>
  value ? value.trim().replace(/^['"]|['"]$/g, '') : '';

const parseModelCandidates = (
  input: string | undefined,
  defaults: readonly string[],
  separator: RegExp = /[,]/,
): string[] => {
  const parsed = (input || '')
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const ordered = [...parsed, ...defaults];
  const unique = new Set<string>();
  for (const model of ordered) {
    unique.add(model);
  }
  return Array.from(unique);
};

const getGeminiApiKey = (): string =>
  normalizeSecret(
    process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY,
  );

const getNvidiaApiKey = (): string => normalizeSecret(process.env.NVIDIA_API_KEY);

const getNvidiaBaseUrl = (): string => {
  const raw = (process.env.NVIDIA_BASE_URL || DEFAULT_NVIDIA_BASE_URL).trim();
  const normalized = raw.replace(/\/+$/, '');
  return normalized || DEFAULT_NVIDIA_BASE_URL;
};

const getGeminiModelCandidates = (): string[] => {
  const primary = (process.env.AI_MODEL || '').trim();
  const fallbacks = (process.env.AI_MODEL_FALLBACKS || '')
    .split(',')
    .map((model) => model.trim())
    .filter((model) => model.length > 0);

  return parseModelCandidates([primary, ...fallbacks].join(','), DEFAULT_GEMINI_MODEL_CANDIDATES);
};

const getNvidiaModelCandidates = (): string[] =>
  parseModelCandidates(
    process.env.NVIDIA_MODEL || process.env.AI_MODEL_NVIDIA,
    DEFAULT_NVIDIA_MODEL_CANDIDATES,
    /[,|\n]/,
  );

const getProviderOrder = (): AIProvider[] => {
  const requested = (process.env.AI_PROVIDER_ORDER || '')
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter((provider): provider is AIProvider => provider === 'gemini' || provider === 'nvidia');

  const ordered = requested.length > 0 ? requested : [...DEFAULT_PROVIDER_ORDER];
  const unique = new Set<AIProvider>();
  for (const provider of ordered) {
    unique.add(provider);
  }
  for (const provider of DEFAULT_PROVIDER_ORDER) {
    unique.add(provider);
  }
  return Array.from(unique);
};

const getUpstreamTimeoutMs = (): number => {
  const parsed = Number.parseInt(process.env.AI_TIMEOUT_MS ?? '', 10);
  if (!Number.isFinite(parsed)) return 25_000;
  return Math.min(60_000, Math.max(5_000, parsed));
};

const extractNvidiaText = (content: unknown): string => {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const text = content
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return '';
        }
        const chunk = item as { text?: unknown };
        return typeof chunk.text === 'string' ? chunk.text : '';
      })
      .join('\n')
      .trim();
    return text;
  }
  return '';
};

const generateWithGeminiModel = async (params: {
  prompt: string;
  responseSchema?: ResponseSchema;
  modelName: string;
  apiKey: string;
}): Promise<string> => {
  const genAI = new GoogleGenerativeAI(params.apiKey);
  const model = genAI.getGenerativeModel(
    params.responseSchema
      ? {
          model: params.modelName,
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: params.responseSchema,
          },
        }
      : { model: params.modelName },
  );

  const result = await model.generateContent(params.prompt, {
    timeout: getUpstreamTimeoutMs(),
  });
  return result.response.text();
};

const generateWithNvidiaModel = async (params: {
  prompt: string;
  modelName: string;
  apiKey: string;
  baseUrl: string;
}): Promise<string> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getUpstreamTimeoutMs());
  let response: Response;
  try {
    response = await fetch(`${params.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.modelName,
        messages: [
          {
            role: 'system',
            content:
              'Eres un asistente para generar contenido de debates. Sigue exactamente las instrucciones del usuario y devuelve solo el resultado solicitado.',
          },
          { role: 'user', content: params.prompt },
        ],
        temperature: 0.7,
        max_tokens: 1200,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const maybeError = error as { name?: string };
    if (maybeError?.name === 'AbortError') {
      throw new Error('[503] NVIDIA request timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`[${response.status}] ${rawText || 'NVIDIA upstream error'}`);
  }

  const parsed = (() => {
    try {
      return JSON.parse(rawText) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
    } catch {
      return null;
    }
  })();
  if (!parsed) {
    throw new Error('Invalid JSON response from NVIDIA');
  }

  const content = parsed.choices?.[0]?.message?.content;
  const text = extractNvidiaText(content);
  if (!text) {
    throw new Error('Empty NVIDIA response');
  }
  return text;
};

const generateWithFallback = async (params: {
  prompt: string;
  responseSchema?: ResponseSchema;
}): Promise<{ text: string; modelUsed: string }> => {
  const geminiApiKey = getGeminiApiKey();
  const nvidiaApiKey = getNvidiaApiKey();
  if (!geminiApiKey && !nvidiaApiKey) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Falta configurar GEMINI_API_KEY o NVIDIA_API_KEY para Arena.',
    );
  }

  const nvidiaBaseUrl = getNvidiaBaseUrl();
  const providerOrder = getProviderOrder();
  let lastError: Error | null = null;
  for (const provider of providerOrder) {
    if (provider === 'gemini' && !geminiApiKey) {
      continue;
    }
    if (provider === 'nvidia' && !nvidiaApiKey) {
      continue;
    }

    const modelCandidates =
      provider === 'gemini' ? getGeminiModelCandidates() : getNvidiaModelCandidates();

    for (const modelName of modelCandidates) {
      try {
        const text =
          provider === 'gemini'
            ? await generateWithGeminiModel({
                prompt: params.prompt,
                responseSchema: params.responseSchema,
                modelName,
                apiKey: geminiApiKey,
              })
            : await generateWithNvidiaModel({
                prompt: params.prompt,
                modelName,
                apiKey: nvidiaApiKey,
                baseUrl: nvidiaBaseUrl,
              });

        if (!text || text.trim().length === 0) {
          throw new Error('Empty AI response');
        }

        return {
          text,
          modelUsed: `${provider}:${modelName}`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        lastError = new Error(`Provider ${provider}, model ${modelName} failed: ${errorMessage}`);

        if (isModelLevelFallbackError(errorMessage)) {
          continue;
        }
        if (isProviderFallbackError(errorMessage)) {
          break;
        }

        break;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('No AI models configured for Arena.');
};

const hasServerAIConsent = async (uid: string): Promise<boolean> => {
  const snap = await admin.firestore().doc(`${COLLECTIONS.users}/${uid}`).get();
  if (!snap.exists) return false;
  const data = snap.data() as UserDocShape | undefined;
  return data?.settings?.ai?.consentGranted === true;
};

export const createDebate = functions
  .region(REGION)
  .runWith({ timeoutSeconds: 300, memory: '512MB', secrets: ['GEMINI_API_KEY', 'OPENAI_API_KEY'] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Debes iniciar sesion para crear un debate.',
      );
    }

    const payload = (data && typeof data === 'object' ? data : {}) as Partial<CreateDebateRequest>;
    const rawTopic = payload.topic;
    const personaAId = payload.personaA;
    const personaBId = payload.personaB;
    const visibility = payload.visibility === 'private' ? 'private' : 'public';
    const clientDebateIdRaw = payload.clientDebateId;
    const clientDebateId = typeof clientDebateIdRaw === 'string' ? clientDebateIdRaw.trim() : '';

    if (payload.useOpenAI !== undefined && typeof payload.useOpenAI !== 'boolean') {
      throw new functions.https.HttpsError('invalid-argument', 'Proveedor de IA no válido.');
    }

    if (!rawTopic || typeof rawTopic !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'El tema es requerido.');
    }
    if (
      !personaAId ||
      typeof personaAId !== 'string' ||
      !personaBId ||
      typeof personaBId !== 'string'
    ) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Debes seleccionar dos personas validas.',
      );
    }

    const normalizedTopic = normalizeTopicWhitespace(rawTopic);
    if (normalizedTopic.length > MAX_TOPIC_CHARS) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `El tema no puede exceder ${MAX_TOPIC_CHARS} caracteres.`,
      );
    }

    const topic = redactPIIText(normalizedTopic).slice(0, MAX_TOPIC_CHARS);

    const guardrailResult = checkTopic(topic);
    if (!guardrailResult.allowed) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        guardrailResult.reason || 'Tema no permitido.',
      );
    }

    if (personaAId === personaBId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Las personas deben ser diferentes.',
      );
    }
    if (clientDebateId && !CLIENT_DEBATE_ID_REGEX.test(clientDebateId)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'El identificador del debate no es valido.',
      );
    }

    const personaA = getPersona(personaAId);
    const personaB = getPersona(personaBId);
    if (!personaA || !personaB) {
      throw new functions.https.HttpsError('invalid-argument', 'Personas invalidas.');
    }

    const openAIApiKey = payload.useOpenAI ? normalizeSecret(process.env.OPENAI_API_KEY) : null;
    if (openAIApiKey === '') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'OpenAI no está configurado para Arena.',
      );
    }
    if (openAIApiKey === null && !getGeminiApiKey() && !getNvidiaApiKey()) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Falta configurar GEMINI_API_KEY o NVIDIA_API_KEY para Arena.',
      );
    }

    const uid = context.auth.uid;
    const aiConsentGranted = await hasServerAIConsent(uid);
    if (!aiConsentGranted) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Debes aceptar el consentimiento de IA antes de crear debates.',
      );
    }

    const openAIModel = process.env.ARENA_OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
    const generate: typeof generateWithFallback = openAIApiKey
      ? async ({ prompt, responseSchema }) => ({
          text: await generateWithOpenAI({
            apiKey: openAIApiKey,
            modelName: openAIModel,
            prompt,
            structuredVerdict: Boolean(responseSchema),
            timeoutMs: getUpstreamTimeoutMs(),
          }),
          modelUsed: `openai:${openAIModel}`,
        })
      : generateWithFallback;

    const db = admin.firestore();
    const debateRef = clientDebateId
      ? db.collection(ARENA_DEBATES_COLLECTION).doc(clientDebateId)
      : db.collection(ARENA_DEBATES_COLLECTION).doc();

    if (clientDebateId) {
      const existing = await debateRef.get();
      if (existing.exists) {
        throw new functions.https.HttpsError(
          'already-exists',
          'Ya existe un debate en proceso con ese identificador. Intenta de nuevo.',
        );
      }
    }

    const rateLimit = await checkRateLimit(uid);
    if (!rateLimit.allowed) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        `Has alcanzado el limite diario de debates. Reinicia a las ${new Date(rateLimit.resetAt).toLocaleTimeString()}.`,
      );
    }

    const startTime = Date.now();

    const debateData: Omit<Debate, 'id'> = {
      createdAt: Timestamp.now(),
      createdBy: uid,
      topic,
      mode: 'debate',
      personaA: personaAId,
      personaB: personaBId,
      status: 'running',
      visibility,
      language: 'es',
      linkCount: 0,
      sourceCount: 0,
      sourceLinks: [],
      sourceMentions: [],
      likesCount: 0,
    };

    try {
      await debateRef.create(debateData);
    } catch {
      await refundRateLimit(uid, rateLimit.dayKey);
      throw new functions.https.HttpsError(
        'already-exists',
        'Ya existe un debate en proceso con ese identificador. Intenta de nuevo.',
      );
    }

    try {
      const turnsRef = debateRef.collection(SUBCOLLECTIONS.turns);
      const generatedTurns: Array<{ speaker: 'A' | 'B'; text: string }> = [];
      let modelUsedForCompletion = '';
      let promptCharsTotal = 0;
      let outputCharsTotal = 0;

      for (let idx = 0; idx < 6; idx += 1) {
        const speaker: 'A' | 'B' = idx % 2 === 0 ? 'A' : 'B';
        const turnPrompt = buildTurnPrompt(
          topic,
          personaA,
          personaB,
          speaker,
          idx + 1,
          generatedTurns,
          'es',
        );
        promptCharsTotal += turnPrompt.length;

        const turnGeneration = await generate({ prompt: turnPrompt });
        modelUsedForCompletion = turnGeneration.modelUsed;

        const normalizedTurnText = normalizeTurnText(turnGeneration.text);
        if (!normalizedTurnText) {
          throw new Error(`Generated empty turn for speaker ${speaker}`);
        }

        outputCharsTotal += normalizedTurnText.length;
        generatedTurns.push({
          speaker,
          text: normalizedTurnText,
        });

        const turnData: Turn = {
          idx,
          speaker,
          text: normalizedTurnText,
          createdAt: Timestamp.now(),
        };
        await turnsRef.doc().set(turnData);
      }

      const verdictPrompt = buildSummaryVerdictPrompt(
        topic,
        personaA,
        personaB,
        generatedTurns,
        'es',
      );
      promptCharsTotal += verdictPrompt.length;
      const verdictGeneration = await generate({
        prompt: verdictPrompt,
        responseSchema: summaryVerdictResponseSchema,
      });
      modelUsedForCompletion = verdictGeneration.modelUsed;

      const parsedVerdict = parseSummaryVerdictResponse(verdictGeneration.text);
      if (!parsedVerdict) {
        throw new Error('Failed to parse summary and verdict response');
      }
      outputCharsTotal += parsedVerdict.summary.length + parsedVerdict.verdict.reason.length;
      const detectedSources = extractDebateSources(
        generatedTurns,
        parsedVerdict.summary,
        parsedVerdict.verdict.reason,
      );

      const metrics = {
        tokensIn: promptCharsTotal,
        tokensOut: outputCharsTotal,
        latencyMs: Date.now() - startTime,
        model: modelUsedForCompletion,
      };

      await debateRef.update({
        status: 'done',
        summary: parsedVerdict.summary,
        verdict: parsedVerdict.verdict,
        metrics,
        linkCount: detectedSources.sourceCount,
        sourceCount: detectedSources.sourceCount,
        sourceLinks: detectedSources.sourceLinks,
        sourceMentions: detectedSources.sourceMentions,
      });

      return {
        success: true,
        debateId: debateRef.id,
        summary: parsedVerdict.summary,
        verdict: parsedVerdict.verdict,
        remaining: rateLimit.remaining,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const classified = classifyDebateGenerationError(errorMessage);
      functions.logger.error('createDebate generation failed', {
        debateId: debateRef.id,
        uid,
        code: classified.code,
        error: errorMessage,
      });

      await refundRateLimit(uid, rateLimit.dayKey);
      await debateRef
        .update({
          status: 'error',
          error:
            error instanceof functions.https.HttpsError ? error.message : classified.publicMessage,
        })
        .catch(() => undefined);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      const isEmulator =
        process.env.FUNCTIONS_EMULATOR === 'true' || !!process.env.FIREBASE_EMULATOR_HUB;

      throw new functions.https.HttpsError(
        classified.code,
        classified.publicMessage,
        isEmulator ? { reason: errorMessage } : undefined,
      );
    }
  });

export const getArenaUsage = functions.region(REGION).https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesion.');
  }
  return getUsage(context.auth.uid);
});

export const getArenaPersonas = functions.region(REGION).https.onCall(async () => {
  return Object.values(PERSONAS);
});
