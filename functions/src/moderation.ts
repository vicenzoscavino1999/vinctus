export interface ContentModerationResult {
  blocked: boolean;
  matchedTerms: string[];
  normalizedText: string;
}

// Terms are matched on normalized text (lowercase, no accents, punctuation turned into spaces),
// so write them without accents and with spaces instead of apostrophes.
// Single words also match their plural ("puta" -> "putas", "maricon" -> "maricones").
// Words with a common innocent meaning ("negro", "mono", "zorra", "perra", "coger", the
// nickname "Kike", or "spic", whose plural matches "spices") are left out on purpose to avoid
// removing legitimate posts.

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
  'retard',
  'retarded',
  'tranny',
  'wetback',
  'maricon',
  'marica',
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

const SEXUAL_TERMS = [
  'porn',
  'porno',
  'pornografia',
  'blowjob',
  'cumshot',
  'send nudes',
  'dick pic',
  'follar',
  'verga',
  'chupame la',
];

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

export const BLOCKED_TERMS: readonly string[] = [
  ...CHILD_SAFETY_TERMS,
  ...THREAT_TERMS,
  ...SELF_HARM_TERMS,
  ...HATE_TERMS,
  ...SEXUAL_TERMS,
  ...HARASSMENT_TERMS,
];

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
