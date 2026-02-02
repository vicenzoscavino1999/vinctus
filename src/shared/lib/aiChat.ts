// AI Chat service - calls the secure proxy endpoint
import { auth } from './firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';

interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface ChatResponse {
  response: string;
  history: GeminiMessage[];
}

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
    body: JSON.stringify({ message, history, idToken: idToken ?? undefined }),
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

  return payload as ChatResponse;
}

export type { GeminiMessage, ChatResponse };
