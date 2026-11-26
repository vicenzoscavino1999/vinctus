import {
  fetchArxivPapers,
  fetchBooks,
  fetchHackerNews,
  fetchMusicInfo,
  fetchNatureObservations,
  fetchWikipediaArticles,
} from '@/shared/lib/api';
import type { Category } from '@/shared/types';

/** The newest item of an interest's live source, shown on its tile in Discover. */
export type CategoryHeadline = {
  title: string;
  /** Where it comes from, e.g. "arXiv" or the author. */
  source: string;
  href: string | null;
};

const queryFor = (category: Category): string => {
  const query = category.subgroups[0]?.apiQuery;
  return typeof query === 'string' && query.trim() ? query : category.id;
};

const first = <T>(items: T[], map: (item: T) => CategoryHeadline): CategoryHeadline | null =>
  items.length > 0 ? map(items[0]) : null;

export async function getCategoryHeadline(category: Category): Promise<CategoryHeadline | null> {
  const query = queryFor(category);
  switch (category.apiSource) {
    case 'arxiv':
      return first(await fetchArxivPapers(query, 6), (paper) => ({
        title: paper.title,
        source: 'arXiv',
        href: paper.link || null,
      }));
    case 'wikipedia':
      return first(await fetchWikipediaArticles(query, 6), (article) => ({
        title: article.title,
        source: 'Wikipedia',
        href: article.link || null,
      }));
    case 'hackernews':
      return first(await fetchHackerNews(query, 6), (story) => ({
        title: story.title,
        source: 'Hacker News',
        href: story.url || null,
      }));
    case 'openlibrary':
      return first(await fetchBooks(query, 6), (book) => ({
        title: book.title,
        source: book.authors || 'Open Library',
        href: book.link || null,
      }));
    case 'inaturalist':
      return first(await fetchNatureObservations(query, 6), (observation) => ({
        title: observation.species,
        source: observation.location || 'iNaturalist',
        href: observation.link || null,
      }));
    case 'lastfm':
      return first(await fetchMusicInfo(query, 6), (track) => ({
        title: track.title,
        source: track.artist || 'Música',
        href: track.link || null,
      }));
    default:
      return null;
  }
}
