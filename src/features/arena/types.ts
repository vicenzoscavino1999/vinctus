import { Timestamp } from 'firebase/firestore';

export interface Persona {
  id: string;
  name: string;
  description: string;
  style: string;
  avatar: string;
}

export type DebateStatus = 'running' | 'done' | 'error';
export type DebateVisibility = 'public' | 'private';
export type Speaker = 'A' | 'B';

export interface Turn {
  id?: string;
  idx: number;
  speaker: Speaker;
  text: string;
  createdAt: Timestamp;
}

export interface DebateVerdict {
  winner: 'A' | 'B' | 'draw';
  reason: string;
}

export interface Debate {
  id: string;
  createdAt: Timestamp;
  createdBy: string;
  topic: string;
  mode: 'debate' | 'brainstorm' | 'decision';
  personaA: string;
  personaB: string;
  status: DebateStatus;
  visibility: DebateVisibility;
  language: string;
  error?: string;
  summary?: string;
  verdict?: DebateVerdict;
  metrics?: {
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    model?: string;
    costEstimate?: number;
  };
  linkCount?: number;
  sourceCount?: number;
  sourceLinks?: string[];
  sourceMentions?: string[];
  likesCount?: number;
}

export interface CreateDebateParams {
  topic: string;
  personaA: string;
  personaB: string;
  visibility?: DebateVisibility;
  clientDebateId?: string;
}

export interface CreateDebateResult {
  success: boolean;
  debateId: string;
  summary: string;
  verdict: DebateVerdict;
  remaining: number;
}

export interface UsageStats {
  used: number;
  limit: number;
  remaining: number;
}

export interface SavedArenaDebate {
  debateId: string;
  topic: string;
  personaA: string;
  personaB: string;
  summary: string | null;
  verdictWinner: DebateVerdict['winner'] | null;
  createdAt: Timestamp;
}

export const ARENA_PERSONAS: Persona[] = [
  {
    id: 'scientist',
    name: 'El Cientifico',
    description: 'Basado en datos y evidencia',
    style: 'Argumenta con evidencia empirica y tono analitico.',
    avatar: '🔬',
  },
  {
    id: 'philosopher',
    name: 'El Filosofo',
    description: 'Reflexivo y profundo',
    style: 'Argumenta desde etica, logica y multiples perspectivas.',
    avatar: '🤔',
  },
  {
    id: 'pragmatist',
    name: 'El Pragmatico',
    description: 'Soluciones practicas',
    style: 'Argumenta por utilidad, costo y resultados concretos.',
    avatar: '⚙️',
  },
  {
    id: 'skeptic',
    name: 'El Esceptico',
    description: 'Cuestiona y valida',
    style: 'Pide evidencia, cuestiona supuestos y falacias.',
    avatar: '🧐',
  },
  {
    id: 'optimist',
    name: 'El Optimista',
    description: 'Detecta oportunidades',
    style: 'Resalta oportunidades con un enfoque positivo.',
    avatar: '🌟',
  },
  {
    id: 'devil',
    name: 'Abogado del Diablo',
    description: 'Defiende lo contrario',
    style: 'Toma la postura opuesta para tensionar argumentos.',
    avatar: '😈',
  },
];

export function getPersonaById(id: string): Persona | undefined {
  return ARENA_PERSONAS.find((persona) => persona.id === id);
}
