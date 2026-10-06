export interface ContentModerationResult {
  /** A severe term matched: the content is removed and a report opened. */
  blocked: boolean;
  /** Any term matched (severe or profanity): a public text gets a report for moderators. */
  flagged: boolean;
  /** Every matched term, severe and profanity. */
  matchedTerms: string[];
  normalizedText: string;
}

// Terms are matched on normalized text (lowercase, no accents, punctuation turned into spaces),
// so write them without accents and with spaces instead of apostrophes.
// Single words also match their plural ("puta" -> "putas", "maricon" -> "maricones").
// Words with a common innocent meaning ("negro", "mono", "zorra", "perra", "coger", the
// nickname "Kike", or "spic", whose plural matches "spices") are left out on purpose to avoid
// removing legitimate posts. So are slang words used between friends in some countries
// ("marica", "verga") and "retard", which is French for "late".
//
// Two levels:
// - SEVERE terms remove the content right away and open a report.
// - PROFANITY terms never remove anything. In public texts (posts, comments, profiles, groups)
//   they open a report so a moderator decides; private messages are left alone, since the other
//   person can report or block.

const CHILD_SAFETY_TERMS = [
  'pornografia infantil',
  'child pornography',
  'child porn',
  'csam',
  'abuso sexual infantil',
  'grooming de menores',
];

const THREAT_TERMS = [
  'te voy a matar',
  'voy a matarte',
  'te mato',
  'te voy a violar',
  'voy a violarte',
  'te voy a apunalar',
  'te voy a disparar',
  'i will kill you',
  'i ll kill you',
  'ill kill you',
  'i m going to kill you',
  'im going to kill you',
  'i will shoot you',
  'rape you',
];

const SELF_HARM_TERMS = [
  'kill yourself',
  'go kill yourself',
  'kys',
  'suicidate',
  'matate',
  'ojala te mueras',
  'deberias morirte',
  'instrucciones para suicidio',
  'como suicidarse',
];

const HATE_TERMS = [
  'nigger',
  'nigga',
  'faggot',
  'retarded',
  'tranny',
  'wetback',
  'maricon',
  'sudaca',
  'travelo',
  'machorra',
  'mongolico',
  'retrasado mental',
  'negro de mierda',
  'indio de mierda',
  'judio de mierda',
  'moro de mierda',
  'gay de mierda',
];

const SEXUAL_SOLICITATION_TERMS = ['send nudes', 'dick pic'];

const SEXUAL_TERMS = ['porn', 'porno', 'pornografia', 'blowjob', 'cumshot', 'follar', 'chupame la'];

const HARASSMENT_TERMS = [
  'fuck',
  'fucking',
  'fucked',
  'fucker',
  'fuck you',
  'motherfucker',
  'bitch',
  'cunt',
  'whore',
  'slut',
  'asshole',
  'hijo de puta',
  'hija de puta',
  'hdp',
  'puta',
  'puto',
  'malparido',
  'malparida',
  'pendejo',
  'pendeja',
  'conchatumadre',
  'concha de tu madre',
  'concha tu madre',
  'ctm',
  'chinga tu madre',
  'vete a la mierda',
  'come mierda',
];

export const SEVERE_TERMS: readonly string[] = [
  ...CHILD_SAFETY_TERMS,
  ...THREAT_TERMS,
  ...SELF_HARM_TERMS,
  ...HATE_TERMS,
  ...SEXUAL_SOLICITATION_TERMS,
];

export const PROFANITY_TERMS: readonly string[] = [...SEXUAL_TERMS, ...HARASSMENT_TERMS];

interface BlockedMatcher {
  term: string;
  regex: RegExp;
}

export const normalizeModerationText = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildMatcher = (rawTerm: string): BlockedMatcher => {
  const term = normalizeModerationText(rawTerm);
  const pattern = term.includes(' ')
    ? `\\b${escapeRegex(term)}\\b`
    : `\\b${escapeRegex(term)}(?:s|es)?\\b`;
  return {
    term,
    regex: new RegExp(pattern, 'i'),
  };
};

const buildMatchers = (terms: readonly string[]): BlockedMatcher[] =>
  Array.from(new Set(terms.map((term) => normalizeModerationText(term))))
    .filter(Boolean)
    .map((term) => buildMatcher(term));

const SEVERE_MATCHERS = buildMatchers(SEVERE_TERMS);
const PROFANITY_MATCHERS = buildMatchers(PROFANITY_TERMS);

const matchTerms = (matchers: BlockedMatcher[], normalizedText: string): string[] =>
  matchers.filter((matcher) => matcher.regex.test(normalizedText)).map((matcher) => matcher.term);

export const moderateUserText = (
  inputs: Array<string | null | undefined>,
): ContentModerationResult => {
  const mergedText = inputs
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');
  const normalizedText = normalizeModerationText(mergedText);

  if (!normalizedText) {
    return {
      blocked: false,
      flagged: false,
      matchedTerms: [],
      normalizedText,
    };
  }

  const severeTerms = matchTerms(SEVERE_MATCHERS, normalizedText);
  const matchedTerms = [...severeTerms, ...matchTerms(PROFANITY_MATCHERS, normalizedText)];

  return {
    blocked: severeTerms.length > 0,
    flagged: matchedTerms.length > 0,
    matchedTerms,
    normalizedText,
  };
};

/**
 * Terms of `current` that `previous` didn't already have, so an edit only reaches moderators when
 * it adds something new (an unrelated change to a text that was already reported doesn't).
 */
export const newlyMatchedTerms = (
  current: ContentModerationResult,
  previous: ContentModerationResult | null,
): string[] => {
  if (!previous) return current.matchedTerms;
  const before = new Set(previous.matchedTerms);
  return current.matchedTerms.filter((term) => !before.has(term));
};

export interface ReportedContentTarget {
  postId: string;
  commentId: string | null;
}

/**
 * Post or comment a report points at, from the conversationId that reports carry
 * (`post_<postId>` or `post_<postId>_comment_<commentId>`, see src/shared/lib/firestore/reports.ts).
 */
export const parseReportedContentTarget = (
  conversationId: unknown,
): ReportedContentTarget | null => {
  if (typeof conversationId !== 'string') return null;

  const comment = /^post_([^/]+?)_comment_([^/]+)$/.exec(conversationId);
  if (comment) return { postId: comment[1], commentId: comment[2] };

  const post = /^post_([^/]+)$/.exec(conversationId);
  if (post) return { postId: post[1], commentId: null };

  return null;
};

export interface ReportedMessageTarget {
  conversationId: string;
  messageId: string;
}

/**
 * Chat message a report points at, from `msg|<conversationId>|<messageId>`
 * (ReportFields in ios-native/VinctusNative/Sources/ModerationRepo.swift).
 */
export const parseReportedMessageTarget = (value: unknown): ReportedMessageTarget | null => {
  if (typeof value !== 'string') return null;
  const match = /^msg\|((?:dm|grp)_[^/|]+)\|([^/|]+)$/.exec(value);
  return match ? { conversationId: match[1], messageId: match[2] } : null;
};

export const messageReportKey = (conversationId: string, messageId: string): string =>
  `msg|${conversationId}|${messageId}`;

/**
 * Story a report points at, from `story_<storyId>`
 * (ReportFields in ios-native/VinctusNative/Sources/Moderation/ModerationRepo.swift).
 */
export const parseReportedStoryTarget = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const match = /^story_([^/|]+)$/.exec(value);
  return match ? match[1] : null;
};
