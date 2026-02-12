import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  isArenaDebateLiked as isArenaDebateLikedRaw,
  getSavedArenaDebates as getSavedArenaDebatesRaw,
  isArenaDebateSaved as isArenaDebateSavedRaw,
} from '@/shared/lib/firestore';
import { db, functions } from '@/shared/lib/firebase';
import { safeLimit } from '@/shared/lib/validators';
import type { Debate, Persona, SavedArenaDebate, Turn, UsageStats } from '@/features/arena/types';

const ARENA_DEBATES_COLLECTION = 'arenaDebates';

export function subscribeToDebate(
  debateId: string,
  callback: (debate: Debate | null) => void,
): Unsubscribe {
  const debateRef = doc(db, ARENA_DEBATES_COLLECTION, debateId);
  return onSnapshot(
    debateRef,
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...snap.data() } as Debate);
    },
    (error) => {
      console.error('subscribeToDebate error:', error);
      callback(null);
    },
  );
}

export function subscribeToTurns(debateId: string, callback: (turns: Turn[]) => void): Unsubscribe {
  const turnsRef = collection(db, ARENA_DEBATES_COLLECTION, debateId, 'turns');
  const turnsQuery = query(turnsRef, orderBy('idx', 'asc'));

  return onSnapshot(
    turnsQuery,
    (snap) => {
      const turns = snap.docs.map((turnDoc) => ({ id: turnDoc.id, ...turnDoc.data() })) as Turn[];
      callback(turns);
    },
    (error) => {
      console.error('subscribeToTurns error:', error);
      callback([]);
    },
  );
}

export async function getArenaUsage(): Promise<UsageStats> {
  const usageFn = httpsCallable<void, UsageStats>(functions, 'getArenaUsage');
  const result = await usageFn();
  return result.data;
}

export async function getArenaPersonas(): Promise<Persona[]> {
  const personasFn = httpsCallable<void, Persona[]>(functions, 'getArenaPersonas');
  const result = await personasFn();
  return result.data;
}

export async function getPublicArenaDebates(limitCount = 60): Promise<Debate[]> {
  const safeLimitCount = Number.isFinite(limitCount)
    ? Math.max(1, Math.min(80, Math.trunc(limitCount)))
    : 60;

  const debatesQuery = query(
    collection(db, ARENA_DEBATES_COLLECTION),
    where('visibility', '==', 'public'),
    limit(safeLimitCount),
  );
  const snapshot = await getDocs(debatesQuery);
  return snapshot.docs.map((debateDoc) => ({ id: debateDoc.id, ...debateDoc.data() })) as Debate[];
}

export async function isArenaDebateSaved(debateId: string, uid: string): Promise<boolean> {
  const safeDebateId = debateId.trim();
  const safeUid = uid.trim();
  if (!safeDebateId || !safeUid) return false;
  return isArenaDebateSavedRaw(safeDebateId, safeUid);
}

export async function isArenaDebateLiked(debateId: string, uid: string): Promise<boolean> {
  const safeDebateId = debateId.trim();
  const safeUid = uid.trim();
  if (!safeDebateId || !safeUid) return false;
  return isArenaDebateLikedRaw(safeDebateId, safeUid);
}

export async function getSavedArenaDebates(
  uid: string,
  limitCount: number = 20,
): Promise<SavedArenaDebate[]> {
  const safeUid = uid.trim();
  if (!safeUid) return [];
  const safeLimitCount = safeLimit(limitCount, 20);
  return (await getSavedArenaDebatesRaw(safeUid, safeLimitCount)) as SavedArenaDebate[];
}
