// AI Chat service - calls the secure proxy endpoint
import { auth } from './firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { LIMITS } from '@/shared/lib/firestore/firestoreContract';

interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

/** Something the assistant did on the user's behalf, e.g. the group it just created. */
interface ChatAction {
  type: 'createGroup';
  groupId: string;
}

interface ChatResponse {
  response: string;
  history: GeminiMessage[];
  provider?: 'openai' | 'gemini' | 'nvidia';
  image?: string;
  action?: ChatAction;
}

const MAX_HISTORY_MESSAGES = LIMITS.aiChat.historyMaxMessages;
const MAX_PART_TEXT_CHARS = 2000;
const MAX_TOTAL_HISTORY_CHARS = LIMITS.aiChat.historyMaxTotalLength;
const SAFE_DATA_IMAGE_REGEX = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const parseChatAction = (value: unknown): ChatAction | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const { type, groupId } = value as { type?: unknown; groupId?: unknown };
  return type === 'createGroup' && typeof groupId === 'string' && groupId.length > 0
    ? { type, groupId }
    : undefined;
};

const parseSafeDataImage = (value: unknown): string | undefined =>
  typeof value === 'string' && SAFE_DATA_IMAGE_REGEX.test(value) ? value : undefined;

/**
 * Keeps the newest valid history entries within api/chat.ts limits
 * (20 messages, 2,000 chars per part, 12,000 total chars, starting with 'user').
 */
export function trimChatHistory(history: GeminiMessage[]): GeminiMessage[] {
  const normalized: GeminiMessage[] = [];
  for (const entry of history) {
    if (entry.role !== 'user' && entry.role !== 'model') continue;
    const parts = entry.parts
      .map((part) => ({ text: part.text.trim().slice(0, MAX_PART_TEXT_CHARS) }))
      .filter((part) => part.text.length > 0)
      .slice(0, 2);
    if (parts.length > 0) {
      normalized.push({ role: entry.role, parts });
    }
  }

  const trimmed = normalized.slice(-MAX_HISTORY_MESSAGES);
  const countChars = (entry: GeminiMessage) =>
    entry.parts.reduce((sum, part) => sum + part.text.length, 0);
  let totalChars = trimmed.reduce((sum, entry) => sum + countChars(entry), 0);

  while (trimmed.length > 0 && totalChars > MAX_TOTAL_HISTORY_CHARS) {
    const removed = trimmed.shift();
    if (removed) {
      totalChars -= countChars(removed);
    }
  }

  while (trimmed.length > 0 && trimmed[0]?.role !== 'user') {
    trimmed.shift();
  }

  return trimmed;
}

/**
 * Send a message to the AI chat via secure proxy
 * The API key is never exposed to the client
 */
export async function sendChatMessage(
  message: string,
  history: GeminiMessage[] = [],
  useOpenAI = false,
  options: { image?: string; generateImage?: boolean } = {},
): Promise<ChatResponse> {
  const waitForUser = (timeoutMs = 8000): Promise<User | null> =>
    new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        unsubscribe();
        resolve(auth.currentUser ?? null);
      }, timeoutMs);

      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (!firebaseUser) {
          return; // keep waiting until auth is ready
        }
        clearTimeout(timeoutId);
        unsubscribe();
        resolve(firebaseUser);
      });
    });

  const firebaseUser = auth.currentUser ?? (await waitForUser());
  let idToken = await firebaseUser?.getIdToken(true).catch(() => null);
  if (!idToken && firebaseUser) {
    idToken = await firebaseUser.getIdToken().catch(() => null);
  }
  const safeHistory = trimChatHistory(history);
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ message, history: safeHistory, useOpenAI, ...options }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (payload && typeof payload.response === 'string') {
      return {
        response: payload.response,
        history: Array.isArray(payload.history) ? trimChatHistory(payload.history) : safeHistory,
      };
    }
    const errorMessage =
      payload && typeof payload.error === 'string'
        ? payload.error
        : 'Error al comunicarse con el asistente';
    throw new Error(errorMessage);
  }

  if (!payload || typeof payload !== 'object' || typeof payload.response !== 'string') {
    throw new Error('Respuesta inválida del asistente');
  }

  const {
    action,
    image,
    history: nextHistory,
    ...rest
  } = payload as ChatResponse & {
    action?: unknown;
    image?: unknown;
    history?: unknown;
  };
  const parsedAction = parseChatAction(action);
  const safeImage = parseSafeDataImage(image);
  const normalizedHistory = Array.isArray(nextHistory)
    ? trimChatHistory(nextHistory as GeminiMessage[])
    : safeHistory;

  return {
    ...rest,
    history: normalizedHistory,
    ...(safeImage ? { image: safeImage } : {}),
    ...(parsedAction ? { action: parsedAction } : {}),
  };
}

export type { GeminiMessage, ChatAction, ChatResponse };
