/**
 * Arena AI - Shared Types
 */

export interface Persona {
  id: string;
  name: string;
  description: string;
  style: string;
}

export type DebateMode = 'debate' | 'brainstorm' | 'decision';
export type DebateStatus = 'running' | 'done' | 'error';
export type DebateVisibility = 'public' | 'private';
export type Speaker = 'A' | 'B';

export interface Turn {
  idx: number;
  speaker: Speaker;
  text: string;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface DebateMetrics {
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  model?: string;
  costEstimate?: number;
}

export interface Debate {
  id?: string;
  createdAt: FirebaseFirestore.Timestamp;
  createdBy: string;
  topic: string;
  mode: DebateMode;
  personaA: string;
  personaB: string;
  status: DebateStatus;
  visibility: DebateVisibility;
  language: string;
  error?: string;
  metrics?: DebateMetrics;
  linkCount?: number;
  sourceCount?: number;
  sourceLinks?: string[];
  sourceMentions?: string[];
  likesCount?: number;
  summary?: string;
  verdict?: {
    winner: 'A' | 'B' | 'draw';
    reason: string;
  };
}

export interface CreateDebateRequest {
  topic: string;
  personaA: string;
  personaB: string;
  visibility?: DebateVisibility;
  clientDebateId?: string;
}
