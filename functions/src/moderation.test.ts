import { describe, expect, it } from 'vitest';
import {
  messageReportKey,
  moderateUserText,
  newlyMatchedTerms,
  parseReportedContentTarget,
  parseReportedMessageTarget,
  parseReportedStoryTarget,
} from './moderation';

const blocked = (text: string) => moderateUserText([text]).blocked;
const flagged = (text: string) => moderateUserText([text]).flagged;

describe('moderateUserText', () => {
  it('removes threats, hate speech, self-harm and sexual solicitation', () => {
    expect(blocked('Te voy a matar mañana')).toBe(true);
    expect(blocked('eres un maricón')).toBe(true);
    expect(blocked('send nudes')).toBe(true);
    expect(blocked('kys')).toBe(true);
  });

  it('only flags profanity for review, without removing it', () => {
    for (const text of [
      'F*ck... no: fuck you',
      'Hijo de PUTA',
      'jaja qué pendejo',
      'mira este porno',
    ]) {
      expect(blocked(text)).toBe(false);
      expect(flagged(text)).toBe(true);
    }
  });

  it('matches plurals and ignores accents and punctuation', () => {
    expect(flagged('putas')).toBe(true);
    expect(blocked('maricones')).toBe(true);
    expect(blocked('¡Mátate!')).toBe(true);
    expect(blocked("I'll kill you")).toBe(true);
  });

  it('does not flag ordinary words that contain a blocked term', () => {
    expect(flagged('Una disputa sobre computadoras')).toBe(false);
    expect(flagged('Me encantan las spices y el pan negro')).toBe(false);
    expect(flagged('La vergüenza de perder')).toBe(false);
    expect(flagged('Kike y yo fuimos a ver un mono al zoo')).toBe(false);
    expect(flagged('Me mato de risa con este meme')).toBe(false);
  });

  it('leaves out slang used between friends and words with another meaning', () => {
    expect(flagged('qué más marica, todo bien?')).toBe(false);
    expect(flagged('a la verga, qué golazo')).toBe(false);
    expect(flagged('je suis en retard')).toBe(false);
  });

  it('reports every matched term and merges all inputs', () => {
    const result = moderateUserText(['Hola', null, 'eres una puta', undefined, 'te voy a matar']);
    expect(result.blocked).toBe(true);
    expect(result.flagged).toBe(true);
    expect(result.matchedTerms).toEqual(expect.arrayContaining(['puta', 'te voy a matar']));
  });

  it('allows empty input', () => {
    expect(moderateUserText([null, '   ', undefined])).toEqual({
      blocked: false,
      flagged: false,
      matchedTerms: [],
      normalizedText: '',
    });
  });
});

describe('newlyMatchedTerms', () => {
  it('returns every term for a new text', () => {
    expect(newlyMatchedTerms(moderateUserText(['puta']), null)).toEqual(['puta']);
  });

  it('ignores an edit that keeps the same terms', () => {
    const before = moderateUserText(['Ana', 'bio con puta']);
    const after = moderateUserText(['Ana María', 'bio con puta']);
    expect(newlyMatchedTerms(after, before)).toEqual([]);
  });

  it('returns only the terms the edit added', () => {
    const before = moderateUserText(['bio con puta']);
    const after = moderateUserText(['bio con puta y pendejo']);
    expect(newlyMatchedTerms(after, before)).toEqual(['pendejo']);
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

describe('parseReportedMessageTarget', () => {
  it('reads direct and group message reports', () => {
    expect(parseReportedMessageTarget('msg|dm_a_b|a_1700_x1')).toEqual({
      conversationId: 'dm_a_b',
      messageId: 'a_1700_x1',
    });
    expect(parseReportedMessageTarget(messageReportKey('grp_g1', 'm9'))).toEqual({
      conversationId: 'grp_g1',
      messageId: 'm9',
    });
  });

  it('rejects anything else', () => {
    expect(parseReportedMessageTarget('post_abc')).toBeNull();
    expect(parseReportedMessageTarget('msg|other_x|m1')).toBeNull();
    expect(parseReportedMessageTarget('msg|dm_a/b|m1')).toBeNull();
    expect(parseReportedMessageTarget('msg|dm_a_b|')).toBeNull();
    expect(parseReportedMessageTarget(null)).toBeNull();
  });
});

describe('parseReportedStoryTarget', () => {
  it('reads story reports', () => {
    expect(parseReportedStoryTarget('story_abc123')).toBe('abc123');
  });

  it('rejects anything else', () => {
    expect(parseReportedStoryTarget('post_abc')).toBeNull();
    expect(parseReportedStoryTarget('story_a/b')).toBeNull();
    expect(parseReportedStoryTarget('story_')).toBeNull();
    expect(parseReportedStoryTarget(undefined)).toBeNull();
  });
});
