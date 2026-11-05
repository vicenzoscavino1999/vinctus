import { CATEGORIES } from '@/shared/constants';
import type { Category } from '@/shared/types';
import type { FirestoreGroup } from '@/features/groups/api';

/** How Discover ranks the categories in "Tendencias esta semana". All functions here are pure. */

export type TrendPreviewItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  href: string | null;
};

export type TrendPreviewState = {
  loading: boolean;
  error: string | null;
  items: TrendPreviewItem[];
  liveCount: number;
};

export type TrendScore = {
  follows: number;
  freshness: number;
  score: number;
  social: number;
  sources: number;
};

export type TrendSignals = { liveLabel: string; groupsLabel: string; weeklyLabel: string };

export const EMPTY_TREND_PREVIEW: TrendPreviewState = {
  loading: false,
  error: null,
  items: [],
  liveCount: 0,
};

export const extractHostname = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
};

const getLiveSignalLabel = (category: Category, liveCount: number): string => {
  const normalizedCount = Math.max(0, liveCount);
  if (category.apiSource === 'arxiv') {
    return `${normalizedCount} papers hoy`;
  }
  return `${normalizedCount} novedades hoy`;
};

const formatWeeklyDelta = (deltaPercent: number): string => {
  if (deltaPercent > 0) return `+${deltaPercent}% semanal`;
  if (deltaPercent < 0) return `${deltaPercent}% semanal`;
  return '0% semanal';
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const normalizeByMax = (value: number, max: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return clamp01(value / max);
};

export const countGroupsByCategory = (groups: FirestoreGroup[]): Record<string, number> =>
  groups.reduce<Record<string, number>>((acc, group) => {
    const categoryId = group.categoryId;
    if (!categoryId) return acc;
    acc[categoryId] = (acc[categoryId] ?? 0) + 1;
    return acc;
  }, {});

export const summarizeGroupSocialByCategory = (
  groups: FirestoreGroup[],
): Record<string, { groups: number; members: number }> =>
  groups.reduce<Record<string, { groups: number; members: number }>>((acc, group) => {
    const categoryId = group.categoryId;
    if (!categoryId) return acc;
    if (!acc[categoryId]) {
      acc[categoryId] = { groups: 0, members: 0 };
    }
    acc[categoryId].groups += 1;
    acc[categoryId].members += Math.max(0, group.memberCount ?? 0);
    return acc;
  }, {});

/** Percent change in groups created this week versus the week before, per category. */
export const computeWeeklyDeltaByCategory = (
  groups: FirestoreGroup[],
  now: number = Date.now(),
): Record<string, number> => {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const currentWeekStart = now - weekMs;
  const previousWeekStart = now - weekMs * 2;
  const counters: Record<string, { current: number; previous: number }> = {};

  for (const group of groups) {
    if (!group.categoryId || !group.createdAt) continue;
    const createdAtTime = group.createdAt.getTime();
    if (!Number.isFinite(createdAtTime) || createdAtTime <= 0) continue;
    if (!counters[group.categoryId]) {
      counters[group.categoryId] = { current: 0, previous: 0 };
    }
    if (createdAtTime >= currentWeekStart && createdAtTime <= now) {
      counters[group.categoryId].current += 1;
    } else if (createdAtTime >= previousWeekStart && createdAtTime < currentWeekStart) {
      counters[group.categoryId].previous += 1;
    }
  }

  const result: Record<string, number> = {};
  for (const category of CATEGORIES) {
    const current = counters[category.id]?.current ?? 0;
    const previous = counters[category.id]?.previous ?? 0;
    if (previous === 0) {
      result[category.id] = current > 0 ? 100 : 0;
    } else {
      const raw = ((current - previous) / previous) * 100;
      result[category.id] = Math.round(raw);
    }
  }

  return result;
};

/** How many preview items link out, and to how many different sites, per category. */
export const computeSourceSignalByCategory = (
  trendPreviewState: Record<string, TrendPreviewState>,
): Record<string, { linkCoverage: number; uniqueHosts: number }> =>
  CATEGORIES.reduce<Record<string, { linkCoverage: number; uniqueHosts: number }>>(
    (acc, category) => {
      const preview = trendPreviewState[category.id];
      const items = preview?.items ?? [];
      const hrefs = items
        .map((item) => item.href)
        .filter((href): href is string => typeof href === 'string' && href.trim().length > 0);
      const uniqueHosts = new Set(
        hrefs.map((href) => {
          const host = extractHostname(href);
          return host || href;
        }),
      ).size;
      const linkCoverage = items.length > 0 ? hrefs.length / items.length : 0;
      acc[category.id] = {
        linkCoverage: clamp01(linkCoverage),
        uniqueHosts,
      };
      return acc;
    },
    {},
  );

export const computeTrendScores = ({
  categories,
  trendPreviewState,
  weeklyDeltaByCategory,
  groupCountByCategory,
  groupSocialByCategory,
  sourceSignalByCategory,
  followedCategorySet,
  userInterestSet,
}: {
  categories: Category[];
  trendPreviewState: Record<string, TrendPreviewState>;
  weeklyDeltaByCategory: Record<string, number>;
  groupCountByCategory: Record<string, number>;
  groupSocialByCategory: Record<string, { groups: number; members: number }>;
  sourceSignalByCategory: Record<string, { linkCoverage: number; uniqueHosts: number }>;
  followedCategorySet: Set<string>;
  userInterestSet: Set<string>;
}): Record<string, TrendScore> => {
  const liveCounts = categories.map((category) => trendPreviewState[category.id]?.liveCount ?? 0);
  const groupCounts = categories.map((category) => groupCountByCategory[category.id] ?? 0);
  const memberCounts = categories.map(
    (category) => groupSocialByCategory[category.id]?.members ?? 0,
  );
  const sourceHosts = categories.map(
    (category) => sourceSignalByCategory[category.id]?.uniqueHosts ?? 0,
  );

  const maxLive = Math.max(1, ...liveCounts);
  const maxGroupCount = Math.max(1, ...groupCounts);
  const maxMembers = Math.max(1, ...memberCounts);
  const maxSourceHosts = Math.max(1, ...sourceHosts);

  return categories.reduce<Record<string, TrendScore>>((acc, category) => {
    const categoryId = category.id;
    const liveCount = trendPreviewState[categoryId]?.liveCount ?? 0;
    const weeklyDelta = weeklyDeltaByCategory[categoryId] ?? 0;
    const groupCount = groupCountByCategory[categoryId] ?? 0;
    const memberCount = groupSocialByCategory[categoryId]?.members ?? 0;
    const uniqueHosts = sourceSignalByCategory[categoryId]?.uniqueHosts ?? 0;
    const linkCoverage = sourceSignalByCategory[categoryId]?.linkCoverage ?? 0;

    const freshness = clamp01(
      normalizeByMax(liveCount, maxLive) * 0.65 + clamp01((weeklyDelta + 100) / 200) * 0.35,
    );
    const social = clamp01(
      normalizeByMax(groupCount, maxGroupCount) * 0.45 +
        normalizeByMax(memberCount, maxMembers) * 0.55,
    );
    const sources = clamp01(
      normalizeByMax(uniqueHosts, maxSourceHosts) * 0.7 + clamp01(linkCoverage) * 0.3,
    );
    const follows = followedCategorySet.has(categoryId)
      ? 1
      : userInterestSet.has(categoryId)
        ? 0.45
        : 0;

    const score = clamp01(freshness * 0.35 + social * 0.3 + sources * 0.2 + follows * 0.15);

    acc[categoryId] = {
      follows,
      freshness,
      score,
      social,
      sources,
    };
    return acc;
  }, {});
};

/** Highest score first; ties go to the bigger weekly change, then more live items, then label. */
export const rankTrendCategories = ({
  categories,
  trendScoresByCategory,
  weeklyDeltaByCategory,
  trendPreviewState,
}: {
  categories: Category[];
  trendScoresByCategory: Record<string, TrendScore>;
  weeklyDeltaByCategory: Record<string, number>;
  trendPreviewState: Record<string, TrendPreviewState>;
}): Category[] =>
  [...categories].sort((a, b) => {
    const scoreDiff =
      (trendScoresByCategory[b.id]?.score ?? 0) - (trendScoresByCategory[a.id]?.score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;

    const weeklyDiff = (weeklyDeltaByCategory[b.id] ?? 0) - (weeklyDeltaByCategory[a.id] ?? 0);
    if (weeklyDiff !== 0) return weeklyDiff;

    const liveDiff =
      (trendPreviewState[b.id]?.liveCount ?? 0) - (trendPreviewState[a.id]?.liveCount ?? 0);
    if (liveDiff !== 0) return liveDiff;

    return a.label.localeCompare(b.label, 'es');
  });

export const getTrendSignals = ({
  categoryId,
  trendPreviewState,
  groupCountByCategory,
  weeklyDeltaByCategory,
}: {
  categoryId: string;
  trendPreviewState: Record<string, TrendPreviewState>;
  groupCountByCategory: Record<string, number>;
  weeklyDeltaByCategory: Record<string, number>;
}): TrendSignals => {
  const liveCount = trendPreviewState[categoryId]?.liveCount ?? 0;
  const groupCount = groupCountByCategory[categoryId] ?? 0;
  const category = CATEGORIES.find((item) => item.id === categoryId);
  const weeklyDelta = weeklyDeltaByCategory[categoryId] ?? 0;
  return {
    liveLabel: category ? getLiveSignalLabel(category, liveCount) : `${liveCount} novedades hoy`,
    groupsLabel: `${groupCount} grupos activos`,
    weeklyLabel: formatWeeklyDelta(weeklyDelta),
  };
};
