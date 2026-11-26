import type { ActivityRead } from '@/features/notifications/api';

export type ActivityKind = ActivityRead['type'];
export type ActivityFilter = 'all' | 'unread' | ActivityKind;

export type ActivityActor = {
  uid: string;
  name: string;
  photoURL: string | null;
};

export type ActivitySectionId = 'today' | 'week' | 'month' | 'earlier';

/** One row of the activity list: one notification, or several that read as one. */
export type ActivityGroup = {
  key: string;
  type: ActivityKind;
  section: ActivitySectionId;
  /** Newest first; `latest` is the first one. */
  items: ActivityRead[];
  latest: ActivityRead;
  /** Distinct people, newest first. */
  actors: ActivityActor[];
  read: boolean;
  unreadIds: string[];
};

export type ActivitySection = {
  id: ActivitySectionId;
  title: string;
  groups: ActivityGroup[];
};

const DAY_MS = 86_400_000;

const SECTION_TITLES: Record<ActivitySectionId, string> = {
  today: 'Hoy',
  week: 'Esta semana',
  month: 'Este mes',
  earlier: 'Anteriores',
};
const SECTION_ORDER: ActivitySectionId[] = ['today', 'week', 'month', 'earlier'];

export function sectionFor(date: Date, now: Date): ActivitySectionId {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();
  if (time >= startOfToday) return 'today';
  if (time >= startOfToday - 6 * DAY_MS) return 'week';
  if (time >= startOfToday - 29 * DAY_MS) return 'month';
  return 'earlier';
}

export const matchesFilter = (item: ActivityRead, filter: ActivityFilter): boolean =>
  filter === 'all' ? true : filter === 'unread' ? !item.read : item.type === filter;

const groupKey = (item: ActivityRead, section: ActivitySectionId): string => {
  // Following, unfollowing and following again leaves a notification each time: one row per person.
  if (item.type === 'follow') return `follow:${item.fromUid}`;
  // Likes on the same post read as "Ana y 2 personas más…", within the same period.
  if (item.type === 'post_like' && item.postId) return `like:${item.postId}:${section}`;
  return `item:${item.id}`;
};

/**
 * Activity as people read it, newest first and split into Hoy / Esta semana / Este mes /
 * Anteriores. Repeated follows from one person become one row (placed at the newest), likes on
 * one post within a period become one row; comments stay one per row.
 */
export function groupActivity(items: ActivityRead[], now: Date = new Date()): ActivitySection[] {
  const sorted = [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const groups = new Map<string, ActivityGroup>();

  for (const item of sorted) {
    const section = sectionFor(item.createdAt, now);
    const key = groupKey(item, section);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        type: item.type,
        section,
        items: [],
        latest: item,
        actors: [],
        read: true,
        unreadIds: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
    if (!item.read) {
      group.read = false;
      group.unreadIds.push(item.id);
    }
    if (!group.actors.some((actor) => actor.uid === item.fromUid)) {
      group.actors.push({
        uid: item.fromUid,
        name: item.fromUserName?.trim() || 'Usuario',
        photoURL: item.fromUserPhoto,
      });
    }
  }

  const all = Array.from(groups.values());
  return SECTION_ORDER.map((id) => ({
    id,
    title: SECTION_TITLES[id],
    groups: all.filter((group) => group.section === id),
  })).filter((section) => section.groups.length > 0);
}

/** Who did it and what, e.g. names ["Ana"], others 2, action "le dieron “Me gusta”…". */
export function describeActivity(group: ActivityGroup): {
  names: string[];
  others: number;
  action: string;
} {
  const count = group.actors.length;
  const names =
    count === 2 ? group.actors.map((actor) => actor.name) : [group.actors[0]?.name ?? 'Usuario'];
  const others = count > 2 ? count - 1 : 0;
  const plural = count > 1;
  const action =
    group.type === 'follow'
      ? 'empezó a seguirte'
      : group.type === 'post_like'
        ? `${plural ? 'le dieron' : 'le dio'} “Me gusta” a tu publicación`
        : 'comentó en tu publicación';
  return { names, others, action };
}

/** The whole sentence, e.g. "Ana y 2 personas más le dieron “Me gusta” a tu publicación". */
export function activitySentence(group: ActivityGroup): string {
  const { names, others, action } = describeActivity(group);
  const who =
    others > 0
      ? `${names[0]} y ${others} ${others === 1 ? 'persona más' : 'personas más'}`
      : names.join(' y ');
  return `${who} ${action}`;
}

/** "Ahora", "5 min", "3 h", "2 d", then the date: "12 feb", or "12 feb 2025" for another year. */
export function formatNotificationTime(date: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < 60_000) return 'Ahora';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / 3_600_000)} h`;
  if (elapsed < 7 * DAY_MS) return `${Math.floor(elapsed / DAY_MS)} d`;
  const sameYear = date.getFullYear() === now.getFullYear();
  return date
    .toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
    })
    .replace('.', '');
}
