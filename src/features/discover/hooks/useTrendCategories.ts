import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category } from '@/shared/types';
import type { FirestoreGroup } from '@/features/groups/api';
import { getTrendPreviewForCategory } from '@/features/discover/api/trendPreview';
import {
  EMPTY_TREND_PREVIEW,
  computeSourceSignalByCategory,
  computeTrendScores,
  computeWeeklyDeltaByCategory,
  countGroupsByCategory,
  getTrendSignals as buildTrendSignals,
  rankTrendCategories,
  summarizeGroupSocialByCategory,
  type TrendPreviewState,
  type TrendSignals,
} from '@/features/discover/model/trendRanking';

/**
 * "Tendencias esta semana": ranks the visible categories, loads each one's outside-source preview
 * and tracks which card the preview panel shows.
 */
export const useTrendCategories = ({
  categories,
  groups,
  followedCategories,
  userInterests,
}: {
  categories: Category[];
  groups: FirestoreGroup[];
  followedCategories: string[];
  userInterests: string[];
}) => {
  const [activeTrendCategoryId, setActiveTrendCategoryId] = useState<string | null>(null);
  const [trendPreviewState, setTrendPreviewState] = useState<Record<string, TrendPreviewState>>({});
  const previewRequestedRef = useRef<Set<string>>(new Set());

  const groupCountByCategory = useMemo(() => countGroupsByCategory(groups), [groups]);
  const groupSocialByCategory = useMemo(() => summarizeGroupSocialByCategory(groups), [groups]);
  const weeklyDeltaByCategory = useMemo(() => computeWeeklyDeltaByCategory(groups), [groups]);
  const sourceSignalByCategory = useMemo(
    () => computeSourceSignalByCategory(trendPreviewState),
    [trendPreviewState],
  );

  const followedCategorySet = useMemo(() => new Set(followedCategories), [followedCategories]);
  const userInterestSet = useMemo(() => new Set(userInterests), [userInterests]);

  const trendScoresByCategory = useMemo(
    () =>
      computeTrendScores({
        categories,
        trendPreviewState,
        weeklyDeltaByCategory,
        groupCountByCategory,
        groupSocialByCategory,
        sourceSignalByCategory,
        followedCategorySet,
        userInterestSet,
      }),
    [
      categories,
      trendPreviewState,
      weeklyDeltaByCategory,
      groupCountByCategory,
      groupSocialByCategory,
      sourceSignalByCategory,
      followedCategorySet,
      userInterestSet,
    ],
  );

  const rankedTrendCategories = useMemo(
    () =>
      rankTrendCategories({
        categories,
        trendScoresByCategory,
        weeklyDeltaByCategory,
        trendPreviewState,
      }),
    [categories, trendScoresByCategory, weeklyDeltaByCategory, trendPreviewState],
  );

  const trendRankPositionByCategory = useMemo(() => {
    return rankedTrendCategories.reduce<Record<string, number>>((acc, category, index) => {
      acc[category.id] = index + 1;
      return acc;
    }, {});
  }, [rankedTrendCategories]);

  const trendCards = useMemo(() => rankedTrendCategories.slice(0, 4), [rankedTrendCategories]);
  const featuredTrendCategory = trendCards[0] ?? null;
  const secondaryTrendCategories = trendCards.slice(1);

  // The preview stays on the card it first showed (or the one the user picked) while the ranking
  // settles, and moves to the first card only when that one leaves the top four. Adjusted while
  // rendering rather than in an effect, so it needs no second render pass.
  const pinnedTrendCategoryId =
    trendCards.length === 0
      ? null
      : activeTrendCategoryId &&
          trendCards.some((category) => category.id === activeTrendCategoryId)
        ? activeTrendCategoryId
        : trendCards[0].id;
  if (pinnedTrendCategoryId !== activeTrendCategoryId) {
    setActiveTrendCategoryId(pinnedTrendCategoryId);
  }

  const activeTrendCategory = useMemo(
    () =>
      trendCards.find((category) => category.id === activeTrendCategoryId) ?? trendCards[0] ?? null,
    [trendCards, activeTrendCategoryId],
  );
  const activeTrendPreview = activeTrendCategory
    ? (trendPreviewState[activeTrendCategory.id] ?? EMPTY_TREND_PREVIEW)
    : null;

  const getTrendSignals = useCallback(
    (categoryId: string): TrendSignals =>
      buildTrendSignals({
        categoryId,
        trendPreviewState,
        groupCountByCategory,
        weeklyDeltaByCategory,
      }),
    [groupCountByCategory, trendPreviewState, weeklyDeltaByCategory],
  );

  const loadTrendPreview = useCallback(async (category: Category) => {
    const categoryId = category.id;
    if (previewRequestedRef.current.has(categoryId)) return;

    previewRequestedRef.current.add(categoryId);
    setTrendPreviewState((prev) => ({
      ...prev,
      [categoryId]: {
        loading: true,
        error: null,
        items: prev[categoryId]?.items ?? [],
        liveCount: prev[categoryId]?.liveCount ?? 0,
      },
    }));

    try {
      const preview = await getTrendPreviewForCategory(category);
      setTrendPreviewState((prev) => ({
        ...prev,
        [categoryId]: {
          loading: false,
          error: null,
          items: preview.items,
          liveCount: preview.liveCount,
        },
      }));
    } catch (previewError) {
      console.error('Error loading trend preview:', previewError);
      previewRequestedRef.current.delete(categoryId);
      setTrendPreviewState((prev) => ({
        ...prev,
        [categoryId]: {
          loading: false,
          error: 'No se pudo cargar la vista previa.',
          items: prev[categoryId]?.items ?? [],
          liveCount: prev[categoryId]?.liveCount ?? 0,
        },
      }));
    }
  }, []);

  // The card in the preview panel first, then every visible category (the ranking uses their
  // previews). loadTrendPreview skips categories already loaded or loading.
  useEffect(() => {
    const toLoad = activeTrendCategory ? [activeTrendCategory, ...categories] : categories;
    toLoad.forEach((category) => {
      void loadTrendPreview(category);
    });
  }, [activeTrendCategory, categories, loadTrendPreview]);

  const activateTrendCategory = useCallback(
    (category: Category) => {
      setActiveTrendCategoryId(category.id);
      void loadTrendPreview(category);
    },
    [loadTrendPreview],
  );

  return {
    trendCards,
    featuredTrendCategory,
    secondaryTrendCategories,
    activeTrendCategory,
    activeTrendPreview,
    activateTrendCategory,
    getTrendSignals,
    trendRankPositionByCategory,
    trendScoresByCategory,
  };
};

export type TrendCategories = ReturnType<typeof useTrendCategories>;
