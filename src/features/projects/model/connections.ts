import type { CollaborationRead } from '@/features/collaborations/api';
import type { FirestoreEvent } from '@/features/events/api';

/** Up to three short labels for a project: its own tags or, without them, place, mode and level. */
export function collaborationTags(item: CollaborationRead): string[] {
  const own = (item.tags || [])
    .filter((tag) => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  if (own.length > 0) return own.slice(0, 3);

  const tags: string[] = [];
  if (item.location) tags.push(item.location);
  tags.push(item.mode === 'virtual' ? 'Virtual' : 'Presencial');
  tags.push(
    item.level === 'experto'
      ? 'Nivel Experto'
      : item.level === 'intermedio'
        ? 'Nivel Intermedio'
        : 'Nivel Principiante',
  );
  return tags.slice(0, 3);
}

/** How the reader stands with a project: theirs, already asked to join, or open to ask. */
export type CollaborationRelation = 'own' | 'requested' | 'open';

export function collaborationRelation(
  item: CollaborationRead,
  uid: string | null,
  requestedIds: ReadonlySet<string>,
): CollaborationRelation {
  if (uid && item.authorId === uid) return 'own';
  if (requestedIds.has(item.id)) return 'requested';
  return 'open';
}

export const RELATION_LABEL: Record<CollaborationRelation, string> = {
  own: 'Tu proyecto',
  requested: 'Solicitud enviada',
  open: 'Solicitar',
};

/** "05", "DIC" and "Vie · 20:00" for an encounter's date. */
export function eventDateParts(value: Date | null): { day: string; month: string; when: string } {
  if (!value) return { day: '--', month: '--', when: 'Fecha por confirmar' };
  const day = value.toLocaleString('es-ES', { day: '2-digit' });
  const month = value.toLocaleString('es-ES', { month: 'short' }).replace('.', '').toUpperCase();
  const weekday = value.toLocaleString('es-ES', { weekday: 'short' }).replace('.', '');
  const time = value.toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return { day, month, when: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · ${time}` };
}

export function eventPlace(event: Pick<FirestoreEvent, 'city' | 'venue'>): string {
  const parts = [event.city, event.venue].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(', ') : 'Ubicación por confirmar';
}

/** Who is going, and whether places are left when the encounter has a capacity. */
export function attendanceLabel(
  count: number,
  capacity: number | null,
): { text: string; isFull: boolean } {
  const isFull = capacity !== null && capacity > 0 && count >= capacity;
  if (isFull) return { text: `Completo · ${count}/${capacity}`, isFull };
  if (capacity !== null && capacity > 0)
    return { text: `${count} de ${capacity} asistentes`, isFull };
  if (count <= 0) return { text: 'Aún sin asistentes', isFull };
  return { text: count === 1 ? '1 asistente' : `${count} asistentes`, isFull };
}

/** Drops what people the reader blocked have published. */
export function withoutBlocked<T>(
  items: readonly T[],
  authorOf: (item: T) => string,
  blocked: ReadonlySet<string>,
): T[] {
  return blocked.size === 0 ? [...items] : items.filter((item) => !blocked.has(authorOf(item)));
}
