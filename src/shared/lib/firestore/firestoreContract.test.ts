// @vitest-environment node
// firestore.rules and storage.rules can't import shared/firestore-contract.json, so this test
// checks that the collections and Storage paths the rules match and the limits they enforce are
// the ones in the contract, and that the other files a limit names contain its value.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COLLECTIONS,
  LIMITS,
  STORAGE_CONTENT_TYPES,
  STORAGE_MAX_BYTES,
  STORAGE_PATHS,
  SUBCOLLECTIONS,
} from './firestoreContract';
import { SERVER_COLLECTIONS, storagePrefix } from '../../../../functions/src/firestoreContract';

type RulesCheck = { in: string; field: string };
type FileCheck = { path: string; contains: string };
type Limit = { value: number; doc: string; rules?: RulesCheck[]; files?: FileCheck[] };
type StoragePath = { path: string; accepts: { contentTypes: string; maxBytes: string }[] };
type Contract = {
  collections: Record<string, string>;
  serverCollections: Record<string, string>;
  subcollections: Record<string, { name: string; parents: string[] }>;
  limits: Record<string, Record<string, Limit>>;
  storage: {
    maxBytes: Record<string, { megabytes: number; rules: string; firestoreRules?: RulesCheck[] }>;
    contentTypes: Record<string, { rules: string; values: string[] }>;
    paths: Record<string, StoragePath>;
  };
};

const read = (path: string) =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const contract = JSON.parse(read('shared/firestore-contract.json')) as Contract;
const rules = read('firestore.rules');
const rulesWithoutComments = rules.replace(/\/\/.*$/gm, '');
const storageRules = read('storage.rules').replace(/\/\/.*$/gm, '');

/** Collection paths of every `match` block, e.g. `users/collections/items`. */
function rulesCollectionPaths(source: string): Set<string> {
  const paths = new Set<string>();
  const stack: { path: string; depth: number }[] = [];
  let depth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const match = source.startsWith('match', i)
      ? /^match\s+(\/\S+)\s*\{/.exec(source.slice(i, i + 200))
      : null;
    if (match && /\s/.test(source[i - 1] ?? ' ')) {
      const path = (stack[stack.length - 1]?.path ?? '') + match[1];
      depth += 1;
      stack.push({ path, depth });
      const segments = path
        .replace(/^\/databases\/\{database\}\/documents/, '')
        .split('/')
        .filter((segment) => segment && !segment.startsWith('{'));
      // `/arenaUsage/{uid}/days/{dayId}` also names `arenaUsage`.
      segments.forEach((_, index) => paths.add(segments.slice(0, index + 1).join('/')));
      i += match[0].length - 1;
      continue;
    }
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      if (stack[stack.length - 1]?.depth === depth) stack.pop();
      depth -= 1;
    }
  }
  return paths;
}

/** Body of `function name(...) { ... }` or of the block that starts with `match /path`. */
function rulesBlock(source: string, start: string): string {
  const header = start.startsWith('match ') ? start : `function ${start}(`;
  const at = source.indexOf(header);
  if (at < 0) throw new Error(`The rules have no "${header}"`);
  const open = source.indexOf('{', at + header.length);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`Unclosed block after "${header}"`);
}

