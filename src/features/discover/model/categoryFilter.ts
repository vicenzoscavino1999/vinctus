import type { Category } from '@/shared/types';

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

  // Apply search query
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    result = result.filter(
      (cat) =>
        cat.label.toLowerCase().includes(query) ||
        cat.description.toLowerCase().includes(query) ||
        cat.subgroups.some((sub) => sub.name.toLowerCase().includes(query)),
    );
  }

  // Apply sorting
  if (filters.sortBy === 'alphabetical') {
    result = [...result].sort((a, b) => a.label.localeCompare(b.label));
  } else if (filters.sortBy === 'popular') {
    // Sort by number of subgroups as proxy for popularity
    result = [...result].sort((a, b) => b.subgroups.length - a.subgroups.length);
  } else if (filters.sortBy === 'recent') {
    // For now, reverse the default order to simulate "recent"
    // In production, this would sort by a real timestamp
    result = [...result].reverse();
  }

  return result;
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
