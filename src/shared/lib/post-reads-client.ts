import { Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/shared/lib/firebase';

export type PostReadCursor = string;
export interface PostPage<T> {
  items: T[];
  lastDoc: PostReadCursor | null;
  hasMore: boolean;
}
export interface PostReadRequest {
  view: 'feed' | 'author' | 'group' | 'category' | 'comments' | 'ids' | 'saved' | 'groupSummary';
  id?: string;
  ids?: string[];
  limit?: number;
  cursor?: string;
}

const wireTime = (value: unknown): Timestamp | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as { seconds?: unknown; nanoseconds?: unknown };
  return typeof record.seconds === 'number' && typeof record.nanoseconds === 'number'
    ? new Timestamp(record.seconds, record.nanoseconds)
    : null;
};

export async function readPostRecords(request: PostReadRequest) {
  const uid = auth.currentUser?.uid ?? null;
  if (!uid || auth.currentUser?.isAnonymous)
    throw new Error('Inicia sesión para leer publicaciones.');
  const callable = httpsCallable<PostReadRequest, unknown>(functions, 'readPosts', {
    timeout: 20000,
  });
  const { data } = await callable(request);
  if ((auth.currentUser?.uid ?? null) !== uid)
    throw new Error('La sesión cambió. Actualiza la lista.');
  if (!data || typeof data !== 'object') throw new Error('No se pudo cargar la lista.');
  const response = data as Record<string, unknown>;
  if (
    !Array.isArray(response.items) ||
    typeof response.hasMore !== 'boolean' ||
    (response.cursor !== null &&
      (typeof response.cursor !== 'string' || !/^[a-f0-9]{32}$/.test(response.cursor))) ||
    (response.hasMore && !response.cursor)
  )
    throw new Error('La página recibida no es válida.');
  const items = response.items.map((item: unknown): Record<string, unknown> => {
    if (!item || typeof item !== 'object' || typeof (item as { id?: unknown }).id !== 'string') {
      throw new Error('La publicación recibida no es válida.');
    }
    const record = item as Record<string, unknown>;
    return {
      ...record,
      createdAt: wireTime(record.createdAt),
      updatedAt: wireTime(record.updatedAt),
    };
  });
  return {
    items,
    lastDoc: response.cursor as string | null,
    hasMore: response.hasMore,
    weeklyPosts: typeof response.weeklyPosts === 'number' ? response.weeklyPosts : 0,
  };
}
