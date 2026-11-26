import type { Debate } from '@/features/arena/types';
import type { FirestoreGroup } from '@/features/groups/api';
import { toDate } from '@/shared/lib/formatUtils';
import type { Category } from '@/shared/types';

export type DiscoverSort = 'relevance' | 'popular' | 'recent' | 'alphabetical';

export type DiscoverFilters = {
  category: string | null;
  sortBy: string;
};

/** Lower case without accents, so "fisica" finds "Física". */
export const normalizeKeyword = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const isSafeHttpUrl = (value: string | null | undefined): value is string => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const hostnameOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
};

const matchesCategory = (category: Category, query: string): boolean =>
  normalizeKeyword(category.id).includes(query) ||
  normalizeKeyword(category.label).includes(query) ||
  normalizeKeyword(category.description).includes(query) ||
  category.subgroups.some((subgroup) => normalizeKeyword(subgroup.name).includes(query));

/**
 * Interests to show. With the default order the ones the person follows come first, then the
 * ones chosen during onboarding, then the rest in catalog order. The order never depends on data
 * that arrives later, so the tiles do not jump around while the page loads.
 */
export function selectCategories(
  categories: readonly Category[],
  options: {
    query: string;
    filters: DiscoverFilters;
    followed: ReadonlySet<string>;
    interests: ReadonlySet<string>;
    membersByCategory: Readonly<Record<string, number>>;
  },
): Category[] {
  const { filters, followed, interests, membersByCategory } = options;
  const query = normalizeKeyword(options.query.trim());
  let result = categories.filter(
    (category) =>
      (!filters.category || category.id === filters.category) &&
      (!query || matchesCategory(category, query)),
  );
  const catalogIndex = new Map(categories.map((category, index) => [category.id, index]));
  const byCatalog = (a: Category, b: Category) =>
    (catalogIndex.get(a.id) ?? 0) - (catalogIndex.get(b.id) ?? 0);

  switch (filters.sortBy) {
    case 'alphabetical':
      result = [...result].sort((a, b) => a.label.localeCompare(b.label, 'es'));
      break;
    case 'popular':
      result = [...result].sort(
        (a, b) =>
          (membersByCategory[b.id] ?? 0) - (membersByCategory[a.id] ?? 0) || byCatalog(a, b),
      );
      break;
    case 'recent':
      result = [...result].reverse();
      break;
    default: {
      const rank = (category: Category) =>
        followed.has(category.id) ? 0 : interests.has(category.id) ? 1 : 2;
      result = [...result].sort((a, b) => rank(a) - rank(b) || byCatalog(a, b));
    }
  }
  return result;
}

/** Groups that match the search and filters: 4 normally, 8 while searching or filtering. */
export function selectGroups(
  groups: readonly FirestoreGroup[],
  categories: readonly Category[],
  options: { query: string; filters: DiscoverFilters },
): FirestoreGroup[] {
  const { filters } = options;
  const query = normalizeKeyword(options.query.trim());
  const labelOf = (categoryId: string | null | undefined) =>
    categoryId ? (categories.find((category) => category.id === categoryId)?.label ?? '') : '';

  const result = groups.filter((group) => {
    if (filters.category && group.categoryId !== filters.category) return false;
    if (!query) return true;
    return [group.name, group.description, group.categoryId, labelOf(group.categoryId)].some(
      (value) => normalizeKeyword(value || '').includes(query),
    );
  });

  const createdAt = (group: FirestoreGroup) => group.createdAt?.getTime() ?? 0;
  if (filters.sortBy === 'alphabetical') {
    result.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
  } else if (filters.sortBy === 'recent') {
    result.sort((a, b) => createdAt(b) - createdAt(a));
  } else {
    result.sort(
      (a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0) || createdAt(b) - createdAt(a),
    );
  }
  return result.slice(0, query || filters.category ? 8 : 4);
}

/** Members per category, for the "popular" order. */
export const membersByCategory = (groups: readonly FirestoreGroup[]): Record<string, number> =>
  groups.reduce<Record<string, number>>((acc, group) => {
    if (group.categoryId) {
      acc[group.categoryId] = (acc[group.categoryId] ?? 0) + Math.max(0, group.memberCount ?? 0);
    }
    return acc;
  }, {});

export const debateSourceCount = (debate: Debate): number =>
  typeof debate.sourceCount === 'number' ? debate.sourceCount : (debate.linkCount ?? 0);

export const debateLikesCount = (debate: Debate): number =>
  typeof debate.likesCount === 'number' ? Math.max(0, debate.likesCount) : 0;

/** Finished public debates that cite sources: the best sourced and most liked first. */
export function curateDebates(debates: readonly Debate[], limit = 4): Debate[] {
  const score = (debate: Debate) => debateSourceCount(debate) * 3 + debateLikesCount(debate) * 2;
  const time = (debate: Debate) => toDate(debate.createdAt)?.getTime() ?? 0;
  return debates
    .filter((debate) => debate.status === 'done' && debateSourceCount(debate) > 0)
    .sort(
      (a, b) =>
        score(b) - score(a) ||
        debateSourceCount(b) - debateSourceCount(a) ||
        debateLikesCount(b) - debateLikesCount(a) ||
        time(b) - time(a),
    )
    .slice(0, limit);
}

/** Spanish plural for counters such as "1 miembro" / "25 miembros". */
export const countLabel = (count: number, singular: string, plural: string): string =>
  `${count.toLocaleString('es-ES')} ${count === 1 ? singular : plural}`;