function sizeLimits(block: string, field: string): number[] {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![\\w.])${escaped}\\.size\\(\\) <= (\\d+)`, 'g');
  return [...block.matchAll(pattern)].map((match) => Number(match[1]));
}

describe('Firestore contract', () => {
  const rulesPaths = rulesCollectionPaths(rulesWithoutComments);
  const contractPaths = new Set([
    ...Object.values(contract.collections),
    ...Object.values(contract.subcollections).flatMap(({ name, parents }) =>
      parents.map((parent) => `${parent}/${name}`),
    ),
  ]);

  it('lists every collection that firestore.rules matches', () => {
    expect([...rulesPaths].sort()).toEqual([...contractPaths].sort());
  });

  it('keeps clients out of the server collections', () => {
    // Only the catch-all `match /{document=**}` (deny) covers them.
    for (const name of Object.values(contract.serverCollections)) {
      expect([...rulesPaths].filter((path) => path.split('/').includes(name))).toEqual([]);
    }
  });

  const checks = Object.entries(contract.limits).flatMap(([group, limits]) =>
    Object.entries(limits).flatMap(([key, limit]) =>
      (limit.rules ?? []).map((check) => ({ name: `${group}.${key}`, value: limit.value, check })),
    ),
  );

  it.each(checks)('$name matches $check.field in $check.in', ({ value, check }) => {
    const found = sizeLimits(rulesBlock(rulesWithoutComments, check.in), check.field);
    expect(found.length).toBeGreaterThan(0);
    expect(new Set(found)).toEqual(new Set([value]));
  });

  const fileChecks = Object.entries(contract.limits).flatMap(([group, limits]) =>
    Object.entries(limits).flatMap(([key, limit]) =>
      (limit.files ?? []).map((file) => ({
        name: `${group}.${key}`,
        path: file.path,
        text: file.contains.replace('{value}', String(limit.value)),
      })),
    ),
  );

  it.each(fileChecks)('$name appears in $path', ({ path, text }) => {
    expect(read(path)).toContain(text);
  });

  it('is what the generated constants hold', () => {
    expect(COLLECTIONS).toEqual(contract.collections);
    expect(SUBCOLLECTIONS).toEqual(
      Object.fromEntries(
        Object.entries(contract.subcollections).map(([key, { name }]) => [key, name]),
      ),
    );
    expect(LIMITS).toEqual(
      Object.fromEntries(
        Object.entries(contract.limits).map(([group, limits]) => [
          group,
          Object.fromEntries(Object.entries(limits).map(([key, { value }]) => [key, value])),
        ]),
      ),
    );
    expect(read('api/lib/firestoreContract.ts')).toBe(
      read('src/shared/lib/firestore/firestoreContract.ts'),
    );
    // functions/ gets the same constants plus what only the server uses.
    expect(
      read('functions/src/firestoreContract.ts').startsWith(
        read('src/shared/lib/firestore/firestoreContract.ts'),
      ),
    ).toBe(true);
    expect(SERVER_COLLECTIONS).toEqual(contract.serverCollections);
  });
});

/** `match` paths inside `match /b/{bucket}/o`, without the catch-all. */
function storageRulesPaths(source: string): string[] {
  return [...source.matchAll(/^\s*match\s+(\/\S+)\s*\{/gm)]
    .map((match) => match[1])
    .filter((path) => path !== '/b/{bucket}/o' && !path.includes('='));
}

/** `[contentTypes function, maxBytes function]` pairs of an `allow create` condition. */
function storageCreatePairs(block: string): string[][] {
  const create = /allow create:\s*if([\s\S]*?);/.exec(block)?.[1] ?? '';
  const checks = [...create.matchAll(/\b(isValid\w+Type|isUnder\w+SizeLimit)\(\)/g)].map(
    (match) => match[1],
  );
  const pairs: string[][] = [];
  checks.forEach((check, index) => {
    if (check.startsWith('isValid')) pairs.push([check, checks[index + 1] ?? '']);
  });
  return pairs;
}

describe('Storage contract', () => {
  const { maxBytes, contentTypes, paths } = contract.storage;

  it('lists every path that storage.rules matches', () => {
    expect(storageRulesPaths(storageRules).sort()).toEqual(
      Object.values(paths)
        .map(({ path }) => `/${path}`)
        .sort(),
    );
  });

  it.each(Object.entries(paths))('%s accepts what storage.rules allow it', (_, entry) => {
    const block = rulesBlock(storageRules, `match /${entry.path}`);
    const expected = entry.accepts.map((accept) => [
      contentTypes[accept.contentTypes].rules,
      maxBytes[accept.maxBytes].rules,
    ]);
    expect(storageCreatePairs(block)).toEqual(expected);
  });

  it.each(Object.entries(maxBytes))('maxBytes.%s matches its storage.rules check', (_, entry) => {
    const limit = /request\.resource\.size < ([\d\s*]+);/.exec(
      rulesBlock(storageRules, entry.rules),
    );
    expect(limit).not.toBeNull();
    const bytes = limit![1].split('*').reduce((product, factor) => product * Number(factor), 1);
    expect(bytes).toBe(entry.megabytes * 1024 * 1024);
  });

  const firestoreChecks = Object.entries(maxBytes).flatMap(([key, entry]) =>
    (entry.firestoreRules ?? []).map((check) => ({
      name: `maxBytes.${key}`,
      bytes: entry.megabytes * 1024 * 1024,
      check,
    })),
  );

  it.each(firestoreChecks)(
    '$name is the $check.field limit in firestore.rules $check.in',
    ({ bytes, check }) => {
      // Strictly smaller, like storage.rules: a stored size can't be one Storage refused.
      const escaped = check.field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(?<![\\w.])${escaped} (<=?) (\\d+)`, 'g');
      const found = [...rulesBlock(rulesWithoutComments, check.in).matchAll(pattern)].map(
        (match) => `${match[1]} ${match[2]}`,
      );
      expect(found.length).toBeGreaterThan(0);
      expect(new Set(found)).toEqual(new Set([`< ${bytes}`]));
    },
  );

  it.each(Object.entries(contentTypes))(
    'contentTypes.%s matches its storage.rules list',
    (_, entry) => {
      const list = /request\.resource\.contentType in \[([^\]]*)\]/.exec(
        rulesBlock(storageRules, entry.rules),
      );
      expect(list).not.toBeNull();
      expect([...list![1].matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual(entry.values);
    },
  );

  it('is what the generated constants hold', () => {
    expect(STORAGE_MAX_BYTES).toEqual(
      Object.fromEntries(
        Object.entries(maxBytes).map(([key, { megabytes }]) => [key, megabytes * 1024 * 1024]),
      ),
    );
    expect(STORAGE_CONTENT_TYPES).toEqual(
      Object.fromEntries(Object.entries(contentTypes).map(([key, { values }]) => [key, values])),
    );
    for (const [key, { path }] of Object.entries(paths)) {
      const params = Object.fromEntries(
        [...path.matchAll(/\{(\w+)\}/g)].map((match) => [match[1], `{${match[1]}}`]),
      );
      const build = STORAGE_PATHS[key as keyof typeof STORAGE_PATHS] as (
        params: Record<string, string>,
      ) => string;
      expect(build(params)).toBe(path);
    }
  });

  it('gives the Cloud Functions the folders to delete', () => {
    expect(storagePrefix('profileAvatar', { userId: 'u1' })).toBe('profiles/u1/');
    expect(storagePrefix('groupIcon', { userId: 'u1', groupId: 'g1' })).toBe('groups/u1/g1/');
    expect(storagePrefix('conversationThumbnail', { conversationId: 'c1', userId: 'u1' })).toBe(
      'conversations/c1/thumbnails/u1/',
    );
    expect(() => storagePrefix('postImage', {})).toThrow();
    expect(() => storagePrefix('postImage', { userId: '' })).toThrow();
    expect(() => storagePrefix('postImage', { userId: 'a/b' })).toThrow();
  });
});
