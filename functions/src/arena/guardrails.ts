/**
 * Arena AI - Content Guardrails
 */

const PROHIBITED_PATTERNS = [
  /\b(matar|asesinar|torturar|mutilar)\b/i,
  /\b(kill|murder|torture|mutilate)\b/i,
  /\b(ninos?|menores?|infantes?).*(sexual|explicito|pornografia)/i,
  /\b(children|minors?|kids?).*(sexual|explicit|porn)/i,
  /\b(exterminar|genocidio|supremacia)\b/i,
  /\b(exterminate|genocide|supremacy)\b/i,
  /\b(bomba|explosivo|terrorista|atacar)\b.*\b(hacer|construir|crear)\b/i,
  /\b(bomb|explosive|terrorist|attack)\b.*\b(make|build|create)\b/i,
];

const BLOCKED_PHRASES = [
  'pornografia infantil',
  'child pornography',
  'como hacer una bomba',
  'how to make a bomb',
];

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
}

export function checkTopic(topic: string): GuardrailResult {
  const normalizedTopic = topic.toLowerCase().trim();

  for (const phrase of BLOCKED_PHRASES) {
    if (normalizedTopic.includes(phrase.toLowerCase())) {
      return {
        allowed: false,
        reason: 'El tema contiene contenido prohibido.',
      };
    }
  }

  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(topic)) {
      return {
        allowed: false,
        reason: 'El tema contiene contenido potencialmente danino.',
      };
    }
  }

  if (normalizedTopic.length < 5) {
    return {
      allowed: false,
      reason: 'El tema es demasiado corto. Minimo 5 caracteres.',
    };
  }

  return { allowed: true };
}

export function sanitizeTopic(topic: string): string {
  return topic.trim().replace(/\s+/g, ' ').slice(0, 240);
}
