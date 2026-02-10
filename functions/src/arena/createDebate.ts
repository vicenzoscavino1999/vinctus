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
import { checkRateLimit, getUsage } from './rateLimit';
import { checkTopic, sanitizeTopic } from './guardrails';

const REGION = 'us-central1';
const ARENA_DEBATES_COLLECTION = 'arenaDebates';
const MAX_TOPIC_CHARS = parseInt(process.env.AI_MAX_TOPIC_CHARS || '240', 10);
const CLIENT_DEBATE_ID_REGEX = /^[A-Za-z0-9_-]{8,120}$/;
const URL_IN_TEXT_REGEX = /https?:\/\/[^\s<>"'`)\]}]+/gi;
const MAX_SOURCE_LINKS = 12;
const MAX_SOURCE_MENTIONS = 16;
const MAX_SOURCE_COUNT = MAX_SOURCE_LINKS + MAX_SOURCE_MENTIONS;
const SOURCE_CONTEXT_DETECTION_REGEX =
  /\b(?:seg[uÃº]n|de acuerdo con|conforme a|basado en|datos?\s+de|metaan[aÃ¡]lisis(?:\s+[a-z0-9Ã¡Ã©Ã­Ã³ÃºÃ±-]+){0,3}\s+de|estudio(?:\s+[a-z0-9Ã¡Ã©Ã­Ã³ÃºÃ±-]+){0,4}\s+de|informe(?:\s+[a-z0-9Ã¡Ã©Ã­Ã³ÃºÃ±-]+){0,4}\s+de|research by|study by|report by)\s+([^.;:\n]{3,140})/giu;
const SOURCE_ENTITY_YEAR_DETECTION_REGEX =
  /\b([A-ZÃÃ‰ÃÃ“ÃšÃ‘][A-Za-zÃÃ‰ÃÃ“ÃšÃ‘Ã¡Ã©Ã­Ã³ÃºÃ±0-9&.-]*(?:\s+[A-ZÃÃ‰ÃÃ“ÃšÃ‘][A-Za-zÃÃ‰ÃÃ“ÃšÃ‘Ã¡Ã©Ã­Ã³ÃºÃ±0-9&.-]*){0,5})\s+de\s+((?:19|20)\d{2})\b/gu;
const SOURCE_ENTITY_STOPWORDS = new Set([
  'turno',
  'persona',
  'tema',
  'resumen',
  'veredicto',
  'ganador',
]);
const DEFAULT_GEMINI_MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
] as const;
const DEFAULT_NVIDIA_MODEL_CANDIDATES = ['moonshotai/kimi-k2-instruct'] as const;
const DEFAULT_NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_PROVIDER_ORDER = ['gemini', 'nvidia'] as const;
type AIProvider = (typeof DEFAULT_PROVIDER_ORDER)[number];

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

const isModelLevelFallbackError = (rawMessage: string): boolean => {
  const message = rawMessage.toLowerCase();
  return (
    message.includes('[404') ||
    message.includes('not found') ||
    message.includes('is not supported') ||
    message.includes('model not found')
  );
};

