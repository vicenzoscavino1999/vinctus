const EMAIL_PII_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PII_REGEX = /(?:\+?\d[\d().\s-]{7,}\d)/g;
const URL_IN_TEXT_REGEX = /https?:\/\/[^\s<>"'`)\]}]+/gi;
const MAX_SOURCE_LINKS = 12;
const MAX_SOURCE_MENTIONS = 16;
const MAX_SOURCE_COUNT = MAX_SOURCE_LINKS + MAX_SOURCE_MENTIONS;
const SOURCE_CONTEXT_DETECTION_REGEX =
  /\b(?:seg[uú]n|de acuerdo con|conforme a|basado en|datos?\s+de|metaan[aá]lisis(?:\s+[a-z0-9áéíóúñ-]+){0,3}\s+de|estudio(?:\s+[a-z0-9áéíóúñ-]+){0,4}\s+de|informe(?:\s+[a-z0-9áéíóúñ-]+){0,4}\s+de|research by|study by|report by)\s+([^.;:\n]{3,140})/giu;
const SOURCE_ENTITY_YEAR_DETECTION_REGEX =
  /(?<![A-Za-zÁÉÍÓÚÑáéíóúñ0-9_])([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9&.-]*(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9&.-]*){0,5})\s+de\s+((?:19|20)\d{2})\b/gu;
const SOURCE_ENTITY_STOPWORDS = new Set([
  'turno',
  'persona',
  'tema',
  'resumen',
  'veredicto',
  'ganador',
]);

export const isModelLevelFallbackError = (rawMessage: string): boolean => {
  const message = rawMessage.toLowerCase();
  return (
    message.includes('[404') ||
    // Retired models answer 410 Gone (NVIDIA)
    message.includes('[410') ||
    message.includes('[503') ||
    message.includes('service unavailable') ||
    message.includes('overloaded') ||
    message.includes('temporarily unavailable') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted') ||
    message.includes('deadline') ||
    message.includes('not found') ||
    message.includes('is not supported') ||
    message.includes('model not found')
  );
};

export interface ClassifiedDebateError {
  code: 'unavailable' | 'resource-exhausted' | 'failed-precondition' | 'internal';
  publicMessage: string;
}

export const classifyDebateGenerationError = (rawMessage: string): ClassifiedDebateError => {
  const normalized = rawMessage.toLowerCase();
  if (
    normalized.includes('service unavailable') ||
    normalized.includes('overloaded') ||
    normalized.includes('[503') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('aborted') ||
    normalized.includes('deadline')
  ) {
    return {
      code: 'unavailable',
      publicMessage:
        'El modelo de IA está saturado o tardó demasiado. Intenta nuevamente en unos segundos.',
    };
  }
  if (
    normalized.includes('quota exceeded') ||
    normalized.includes('too many requests') ||
    normalized.includes('[429') ||
    normalized.includes('resource_exhausted')
  ) {
    return {
      code: 'resource-exhausted',
      publicMessage:
        'Se alcanzó el límite de uso del proveedor de IA. Intenta nuevamente más tarde.',
    };
  }
  if (
    normalized.includes('api key not valid') ||
    normalized.includes('permission denied') ||
    normalized.includes('[403') ||
    normalized.includes('invalid api key') ||
    normalized.includes('authentication')
  ) {
    return {
      code: 'failed-precondition',
      publicMessage: 'El servicio de IA no está disponible temporalmente por configuración.',
    };
  }
  return {
    code: 'internal',
    publicMessage: 'Error al generar el debate. Intenta de nuevo.',
  };
};

export const isProviderFallbackError = (rawMessage: string): boolean => {
  const message = rawMessage.toLowerCase();
  return (
    message.includes('quota exceeded') ||
    message.includes('too many requests') ||
    message.includes('[429') ||
    message.includes('resource_exhausted') ||
    message.includes('api key not valid') ||
    message.includes('permission denied') ||
    message.includes('[403') ||
    message.includes('invalid api key') ||
    message.includes('authentication')
  );
};

export const normalizeTurnText = (raw: string): string => {
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
    .replace(/\s*```$/i, '')
    .trim()
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

export const extractDebateSources = (
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

const isLikelyPhoneCandidate = (input: string): boolean => {
  const digits = input.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    return false;
  }
  return !/^(\d)\1+$/.test(digits);
};

export const redactPIIText = (input: string): string => {
  let redacted = input.replace(EMAIL_PII_REGEX, '[email_redacted]');
  redacted = redacted.replace(PHONE_PII_REGEX, (match) =>
    isLikelyPhoneCandidate(match) ? '[phone_redacted]' : match,
  );
  return redacted;
};
