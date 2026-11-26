import { CATEGORIES } from '@/shared/constants';
import type { Category } from '@/shared/types';
import type { FirestoreGroup } from '@/features/groups/api';
import { normalizeKeyword } from '@/features/discover/model/textHelpers';

export type SearchFiltersState = {
  category: string | null;
  sortBy: string;
};

/** Discover's category list after the search box, the filter sheet and onboarding interests. */
export const filterDiscoverCategories = (
  categories: Category[],
  {
    searchQuery,
    filters,
    userInterests,
  }: { searchQuery: string; filters: SearchFiltersState; userInterests: string[] },
): Category[] => {
  let result = [...categories];

  // Sort: user interests first (personalization from onboarding)
  if (userInterests.length > 0 && filters.sortBy === 'relevance') {
    result.sort((a, b) => {
      const aIsInterest = userInterests.includes(a.id);
      const bIsInterest = userInterests.includes(b.id);
      if (aIsInterest && !bIsInterest) return -1;
      if (!aIsInterest && bIsInterest) return 1;
      return 0;
    });
  }
  if (filters.category) {
    result = result.filter((cat) => cat.id === filters.category);
  }

  // Apply search query (accent-insensitive across category labels, descriptions, IDs, and subgroups)
  const normalizedQuery = normalizeKeyword(searchQuery.trim());
  if (normalizedQuery) {
    result = result.filter(
      (cat) =>
        normalizeKeyword(cat.id).includes(normalizedQuery) ||
        normalizeKeyword(cat.label).includes(normalizedQuery) ||
        normalizeKeyword(cat.description).includes(normalizedQuery) ||
        cat.subgroups.some((sub) => normalizeKeyword(sub.name).includes(normalizedQuery)),
    );
  }

  // Apply sorting
  if (filters.sortBy === 'alphabetical') {
    result = [...result].sort((a, b) => a.label.localeCompare(b.label, 'es'));
  } else if (filters.sortBy === 'popular') {
    // Sort by active group/member activity first, falling back to subgroup count
    result = [...result].sort((a, b) => b.subgroups.length - a.subgroups.length);
  } else if (filters.sortBy === 'recent') {
    // For now, reverse the default order to simulate "recent"
    result = [...result].reverse();
  }

  return result;
};

/**
 * "Grupos recomendados" after the search box and the filter sheet: four groups by default, eight
 * while a search or category filter narrows them.
 */
export const filterRecommendedGroups = (
  groups: FirestoreGroup[],
  { searchQuery, filters }: { searchQuery: string; filters: SearchFiltersState },
): FirestoreGroup[] => {
  let result = [...groups];
  const normalizedQuery = normalizeKeyword(searchQuery.trim());

  if (filters.category) {
    result = result.filter((group) => group.categoryId === filters.category);
  }

  if (normalizedQuery) {
    result = result.filter((group) => {
      const categoryLabel = group.categoryId
        ? (CATEGORIES.find((cat) => cat.id === group.categoryId)?.label ?? '')
        : '';
      return (
        normalizeKeyword(group.name || '').includes(normalizedQuery) ||
        normalizeKeyword(group.description || '').includes(normalizedQuery) ||
        normalizeKeyword(group.categoryId || '').includes(normalizedQuery) ||
        normalizeKeyword(categoryLabel).includes(normalizedQuery)
      );
    });
  }

  if (filters.sortBy === 'alphabetical') {
    result.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
  } else if (filters.sortBy === 'recent') {
    result.sort((a, b) => {
      const aTime = a.createdAt?.getTime() ?? 0;
      const bTime = b.createdAt?.getTime() ?? 0;
      return bTime - aTime;
    });
  } else {
    result.sort((a, b) => {
      const aMembers = a.memberCount ?? 0;
      const bMembers = b.memberCount ?? 0;
      if (aMembers !== bMembers) return bMembers - aMembers;
      const aTime = a.createdAt?.getTime() ?? 0;
      const bTime = b.createdAt?.getTime() ?? 0;
      return bTime - aTime;
    });
  }

  const maxVisible = normalizedQuery || filters.category ? 8 : 4;
  return result.slice(0, maxVisible);
};

/** Category ids the user picked during onboarding; [] when missing or unreadable. */
export const readStoredUserInterests = (): string[] => {
  try {
    const stored = localStorage.getItem('vinctus_interests');
    const parsed = stored ? JSON.parse(stored) : [];
    // Ensure it's always an array to prevent .length/.includes errors
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
