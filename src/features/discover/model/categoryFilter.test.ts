import { beforeEach, describe, expect, it } from 'vitest';
import { CATEGORIES } from '@/shared/constants';
import type { FirestoreGroup } from '@/features/groups/api';
import {
  filterDiscoverCategories,
  filterRecommendedGroups,
  readStoredUserInterests,
} from './categoryFilter';

const relevance = { category: null, sortBy: 'relevance' };

const group = (
  id: string,
  overrides: Partial<FirestoreGroup> & { createdAt?: Date } = {},
): FirestoreGroup =>
  ({
    id,
    name: id,
    description: '',
    categoryId: 'science',
    memberCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }) as FirestoreGroup;

describe('filterRecommendedGroups', () => {
  const physics = group('physics', {
    name: 'Física Cuántica Hoy',
    categoryId: 'science',
    memberCount: 25,
  });
  const jazz = group('jazz', {
    name: 'Club de Jazz',
    description: 'Discos y vinilos',
    categoryId: 'music',
    memberCount: 15,
  });

  it('searches names, descriptions and category labels, ignoring accents', () => {
    const ids = (searchQuery: string) =>
      filterRecommendedGroups([physics, jazz], { searchQuery, filters: relevance }).map(
        (entry) => entry.id,
      );

    expect(ids('fisica')).toEqual(['physics']);
    expect(ids('vinilos')).toEqual(['jazz']);
    expect(ids('ciencia')).toEqual(['physics']);
  });

  it('applies the category filter and the sorts', () => {
    const ids = (filters: { category: string | null; sortBy: string }) =>
      filterRecommendedGroups(
        [
          jazz,
          physics,
          group('newest', { name: 'Ateneo', createdAt: new Date('2026-06-01T00:00:00Z') }),
        ],
        { searchQuery: '', filters },
      ).map((entry) => entry.id);

    expect(ids({ category: 'music', sortBy: 'relevance' })).toEqual(['jazz']);
    expect(ids(relevance)).toEqual(['physics', 'jazz', 'newest']);
    expect(ids({ category: null, sortBy: 'alphabetical' })).toEqual(['newest', 'jazz', 'physics']);
    expect(ids({ category: null, sortBy: 'recent' })[0]).toBe('newest');
  });

  it('shows four groups, or eight while a search or filter narrows them', () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      group(`g${index}`, { name: `Grupo ${index}` }),
    );

    expect(filterRecommendedGroups(many, { searchQuery: '', filters: relevance })).toHaveLength(4);
    expect(
      filterRecommendedGroups(many, { searchQuery: 'grupo', filters: relevance }),
    ).toHaveLength(8);
    expect(
      filterRecommendedGroups(many, {
        searchQuery: '',
        filters: { category: 'science', sortBy: 'relevance' },
      }),
    ).toHaveLength(8);
  });
});

describe('filterDiscoverCategories', () => {
  it('puts onboarding interests first when sorting by relevance', () => {
    const ids = filterDiscoverCategories(CATEGORIES, {
      searchQuery: '',
      filters: relevance,
      userInterests: ['nature', 'history'],
    }).map((category) => category.id);

    expect(ids.slice(0, 2).sort()).toEqual(['history', 'nature']);
    expect(ids).toHaveLength(CATEGORIES.length);
  });

  it('searches labels, descriptions and subgroup names', () => {
    const ids = filterDiscoverCategories(CATEGORIES, {
      searchQuery: 'antigüedad',
      filters: relevance,
      userInterests: [],
    }).map((category) => category.id);

    expect(ids).toEqual(['history']);
  });

  it('applies the category filter and the alphabetical sort', () => {
    expect(
      filterDiscoverCategories(CATEGORIES, {
        searchQuery: '',
        filters: { category: 'music', sortBy: 'relevance' },
        userInterests: [],
      }).map((category) => category.id),
    ).toEqual(['music']);

    const labels = filterDiscoverCategories(CATEGORIES, {
      searchQuery: '',
      filters: { category: null, sortBy: 'alphabetical' },
      userInterests: [],
    }).map((category) => category.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});

describe('readStoredUserInterests', () => {
  beforeEach(() => localStorage.clear());

  it('reads the stored array and ignores anything else', () => {
    expect(readStoredUserInterests()).toEqual([]);

    localStorage.setItem('vinctus_interests', JSON.stringify(['music']));
    expect(readStoredUserInterests()).toEqual(['music']);

    localStorage.setItem('vinctus_interests', '{"music":true}');
    expect(readStoredUserInterests()).toEqual([]);

    localStorage.setItem('vinctus_interests', 'not json');
    expect(readStoredUserInterests()).toEqual([]);
  });
});
