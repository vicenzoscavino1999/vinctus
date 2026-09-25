// AI Chat service - calls the secure proxy endpoint
import { auth } from './firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';

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
  action?: ChatAction;
}

const parseChatAction = (value: unknown): ChatAction | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const { type, groupId } = value as { type?: unknown; groupId?: unknown };
  return type === 'createGroup' && typeof groupId === 'string' && groupId.length > 0
    ? { type, groupId }
    : undefined;
};

/**
 * Send a message to the AI chat via secure proxy
 * The API key is never exposed to the client
 */
export async function sendChatMessage(
  message: string,
  history: GeminiMessage[] = [],
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
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ message, history }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (payload && typeof payload.response === 'string') {
      return {
        response: payload.response,
        history: Array.isArray(payload.history) ? payload.history : history,
      };
    }
    const errorMessage =
      payload && typeof payload.error === 'string'
        ? payload.error
        : 'Error al comunicarse con el asistente';
    throw new Error(errorMessage);
  }

  const { action, ...rest } = payload as ChatResponse & { action?: unknown };
  const parsedAction = parseChatAction(action);
  return parsedAction ? { ...rest, action: parsedAction } : rest;
}

export type { GeminiMessage, ChatAction, ChatResponse };
