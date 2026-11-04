// @vitest-environment node
// firestore.rules (and the Cloud Functions) can't import shared/firestore-contract.json, so this
// test checks that the collections the rules match and the limits they enforce are the ones in
// the contract, and that the other files a limit names contain its value.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLLECTIONS, LIMITS, SUBCOLLECTIONS } from './firestoreContract';

type RulesCheck = { in: string; field: string };
type FileCheck = { path: string; contains: string };
type Limit = { value: number; doc: string; rules?: RulesCheck[]; files?: FileCheck[] };
type Contract = {
  collections: Record<string, string>;
  subcollections: Record<string, { name: string; parents: string[] }>;
  limits: Record<string, Record<string, Limit>>;
};

const read = (path: string) =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const contract = JSON.parse(read('shared/firestore-contract.json')) as Contract;
const rules = read('firestore.rules');
const rulesWithoutComments = rules.replace(/\/\/.*$/gm, '');

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
  if (at < 0) throw new Error(`firestore.rules has no "${header}"`);
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
  });
});
