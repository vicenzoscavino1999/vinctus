import { describe, expect, it } from 'vitest';
import { moderateUserText, parseReportedContentTarget } from './moderation';

const blocked = (text: string) => moderateUserText([text]).blocked;

describe('moderateUserText', () => {
  it('blocks threats, hate speech, sexual content and direct insults', () => {
    expect(blocked('Te voy a matar mañana')).toBe(true);
    expect(blocked('eres un maricón')).toBe(true);
    expect(blocked('F*ck... no: fuck you')).toBe(true);
    expect(blocked('Hijo de PUTA')).toBe(true);
    expect(blocked('send nudes')).toBe(true);
    expect(blocked('kys')).toBe(true);
  });

  it('matches plurals and ignores accents and punctuation', () => {
    expect(blocked('putas')).toBe(true);
    expect(blocked('maricones')).toBe(true);
    expect(blocked('¡Mátate!')).toBe(true);
    expect(blocked("I'll kill you")).toBe(true);
  });

  it('does not block ordinary words that contain a blocked term', () => {
    expect(blocked('Una disputa sobre computadoras')).toBe(false);
    expect(blocked('Me encantan las spices y el pan negro')).toBe(false);
    expect(blocked('La vergüenza de perder')).toBe(false);
    expect(blocked('Kike y yo fuimos a ver un mono al zoo')).toBe(false);
    expect(blocked('Me mato de risa con este meme')).toBe(false);
  });

  it('reports every matched term and merges all inputs', () => {
    const result = moderateUserText(['Hola', null, 'eres una puta', undefined, 'fuck']);
    expect(result.blocked).toBe(true);
    expect(result.matchedTerms).toEqual(expect.arrayContaining(['puta', 'fuck']));
  });

  it('allows empty input', () => {
    expect(moderateUserText([null, '   ', undefined])).toEqual({
      blocked: false,
      matchedTerms: [],
      normalizedText: '',
    });
  });
});

describe('parseReportedContentTarget', () => {
  it('reads posts and comments from the report conversationId', () => {
    expect(parseReportedContentTarget('post_abc123')).toEqual({
      postId: 'abc123',
      commentId: null,
    });
    expect(parseReportedContentTarget('post_abc123_comment_c9')).toEqual({
      postId: 'abc123',
      commentId: 'c9',
    });
  });

  it('ignores groups, direct messages, paths and missing values', () => {
    expect(parseReportedContentTarget('grp_g1')).toBeNull();
    expect(parseReportedContentTarget('dm_a_b')).toBeNull();
    expect(parseReportedContentTarget('post_a/b')).toBeNull();
    expect(parseReportedContentTarget(null)).toBeNull();
    expect(parseReportedContentTarget('')).toBeNull();
  });
});
