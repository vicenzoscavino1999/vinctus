import { describe, expect, it } from 'vitest';
import type { ActivityRead } from '@/features/notifications/api';
import {
  activitySentence,
  formatNotificationTime,
  groupActivity,
  matchesFilter,
  sectionFor,
} from './activityFeed';

const NOW = new Date(2026, 10, 26, 12, 0, 0);
const daysAgo = (days: number, hours = 0) =>
  new Date(NOW.getTime() - days * 86_400_000 - hours * 3_600_000);

const activity = (overrides: Partial<ActivityRead>): ActivityRead => ({
  id: 'a',
  type: 'post_like',
  toUid: 'me',
  fromUid: 'ana',
  fromUserName: 'Ana',
  fromUserPhoto: null,
  postId: 'p1',
  postSnippet: null,
  commentText: null,
  createdAt: daysAgo(0, 1),
  read: false,
  ...overrides,
});

describe('groupActivity', () => {
  it('folds repeated follows from one person into one row at the newest one', () => {
    const sections = groupActivity(
      [
        activity({
          id: 'f-old',
          type: 'follow',
          fromUid: 'vic',
          fromUserName: 'Vic',
          createdAt: daysAgo(300),
          read: false,
        }),
        activity({
          id: 'f-new',
          type: 'follow',
          fromUid: 'vic',
          fromUserName: 'Vic',
          createdAt: daysAgo(0, 2),
          read: true,
        }),
        activity({
          id: 'f-mid',
          type: 'follow',
          fromUid: 'vic',
          fromUserName: 'Vic',
          createdAt: daysAgo(40),
          read: false,
        }),
      ],
      NOW,
    );
    expect(sections.map((section) => section.id)).toEqual(['today']);
    const [group] = sections[0].groups;
    expect(group.items.map((item) => item.id)).toEqual(['f-new', 'f-mid', 'f-old']);
    expect(group.read).toBe(false);
    expect(group.unreadIds).toEqual(['f-mid', 'f-old']);
    expect(activitySentence(group)).toBe('Vic empezó a seguirte');
  });

  it('joins likes on the same post within a period and names them like Instagram', () => {
    const sections = groupActivity(
      [
        activity({ id: 'l1', fromUid: 'ana', fromUserName: 'Ana', createdAt: daysAgo(0, 1) }),
        activity({ id: 'l2', fromUid: 'bruno', fromUserName: 'Bruno', createdAt: daysAgo(0, 2) }),
        activity({ id: 'l3', fromUid: 'carla', fromUserName: 'Carla', createdAt: daysAgo(0, 3) }),
        activity({
          id: 'l4',
          fromUid: 'dani',
          fromUserName: 'Dani',
          postId: 'p2',
          createdAt: daysAgo(0, 4),
        }),
        activity({ id: 'l5', fromUid: 'eva', fromUserName: 'Eva', createdAt: daysAgo(3) }),
      ],
      NOW,
    );
    const today = sections.find((section) => section.id === 'today');
    expect(today?.groups.map(activitySentence)).toEqual([
      'Ana y 2 personas más le dieron “Me gusta” a tu publicación',
      'Dani le dio “Me gusta” a tu publicación',
    ]);
    const week = sections.find((section) => section.id === 'week');
    expect(week?.groups.map(activitySentence)).toEqual(['Eva le dio “Me gusta” a tu publicación']);
  });

  it('names two people and keeps comments one per row', () => {
    const sections = groupActivity(
      [
        activity({ id: 'l1', fromUid: 'ana', fromUserName: 'Ana' }),
        activity({ id: 'l2', fromUid: 'bruno', fromUserName: 'Bruno', createdAt: daysAgo(0, 2) }),
        activity({ id: 'c1', type: 'post_comment', fromUid: 'ana', commentText: 'Bien' }),
        activity({ id: 'c2', type: 'post_comment', fromUid: 'ana', commentText: 'Otra' }),
      ],
      NOW,
    );
    expect(sections[0].groups.map(activitySentence)).toEqual([
      'Ana y Bruno le dieron “Me gusta” a tu publicación',
      'Ana comentó en tu publicación',
      'Ana comentó en tu publicación',
    ]);
  });
});

describe('time helpers', () => {
  it('splits into today, this week, this month and earlier', () => {
    expect(sectionFor(daysAgo(0, 11), NOW)).toBe('today');
    expect(sectionFor(daysAgo(1), NOW)).toBe('week');
    expect(sectionFor(daysAgo(6), NOW)).toBe('week');
    expect(sectionFor(daysAgo(8), NOW)).toBe('month');
    expect(sectionFor(daysAgo(45), NOW)).toBe('earlier');
  });

  it('shows short relative times, then the date instead of "Hace 288 d"', () => {
    expect(formatNotificationTime(new Date(NOW.getTime() - 20_000), NOW)).toBe('Ahora');
    expect(formatNotificationTime(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe('5 min');
    expect(formatNotificationTime(daysAgo(0, 3), NOW)).toBe('3 h');
    expect(formatNotificationTime(daysAgo(2), NOW)).toBe('2 d');
    expect(formatNotificationTime(new Date(2026, 1, 12), NOW)).toBe('12 feb');
    expect(formatNotificationTime(new Date(2025, 1, 12), NOW)).toBe('12 feb 2025');
  });

  it('filters by unread and by type', () => {
    expect(matchesFilter(activity({ read: true }), 'unread')).toBe(false);
    expect(matchesFilter(activity({ type: 'follow' }), 'follow')).toBe(true);
    expect(matchesFilter(activity({ type: 'follow' }), 'post_like')).toBe(false);
  });
});
