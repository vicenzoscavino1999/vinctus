import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@/shared/constants';
import type { FirestoreGroup } from '@/features/groups/api';
import {
  computeSourceSignalByCategory,
  computeTrendScores,
  computeWeeklyDeltaByCategory,
  countGroupsByCategory,
  getTrendSignals,
  rankTrendCategories,
  summarizeGroupSocialByCategory,
  type TrendPreviewState,
} from './trendRanking';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const group = (categoryId: string, daysAgo: number, memberCount = 0): FirestoreGroup =>
  ({
    id: `${categoryId}-${daysAgo}-${memberCount}`,
    name: 'g',
    categoryId,
    memberCount,
    createdAt: new Date(NOW - daysAgo * DAY),
  }) as FirestoreGroup;

const preview = (liveCount: number, hrefs: (string | null)[] = []): TrendPreviewState => ({
  loading: false,
  error: null,
  liveCount,
  items: hrefs.map((href, index) => ({
    id: String(index),
    title: 't',
    subtitle: 's',
    meta: 'm',
    href,
  })),
});

const scoresFor = ({
  groups = [],
  previews = {},
  followed = [],
  interests = [],
}: {
  groups?: FirestoreGroup[];
  previews?: Record<string, TrendPreviewState>;
  followed?: string[];
  interests?: string[];
}) =>
  computeTrendScores({
    categories: CATEGORIES,
    trendPreviewState: previews,
    weeklyDeltaByCategory: computeWeeklyDeltaByCategory(groups, NOW),
    groupCountByCategory: countGroupsByCategory(groups),
    groupSocialByCategory: summarizeGroupSocialByCategory(groups),
    sourceSignalByCategory: computeSourceSignalByCategory(previews),
    followedCategorySet: new Set(followed),
    userInterestSet: new Set(interests),
  });

describe('computeWeeklyDeltaByCategory', () => {
  it('compares groups created this week with the week before', () => {
    const delta = computeWeeklyDeltaByCategory(
      [group('science', 1), group('science', 2), group('science', 9), group('music', 3)],
      NOW,
    );

    expect(delta.science).toBe(100);
    expect(delta.music).toBe(100);
    expect(delta.history).toBe(0);
  });

  it('reports a drop as a negative percent', () => {
    const delta = computeWeeklyDeltaByCategory(
      [group('science', 1), group('science', 8), group('science', 9)],
      NOW,
    );

    expect(delta.science).toBe(-50);
  });
});

describe('computeSourceSignalByCategory', () => {
  it('counts distinct sites and the share of items with a link', () => {
    const signal = computeSourceSignalByCategory({
      science: preview(3, ['https://www.arxiv.org/a', 'https://arxiv.org/b', null, 'https://x.io']),
    });

    expect(signal.science).toEqual({ linkCoverage: 0.75, uniqueHosts: 2 });
    expect(signal.music).toEqual({ linkCoverage: 0, uniqueHosts: 0 });
  });
});

describe('computeTrendScores and rankTrendCategories', () => {
  it('ranks followed categories above interests and interests above the rest', () => {
    const scores = scoresFor({ followed: ['nature'], interests: ['history'] });

    expect(scores.nature.follows).toBe(1);
    expect(scores.history.follows).toBe(0.45);
    expect(scores.nature.score).toBeGreaterThan(scores.history.score);
    expect(scores.history.score).toBeGreaterThan(scores.science.score);
  });

  it('breaks score ties by label, in Spanish order', () => {
    const scores = scoresFor({});
    const ranked = rankTrendCategories({
      categories: CATEGORIES,
      trendScoresByCategory: scores,
      weeklyDeltaByCategory: {},
      trendPreviewState: {},
    });

    const labels = ranked.map((category) => category.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('puts the category with more live items and groups first', () => {
    const scores = scoresFor({
      groups: [group('music', 1, 40), group('music', 2, 10)],
      previews: { music: preview(6) },
    });
    const ranked = rankTrendCategories({
      categories: CATEGORIES,
      trendScoresByCategory: scores,
      weeklyDeltaByCategory: {},
      trendPreviewState: { music: preview(6) },
    });

    expect(ranked[0].id).toBe('music');
  });
});

describe('getTrendSignals', () => {
  it('labels papers for arXiv categories and news for the rest', () => {
    const args = {
      trendPreviewState: { science: preview(4), music: preview(2) },
      groupCountByCategory: { science: 3 },
      weeklyDeltaByCategory: { science: 25, music: -10 },
    };

    expect(getTrendSignals({ categoryId: 'science', ...args })).toEqual({
      liveLabel: '4 papers hoy',
      groupsLabel: '3 grupos activos',
      weeklyLabel: '+25% semanal',
    });
    expect(getTrendSignals({ categoryId: 'music', ...args })).toEqual({
      liveLabel: '2 novedades hoy',
      groupsLabel: '0 grupos activos',
      weeklyLabel: '-10% semanal',
    });
  });
});
