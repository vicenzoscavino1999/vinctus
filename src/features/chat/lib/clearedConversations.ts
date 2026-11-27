/**
 * "Limpiar chat local": hides a conversation's messages up to a moment on this device only. Nothing
 * is deleted from the server; "Mostrar mensajes" in the thread brings them back.
 */
const STORAGE_KEY = 'vinctus:clearedConversations';

export type ClearedConversations = Record<string, number>;

export const loadClearedConversations = (): ClearedConversations => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ClearedConversations;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('Error reading cleared conversations:', error);
    return {};
  }
};

const save = (next: ClearedConversations) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('Error saving cleared conversations:', error);
  }
  return next;
};

/** Hides the conversation's messages up to `at` on this device. */
export const clearConversationLocally = (conversationId: string, at: number = Date.now()) =>
  save({ ...loadClearedConversations(), [conversationId]: at });

/** Shows the conversation's messages again. */
export const restoreConversationLocally = (conversationId: string) => {
  const next = { ...loadClearedConversations() };
  delete next[conversationId];
  return save(next);
};
