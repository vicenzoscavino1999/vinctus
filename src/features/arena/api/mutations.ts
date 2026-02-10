import { httpsCallable } from 'firebase/functions';
import { functions } from '@/shared/lib/firebase';
import {
  likeArenaDebateWithSync as likeArenaDebateWithSyncRaw,
  saveArenaDebateWithSync as saveArenaDebateWithSyncRaw,
  unlikeArenaDebateWithSync as unlikeArenaDebateWithSyncRaw,
  unsaveArenaDebateWithSync as unsaveArenaDebateWithSyncRaw,
} from '@/shared/lib/firestore';
import type { CreateDebateParams, CreateDebateResult } from '@/features/arena/types';

type CallableErrorLike = {
  code?: string;
  message?: string;
  details?: unknown;
};

interface SaveArenaDebateInput {
  debateId: string;
  topic: string;
  personaA: string;
  personaB: string;
  summary?: string | null;
  verdictWinner?: 'A' | 'B' | 'draw' | null;
}

const getDebateErrorMessage = (error: unknown): string => {
  const e = error as CallableErrorLike;

  if (e.details && typeof e.details === 'object') {
    const reason = (e.details as { reason?: unknown }).reason;
    if (typeof reason === 'string' && reason.trim().length > 0) {
      return reason;
    }
  }

  switch (e.code) {
    case 'functions/resource-exhausted':
      return typeof e.message === 'string' && e.message.trim().length > 0
        ? e.message
        : 'Has alcanzado el limite diario de debates.';
    case 'functions/unauthenticated':
      return 'Debes iniciar sesion para crear un debate.';
    case 'functions/invalid-argument':
      return typeof e.message === 'string' && e.message.trim().length > 0
        ? e.message
        : 'Los datos del debate no son validos.';
    case 'functions/failed-precondition':
      return typeof e.message === 'string' && e.message.trim().length > 0
        ? e.message
        : 'Arena no esta configurada todavia.';
    case 'functions/unavailable':
      return typeof e.message === 'string' && e.message.trim().length > 0
        ? e.message
        : 'El servicio de IA esta temporalmente no disponible.';
    case 'functions/internal':
      return 'Error interno al generar el debate. Intenta de nuevo.';
    case 'functions/already-exists':
      return typeof e.message === 'string' && e.message.trim().length > 0
        ? e.message
        : 'Ya existe un debate en proceso. Intenta nuevamente.';
    default:
      if (typeof e.message === 'string' && e.message.trim().length > 0) {
        return e.message;
      }
      return 'Error al crear el debate.';
  }
};

export async function createDebate(params: CreateDebateParams): Promise<CreateDebateResult> {
  const createDebateFn = httpsCallable<CreateDebateParams, CreateDebateResult>(
    functions,
    'createDebate',
  );

  try {
    const result = await createDebateFn(params);
    return result.data;
  } catch (error) {
    console.error('createDebate callable failed:', error);
    throw new Error(getDebateErrorMessage(error));
  }
}

export async function saveArenaDebateWithSync(
  input: SaveArenaDebateInput,
  uid: string,
): Promise<void> {
  const safeUid = uid.trim();
  const safeDebateId = input.debateId.trim();
  const safeTopic = input.topic.trim();
  const safePersonaA = input.personaA.trim();
  const safePersonaB = input.personaB.trim();

  if (!safeUid || !safeDebateId || !safeTopic || !safePersonaA || !safePersonaB) {
    throw new Error('No se pudo guardar el debate por datos incompletos.');
  }

  const safeSummary =
    typeof input.summary === 'string' && input.summary.trim().length > 0
      ? input.summary.trim().slice(0, 3000)
      : null;

  const safeWinner =
    input.verdictWinner === 'A' || input.verdictWinner === 'B' || input.verdictWinner === 'draw'
      ? input.verdictWinner
      : null;

  await saveArenaDebateWithSyncRaw(
    {
      debateId: safeDebateId,
      topic: safeTopic.slice(0, 240),
      personaA: safePersonaA.slice(0, 80),
      personaB: safePersonaB.slice(0, 80),
      summary: safeSummary,
      verdictWinner: safeWinner,
    },
    safeUid,
  );
}

export async function unsaveArenaDebateWithSync(debateId: string, uid: string): Promise<void> {
  const safeUid = uid.trim();
  const safeDebateId = debateId.trim();
  if (!safeUid || !safeDebateId) {
    throw new Error('No se pudo actualizar el guardado del debate.');
  }
  await unsaveArenaDebateWithSyncRaw(safeDebateId, safeUid);
}

export async function likeArenaDebateWithSync(debateId: string, uid: string): Promise<void> {
  const safeUid = uid.trim();
  const safeDebateId = debateId.trim();
  if (!safeUid || !safeDebateId) {
    throw new Error('No se pudo registrar el like del debate.');
  }
  await likeArenaDebateWithSyncRaw(safeDebateId, safeUid);
}

export async function unlikeArenaDebateWithSync(debateId: string, uid: string): Promise<void> {
  const safeUid = uid.trim();
  const safeDebateId = debateId.trim();
  if (!safeUid || !safeDebateId) {
    throw new Error('No se pudo actualizar el like del debate.');
  }
  await unlikeArenaDebateWithSyncRaw(safeDebateId, safeUid);
}
