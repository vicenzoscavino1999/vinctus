/**
 * Arena AI - Prompt and response parsing helpers
 */

import { Persona } from './types';

type Speaker = 'A' | 'B';

function getLanguageInstruction(language: string): string {
  return language === 'es'
    ? 'Responde completamente en espanol.'
    : 'Respond completely in English.';
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (ch === '\\') {
        escaping = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      depth += 1;
      continue;
    }

    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parseLooseJson(input: string): unknown | null {
  const cleaned = input
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const extracted = extractJsonObject(cleaned);
    if (!extracted) {
      return null;
    }
    try {
      return JSON.parse(extracted);
    } catch {
      return null;
    }
  }
}

export function buildDebatePrompt(
  topic: string,
  personaA: Persona,
  personaB: Persona,
  language: string = 'es',
): string {
  const languageInstruction = getLanguageInstruction(language);

  return `Eres un generador de debates de alta calidad. Tu tarea es generar un debate estructurado entre dos personas sobre un tema dado.

REGLAS ESTRICTAS:
1. ${languageInstruction}
2. Genera EXACTAMENTE 6 turnos alternando entre A y B (A, B, A, B, A, B).
3. Cada turno debe tener entre 80 y 140 palabras.
4. Manten un tono respetuoso pero argumentativo.
5. Los argumentos deben ser coherentes y construir sobre los anteriores.
6. Al final, proporciona un resumen breve y un veredicto imparcial.

FORMATO DE SALIDA (JSON estricto, sin markdown):
{
  "turns": [
    {"speaker": "A", "text": "primer argumento..."},
    {"speaker": "B", "text": "respuesta..."},
    {"speaker": "A", "text": "contra-argumento..."},
    {"speaker": "B", "text": "respuesta..."},
    {"speaker": "A", "text": "argumento final..."},
    {"speaker": "B", "text": "cierre..."}
  ],
  "summary": "Resumen del debate en 2-3 oraciones",
  "verdict": {
    "winner": "A" | "B" | "draw",
    "reason": "Explicacion breve del veredicto"
  }
}

PERSONAS:
- Persona A (${personaA.name}): ${personaA.style}
- Persona B (${personaB.name}): ${personaB.style}

TEMA DEL DEBATE:
${topic}

Genera el debate ahora. Responde SOLO con el JSON, sin explicaciones adicionales.`;
}

export function buildTurnPrompt(
  topic: string,
  personaA: Persona,
  personaB: Persona,
  speaker: Speaker,
  turnNumber: number,
  previousTurns: Array<{ speaker: Speaker; text: string }>,
  language: string = 'es',
): string {
  const languageInstruction = getLanguageInstruction(language);
  const currentPersona = speaker === 'A' ? personaA : personaB;
  const counterpartPersona = speaker === 'A' ? personaB : personaA;

  const history =
    previousTurns.length === 0
      ? 'No hay turnos previos.'
      : previousTurns
          .map(
            (turn, idx) =>
              `Turno ${idx + 1} (${turn.speaker} - ${
                turn.speaker === 'A' ? personaA.name : personaB.name
              }): ${turn.text}`,
          )
          .join('\n\n');

  return `Eres ${currentPersona.name} en un debate estructurado.

REGLAS:
1. ${languageInstruction}
2. Eres el turno ${turnNumber} y hablas como ${speaker}.
3. Escribe entre 80 y 140 palabras.
4. Mantener tono respetuoso, solido y argumentativo.
5. Debes responder a ideas anteriores cuando existan.
6. No uses markdown, no agregues titulos ni etiquetas.
7. Responde solo con el texto del turno.

TU ESTILO:
${currentPersona.style}

ESTILO DE LA CONTRAPARTE (${counterpartPersona.name}):
${counterpartPersona.style}

TEMA:
${topic}

HISTORIAL:
${history}

Genera ahora el texto del turno ${turnNumber} (${speaker}).`;
}

export function buildSummaryVerdictPrompt(
  topic: string,
  personaA: Persona,
  personaB: Persona,
  turns: Array<{ speaker: Speaker; text: string }>,
  language: string = 'es',
): string {
  const languageInstruction = getLanguageInstruction(language);

  const formattedTurns = turns
    .map(
      (turn, idx) =>
        `Turno ${idx + 1} (${turn.speaker} - ${turn.speaker === 'A' ? personaA.name : personaB.name}): ${
          turn.text
        }`,
    )
    .join('\n\n');

  return `Analiza este debate y genera un cierre imparcial.

REGLAS:
1. ${languageInstruction}
2. Evalua calidad argumentativa, coherencia y respuesta a objeciones.
3. Devuelve SOLO JSON valido sin markdown.
4. El resumen debe tener 2-3 oraciones.
5. El veredicto puede ser A, B o draw.

FORMATO:
{
  "summary": "Resumen breve del debate",
  "verdict": {
    "winner": "A" | "B" | "draw",
    "reason": "Explicacion breve del veredicto"
  }
}

TEMA:
${topic}

PERSONAS:
- A (${personaA.name})
- B (${personaB.name})

TURNOS:
${formattedTurns}

Genera el JSON ahora.`;
}

export function parseDebateResponse(response: string): {
  turns: Array<{ speaker: 'A' | 'B'; text: string }>;
  summary: string;
  verdict: { winner: 'A' | 'B' | 'draw'; reason: string };
} | null {
  const parsed = parseLooseJson(response);

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const data = parsed as {
    turns?: Array<{ speaker?: string; text?: string }>;
    summary?: unknown;
    verdict?: { winner?: string; reason?: unknown };
  };

  if (!Array.isArray(data.turns) || data.turns.length !== 6) {
    return null;
  }

  const hasValidTurns = data.turns.every(
    (turn) =>
      (turn.speaker === 'A' || turn.speaker === 'B') &&
      typeof turn.text === 'string' &&
      turn.text.trim().length > 0,
  );
  if (!hasValidTurns) {
    return null;
  }

  if (typeof data.summary !== 'string' || data.summary.trim().length === 0) {
    return null;
  }

  if (
    !data.verdict ||
    (data.verdict.winner !== 'A' &&
      data.verdict.winner !== 'B' &&
      data.verdict.winner !== 'draw') ||
    typeof data.verdict.reason !== 'string' ||
    data.verdict.reason.trim().length === 0
  ) {
    return null;
  }

  return {
    turns: data.turns.map((turn) => ({
      speaker: turn.speaker as 'A' | 'B',
      text: turn.text as string,
    })),
    summary: data.summary,
    verdict: {
      winner: data.verdict.winner,
      reason: data.verdict.reason,
    },
  };
}

export function parseSummaryVerdictResponse(response: string): {
  summary: string;
  verdict: { winner: 'A' | 'B' | 'draw'; reason: string };
} | null {
  const parsed = parseLooseJson(response);

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const data = parsed as {
    summary?: unknown;
    verdict?: { winner?: unknown; reason?: unknown };
  };

  if (typeof data.summary !== 'string' || data.summary.trim().length === 0) {
    return null;
  }

  if (
    !data.verdict ||
    (data.verdict.winner !== 'A' &&
      data.verdict.winner !== 'B' &&
      data.verdict.winner !== 'draw') ||
    typeof data.verdict.reason !== 'string' ||
    data.verdict.reason.trim().length === 0
  ) {
    return null;
  }

  return {
    summary: data.summary,
    verdict: {
      winner: data.verdict.winner,
      reason: data.verdict.reason,
    },
  };
}
