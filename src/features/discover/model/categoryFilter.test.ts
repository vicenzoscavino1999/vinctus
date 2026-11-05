import { beforeEach, describe, expect, it } from 'vitest';
import { CATEGORIES } from '@/shared/constants';
import { filterDiscoverCategories, readStoredUserInterests } from './categoryFilter';

const relevance = { category: null, sortBy: 'relevance' };

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
