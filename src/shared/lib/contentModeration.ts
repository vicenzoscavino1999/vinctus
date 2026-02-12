export interface ContentModerationResult {
  blocked: boolean;
  matchedTerms: string[];
  normalizedText: string;
}

const BLOCKED_TERMS = [
  'pornografia infantil',
  'child pornography',
  'child porn',
  'csam',
  'abuso sexual infantil',
  'grooming de menores',
  'te voy a matar',
  'voy a matarte',
  'i will kill you',
  'kill yourself',
  'suicidate',
  'instrucciones para suicidio',
  'como suicidarse',
  'te voy a violar',
  'voy a violarte',
  'rape you',
] as const;

interface BlockedMatcher {
  term: string;
  regex: RegExp;
}

const normalizeModerationText = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildMatcher = (rawTerm: string): BlockedMatcher => {
  const term = normalizeModerationText(rawTerm);
  const pattern = term.includes(' ') ? escapeRegex(term) : `\\b${escapeRegex(term)}\\b`;
  return {
    term,
    regex: new RegExp(pattern, 'i'),
  };
};

const BLOCKED_MATCHERS = Array.from(
  new Set(BLOCKED_TERMS.map((term) => normalizeModerationText(term))),
)
  .filter(Boolean)
  .map((term) => buildMatcher(term));

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
      matchedTerms: [],
      normalizedText,
    };
  }

  const matchedTerms = BLOCKED_MATCHERS.filter((matcher) => matcher.regex.test(normalizedText)).map(
    (matcher) => matcher.term,
  );

  return {
    blocked: matchedTerms.length > 0,
    matchedTerms,
    normalizedText,
  };
};