const isProviderFallbackError = (rawMessage: string): boolean => {
  const message = rawMessage.toLowerCase();
  return (
    message.includes('quota exceeded') ||
    message.includes('too many requests') ||
    message.includes('[429') ||
    message.includes('[503') ||
    message.includes('service unavailable') ||
    message.includes('overloaded') ||
    message.includes('temporarily unavailable') ||
    message.includes('resource_exhausted') ||
    message.includes('api key not valid') ||
    message.includes('permission denied') ||
    message.includes('[403') ||
    message.includes('invalid api key') ||
    message.includes('authentication')
  );
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

const normalizeTurnText = (raw: string): string => {
  const cleaned = raw.trim();
  if (!cleaned) {
    return '';
  }

  const parsed = (() => {
    try {
      return JSON.parse(cleaned) as { text?: unknown };
    } catch {
      return null;
    }
  })();
  if (parsed && typeof parsed.text === 'string') {
    return parsed.text.trim();
  }

  return cleaned
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^["'`]+/, '')
    .replace(/["'`]+$/, '')
    .trim();
};

const normalizeUrlToken = (raw: string): string => {
  let cleaned = raw.trim();
  while (cleaned.length > 0 && /[.,;:!?)]$/.test(cleaned)) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
};

const extractLinksFromText = (text: string): string[] => {
  const matches = text.match(URL_IN_TEXT_REGEX);
  if (!matches || matches.length === 0) {
    return [];
  }

  const unique = new Set<string>();
  for (const token of matches) {
    const normalized = normalizeUrlToken(token);
    if (!normalized) {
      continue;
    }
    try {
      const parsed = new URL(normalized);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        continue;
      }
      unique.add(parsed.toString());
    } catch {
      continue;
    }
  }

  return Array.from(unique);
};

const normalizeSourceMention = (raw: string): string => {
  const compact = raw.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '';
  }
  const trimmed = compact
    .replace(/^[,;:\-)\]} ]+/, '')
    .replace(/[,;:\-([{ ]+$/, '')
    .trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
};

const extractSourceMentionsFromText = (text: string): string[] => {
  if (!text.trim()) {
    return [];
  }

  const mentions = new Set<string>();

  SOURCE_CONTEXT_DETECTION_REGEX.lastIndex = 0;
  let contextMatch = SOURCE_CONTEXT_DETECTION_REGEX.exec(text);
  while (contextMatch) {
    const mention = normalizeSourceMention(contextMatch[0]);
    if (mention.length >= 8) {
      mentions.add(mention);
      if (mentions.size >= MAX_SOURCE_MENTIONS) {
        return Array.from(mentions);
      }
    }
    contextMatch = SOURCE_CONTEXT_DETECTION_REGEX.exec(text);
  }

  SOURCE_ENTITY_YEAR_DETECTION_REGEX.lastIndex = 0;
  let entityYearMatch = SOURCE_ENTITY_YEAR_DETECTION_REGEX.exec(text);
  while (entityYearMatch) {
    const entity = normalizeSourceMention(entityYearMatch[1] || '');
    const year = (entityYearMatch[2] || '').trim();
    const key = entity.toLowerCase();
    if (
      entity.length >= 3 &&
      year.length === 4 &&
      !SOURCE_ENTITY_STOPWORDS.has(key) &&
      !/^\d+$/.test(entity)
    ) {
      mentions.add(`${entity} ${year}`);
      if (mentions.size >= MAX_SOURCE_MENTIONS) {
        return Array.from(mentions);
      }
    }
    entityYearMatch = SOURCE_ENTITY_YEAR_DETECTION_REGEX.exec(text);
  }

  return Array.from(mentions);
};

const extractDebateSources = (
  turns: Array<{ speaker: 'A' | 'B'; text: string }>,
  summary: string,
  verdictReason: string,
): { sourceLinks: string[]; sourceMentions: string[]; sourceCount: number } => {
  const links = new Set<string>();
  const mentions = new Set<string>();
  const textBlocks = [...turns.map((turn) => turn.text), summary, verdictReason];

  for (const block of textBlocks) {
    for (const link of extractLinksFromText(block)) {
      links.add(link);
      if (links.size >= MAX_SOURCE_LINKS) {
        break;
      }
    }

    for (const mention of extractSourceMentionsFromText(block)) {
      mentions.add(mention);
      if (mentions.size >= MAX_SOURCE_MENTIONS) {
        break;
      }
    }

    if (links.size + mentions.size >= MAX_SOURCE_COUNT) {
      break;
    }
  }

  const sourceLinks = Array.from(links);
  const sourceMentions = Array.from(mentions);

  return {
    sourceLinks,
    sourceMentions,
    sourceCount: sourceLinks.length + sourceMentions.length,
  };
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

  const result = await model.generateContent(params.prompt);
  return result.response.text();
};

const generateWithNvidiaModel = async (params: {
  prompt: string;
  modelName: string;
  apiKey: string;
  baseUrl: string;
}): Promise<string> => {
  const response = await fetch(`${params.baseUrl}/chat/completions`, {
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
  });

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

export const createDebate = functions
  .region(REGION)
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
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

    const topic = sanitizeTopic(rawTopic);
    if (topic.length > MAX_TOPIC_CHARS) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `El tema no puede exceder ${MAX_TOPIC_CHARS} caracteres.`,
      );
    }

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

    const uid = context.auth.uid;
    const rateLimit = await checkRateLimit(uid);
    if (!rateLimit.allowed) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        `Has alcanzado el limite diario de debates. Reinicia a las ${new Date(rateLimit.resetAt).toLocaleTimeString()}.`,
      );
    }

    const db = admin.firestore();
    const debateRef = clientDebateId
      ? db.collection(ARENA_DEBATES_COLLECTION).doc(clientDebateId)
      : db.collection(ARENA_DEBATES_COLLECTION).doc();
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
      throw new functions.https.HttpsError(
        'already-exists',
        'Ya existe un debate en proceso con ese identificador. Intenta de nuevo.',
      );
    }

    try {
      const turnsRef = debateRef.collection('turns');
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

        const turnGeneration = await generateWithFallback({ prompt: turnPrompt });
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
      const verdictGeneration = await generateWithFallback({
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
      await debateRef.update({
        status: 'error',
        error: errorMessage,
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      const normalizedError = errorMessage.toLowerCase();
      const isEmulator =
        process.env.FUNCTIONS_EMULATOR === 'true' || !!process.env.FIREBASE_EMULATOR_HUB;

      if (
        normalizedError.includes('service unavailable') ||
        normalizedError.includes('overloaded') ||
        normalizedError.includes('[503')
      ) {
        throw new functions.https.HttpsError(
          'unavailable',
          'El modelo de IA esta saturado temporalmente. Intenta nuevamente en unos segundos.',
          isEmulator ? { reason: errorMessage } : undefined,
        );
      }

      if (
        normalizedError.includes('quota exceeded') ||
        normalizedError.includes('too many requests') ||
        normalizedError.includes('[429')
      ) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Se alcanzo el limite de uso de la API de IA. Intenta nuevamente mas tarde.',
          isEmulator ? { reason: errorMessage } : undefined,
        );
      }

      if (
        normalizedError.includes('api key not valid') ||
        normalizedError.includes('permission denied') ||
        normalizedError.includes('[403') ||
        normalizedError.includes('invalid api key') ||
        normalizedError.includes('authentication')
      ) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'La configuracion de API key (Gemini/NVIDIA) no es valida o no tiene permisos.',
          isEmulator ? { reason: errorMessage } : undefined,
        );
      }

      throw new functions.https.HttpsError(
        'internal',
        'Error al generar el debate. Intenta de nuevo.',
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
