import type { Category } from '@/shared/types';
import {
  fetchArxivPapers,
  fetchBooks,
  fetchHackerNews,
  fetchMusicInfo,
  fetchNatureObservations,
  fetchWikipediaArticles,
} from '@/shared/lib/api';
import type { TrendPreviewItem } from '@/features/discover/model/trendRanking';

const getCategoryPrimaryQuery = (category: Category): string => {
  const firstSubgroupQuery = category.subgroups[0]?.apiQuery;
  if (typeof firstSubgroupQuery === 'string' && firstSubgroupQuery.trim().length > 0) {
    return firstSubgroupQuery;
  }
  return category.id;
};

/** The two newest items from a category's outside source, plus how many it returned. */
export const getTrendPreviewForCategory = async (
  category: Category,
): Promise<{ items: TrendPreviewItem[]; liveCount: number }> => {
  const query = getCategoryPrimaryQuery(category);

  switch (category.apiSource) {
    case 'arxiv': {
      const papers = await fetchArxivPapers(query, 6);
      return {
        liveCount: papers.length,
        items: papers.slice(0, 2).map((paper) => ({
          id: paper.id,
          title: paper.title,
          subtitle: paper.authors || 'Autores no disponibles',
          meta: paper.published || 'Paper reciente',
          href: paper.link || null,
        })),
      };
    }
    case 'wikipedia': {
      const articles = await fetchWikipediaArticles(query, 6);
      return {
        liveCount: articles.length,
        items: articles.slice(0, 2).map((article) => ({
          id: String(article.id),
          title: article.title,
          subtitle: article.summary || 'Resumen no disponible',
          meta: 'Wikipedia',
          href: article.link || null,
        })),
      };
    }
    case 'hackernews': {
      const stories = await fetchHackerNews(query, 6);
      return {
        liveCount: stories.length,
        items: stories.slice(0, 2).map((story) => ({
          id: String(story.id),
          title: story.title,
          subtitle: `${story.score.toLocaleString('es-ES')} puntos · ${story.comments.toLocaleString('es-ES')} comentarios`,
          meta: story.time || 'Hacker News',
          href: story.url || null,
        })),
      };
    }
    case 'openlibrary': {
      const books = await fetchBooks(query, 6);
      return {
        liveCount: books.length,
        items: books.slice(0, 2).map((book) => ({
          id: book.id,
          title: book.title,
          subtitle: book.authors || 'Autor no disponible',
          meta: String(book.firstPublished ?? 'Sin fecha'),
          href: book.link || null,
        })),
      };
    }
    case 'inaturalist': {
      const observations = await fetchNatureObservations(query, 6);
      return {
        liveCount: observations.length,
        items: observations.slice(0, 2).map((observation) => ({
          id: String(observation.id),
          title: observation.species,
          subtitle: observation.location || observation.scientificName || 'Ubicacion no disponible',
          meta: observation.observer || 'iNaturalist',
          href: observation.link || null,
        })),
      };
    }
    case 'lastfm': {
      const tracks = await fetchMusicInfo(query, 6);
      return {
        liveCount: tracks.length,
        items: tracks.slice(0, 2).map((track) => ({
          id: String(track.id),
          title: track.title,
          subtitle: track.artist || 'Artista no disponible',
          meta: track.listeners ? `${track.listeners} oyentes` : 'Musica en vivo',
          href: track.link || null,
        })),
      };
    }
    default:
      return { items: [], liveCount: 0 };
  }
};
