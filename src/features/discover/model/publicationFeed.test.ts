import { describe, expect, it } from 'vitest';
import {
  YOUTUBE_FALLBACK_QUERY,
  buildCandidatePublicationStream,
  getPublicationDedupeKey,
  inferCategoryIdFromText,
  type PublicationStreamItem,
} from './publicationFeed';

const item = (
  source: PublicationStreamItem['source'],
  id: string,
  overrides: Partial<PublicationStreamItem> = {},
): PublicationStreamItem => ({
  streamKey: `${source}-${id}`,
  id,
  postId: source === 'community' ? id : null,
  title: `${source} ${id}`,
  body: '',
  group: 'g',
  category: 'Ciencia',
  categoryId: 'science',
  image: 'img',
  likes: 0,
  comments: 0,
  source,
  youtubeVideoId: source === 'youtube' ? id : null,
  ...overrides,
});

const many = (source: PublicationStreamItem['source'], count: number) =>
  Array.from({ length: count }, (_, index) => item(source, `${source[0]}${index}`));

describe('buildCandidatePublicationStream', () => {
  it('keeps about a third of the slots for YouTube in the mixed feed', () => {
    const stream = buildCandidatePublicationStream({
      communityPublications: many('community', 10),
      youtubePublications: many('youtube', 10),
      targetCount: 6,
      youtubeQuery: YOUTUBE_FALLBACK_QUERY,
    });

    expect(stream.map((entry) => entry.source)).toEqual([
      'community',
      'community',
      'community',
      'youtube',
      'youtube',
      'youtube',
    ]);
  });

  it('puts YouTube results first while the user searches YouTube', () => {
    const stream = buildCandidatePublicationStream({
      communityPublications: many('community', 2),
      youtubePublications: many('youtube', 4),
      targetCount: 6,
      youtubeQuery: 'jazz',
    });

    expect(stream.map((entry) => entry.source)).toEqual([
      'youtube',
      'youtube',
      'youtube',
      'youtube',
      'community',
      'community',
    ]);
  });

  it('fills the rest with unique editorial items when the sources are short', () => {
    const stream = buildCandidatePublicationStream({
      communityPublications: many('community', 1),
      youtubePublications: [],
      targetCount: 12,
      youtubeQuery: YOUTUBE_FALLBACK_QUERY,
    });

    expect(stream).toHaveLength(12);
    expect(stream[0].source).toBe('community');
    expect(stream.slice(1).every((entry) => entry.source === 'editorial')).toBe(true);
    expect(new Set(stream.map(getPublicationDedupeKey)).size).toBe(12);
  });

  it('drops repeated posts', () => {
    const post = item('community', 'p1');
    const stream = buildCandidatePublicationStream({
      communityPublications: [post, { ...post, streamKey: 'community-p1-again' }],
      youtubePublications: [],
      targetCount: 6,
      youtubeQuery: YOUTUBE_FALLBACK_QUERY,
    });

    expect(stream.filter((entry) => entry.id === 'p1')).toHaveLength(1);
  });
});

describe('inferCategoryIdFromText', () => {
  it('matches hints without accents or case', () => {
    expect(inferCategoryIdFromText('Noche de JAZZ en vivo')).toBe('music');
    expect(inferCategoryIdFromText('Física cuántica para todos')).toBe('science');
  });

  it('falls back to technology', () => {
    expect(inferCategoryIdFromText('zzz')).toBe('technology');
  });
});
