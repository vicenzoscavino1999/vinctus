// Generates the TypeScript and Swift constants from shared/firestore-contract.json.
//
//   npm run contract:generate   writes the generated files
//   npm run contract:check      fails if a generated file is missing or out of date (CI)
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT_PATH = 'shared/firestore-contract.json';
// api/ gets its own copy because the Vercel functions only import files from api/.
const TS_OUTPUTS = [
  'src/shared/lib/firestore/firestoreContract.ts',
  'api/lib/firestoreContract.ts',
];
// functions/ is its own package, so it gets a copy too, with what only the server uses.
const FUNCTIONS_OUTPUT = 'functions/src/firestoreContract.ts';
const SWIFT_OUTPUT = 'ios-native/VinctusNative/Sources/Shared/FirestoreContract.swift';

const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;
const FIRESTORE_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
const STORAGE_SEGMENT = /^(?:[a-z]+|\{[a-z][A-Za-z0-9]*\})$/;

function fail(message) {
  throw new Error(`${CONTRACT_PATH}: ${message}`);
}

function validateStorage(storage) {
  const { maxBytes, contentTypes, paths } = storage ?? {};
  if (!maxBytes || !contentTypes || !paths) {
    fail('"storage" needs "maxBytes", "contentTypes" and "paths"');
  }
  for (const [key, entry] of Object.entries(maxBytes)) {
    if (!IDENTIFIER.test(key)) fail(`storage.maxBytes key "${key}" is not a camelCase identifier`);
    if (!Number.isSafeInteger(entry?.megabytes) || entry.megabytes <= 0) {
      fail(`storage.maxBytes.${key} needs a positive integer "megabytes"`);
    }
    if (typeof entry.doc !== 'string' || typeof entry.rules !== 'string') {
      fail(`storage.maxBytes.${key} needs "doc" and "rules"`);
    }
  }
  for (const [key, entry] of Object.entries(contentTypes)) {
    if (!IDENTIFIER.test(key)) {
      fail(`storage.contentTypes key "${key}" is not a camelCase identifier`);
    }
    if (typeof entry?.doc !== 'string' || typeof entry.rules !== 'string') {
      fail(`storage.contentTypes.${key} needs "doc" and "rules"`);
    }
    const values = entry.values;
    if (!Array.isArray(values) || values.length === 0 || new Set(values).size !== values.length) {
      fail(`storage.contentTypes.${key} needs "values", without repeats`);
    }
    if (values.some((value) => !/^[a-z]+\/[A-Za-z0-9.+-]+$/.test(value))) {
      fail(`storage.contentTypes.${key} has a value that is not a content type`);
    }
  }
  for (const [key, entry] of Object.entries(paths)) {
    if (!IDENTIFIER.test(key)) fail(`storage.paths key "${key}" is not a camelCase identifier`);
    const segments = typeof entry?.path === 'string' ? entry.path.split('/') : [];
    if (segments.length < 2 || segments.some((segment) => !STORAGE_SEGMENT.test(segment))) {
      fail(`storage.paths.${key} needs a "path" like "posts/{userId}/{postId}/images/{filename}"`);
    }
    if (!segments[segments.length - 1].startsWith('{')) {
      fail(`storage.paths.${key} must end in a parameter, the file name`);
    }
    if (!Array.isArray(entry.accepts) || entry.accepts.length === 0) {
      fail(`storage.paths.${key} needs "accepts"`);
    }
    for (const accept of entry.accepts) {
      if (!contentTypes[accept?.contentTypes] || !maxBytes[accept?.maxBytes]) {
        fail(`storage.paths.${key} accepts unknown contentTypes or maxBytes`);
      }
    }
  }
}

function validate(contract) {
  const { collections, serverCollections, subcollections, limits } = contract;
  if (!collections || !serverCollections || !subcollections || !limits) {
    fail('needs "collections", "serverCollections", "subcollections" and "limits"');
  }

  const names = new Set();
  for (const [key, name] of Object.entries(collections)) {
    if (!IDENTIFIER.test(key)) fail(`collection key "${key}" is not a camelCase identifier`);
    if (typeof name !== 'string' || !FIRESTORE_ID.test(name)) {
      fail(`collection "${key}" needs a name like "users_public"`);
    }
    names.add(name);
  }
  for (const [key, name] of Object.entries(serverCollections)) {
    if (!IDENTIFIER.test(key)) fail(`server collection key "${key}" is not a camelCase identifier`);
    if (typeof name !== 'string' || !FIRESTORE_ID.test(name)) {
      fail(`server collection "${key}" needs a name like "deletionJobs"`);
    }
    if (names.has(name) || key in collections) {
      fail(`server collection "${key}" is also in "collections"`);
    }
  }

  for (const [key, entry] of Object.entries(subcollections)) {
    if (!IDENTIFIER.test(key)) fail(`subcollection key "${key}" is not a camelCase identifier`);
    if (typeof entry?.name !== 'string' || !FIRESTORE_ID.test(entry.name)) {
      fail(`subcollection "${key}" needs a name`);
    }
    if (!Array.isArray(entry.parents) || entry.parents.length === 0) {
      fail(`subcollection "${key}" needs "parents"`);
    }
  }
  const subNames = new Set(Object.values(subcollections).map((entry) => entry.name));
  for (const [key, entry] of Object.entries(subcollections)) {
    for (const parent of entry.parents) {
      const [top, ...rest] = parent.split('/');
      if (!names.has(top) || rest.some((segment) => !subNames.has(segment))) {
        fail(`subcollection "${key}" has unknown parent "${parent}"`);
      }
    }
  }

  for (const [group, entries] of Object.entries(limits)) {
    if (!IDENTIFIER.test(group)) fail(`limit group "${group}" is not a camelCase identifier`);
    for (const [key, limit] of Object.entries(entries)) {
      if (!IDENTIFIER.test(key)) fail(`limit "${group}.${key}" is not a camelCase identifier`);
      if (!Number.isSafeInteger(limit?.value) || limit.value < 0) {
        fail(`limit "${group}.${key}" needs a non-negative integer "value"`);
      }
      if (typeof limit.doc !== 'string' || limit.doc.length === 0) {
        fail(`limit "${group}.${key}" needs a "doc"`);
      }
      for (const check of limit.rules ?? []) {
        if (typeof check?.in !== 'string' || typeof check?.field !== 'string') {
          fail(`limit "${group}.${key}" has a rules check without "in" and "field"`);
        }
      }
      for (const check of limit.files ?? []) {
        if (typeof check?.path !== 'string' || !check?.contains?.includes?.('{value}')) {
          fail(
            `limit "${group}.${key}" has a files check without "path" and a "contains" with {value}`,
          );
        }
      }
    }
  }

  validateStorage(contract.storage);
}

/** `users/collections` → `users/{id}/collections/{id}/items`. */
function subcollectionPaths(entry) {
  return entry.parents.map((parent) => `${parent.split('/').join('/{id}/')}/{id}/${entry.name}`);
}

const HEADER = [
  `Generated by scripts/gen-firestore-contract.mjs from ${CONTRACT_PATH}. Do not edit:`,
  'change the JSON and run `npm run contract:generate` from the repository root.',
];

/** Parameter names of a Storage path, in order: `posts/{userId}/...` → `userId`, ... */
function storageParams(template) {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
}

/** "`image` under 10 MB or `video` under 25 MB", for a path's doc comment. */
function storageAccepts(storage, entry) {
  return entry.accepts
    .map(({ contentTypes, maxBytes }) => {
      return `\`${contentTypes}\` under ${storage.maxBytes[maxBytes].megabytes} MB`;
    })
    .join(' or ');
}

const MAX_BYTES_DOC =
  'storage.rules accept files smaller than these: `request.resource.size < limit`.';

function generateTypeScriptStorage(storage, lines) {
  lines.push(`/** Upload size limits, in bytes. ${MAX_BYTES_DOC} */`);
  lines.push('export const STORAGE_MAX_BYTES = {');
  for (const [key, entry] of Object.entries(storage.maxBytes)) {
    lines.push(`  /** ${entry.doc} */`, `  ${key}: ${entry.megabytes} * 1024 * 1024,`);
  }
  lines.push('} as const;', '');

  lines.push('/** Content types that storage.rules accept, by kind of file. */');
  lines.push('export const STORAGE_CONTENT_TYPES = {');
  for (const [key, entry] of Object.entries(storage.contentTypes)) {
    const values = entry.values.map((value) => `'${value}'`).join(', ');
    lines.push(`  /** ${entry.doc} */`, `  ${key}: [${values}] as readonly string[],`);
  }
  lines.push('} as const;', '');

  lines.push('/** Where uploaded files go, as storage.rules match them. */');
  lines.push('export const STORAGE_PATHS = {');
  for (const [key, entry] of Object.entries(storage.paths)) {
    const params = storageParams(entry.path);
    const type = params.map((param) => `${param}: string`).join('; ');
    const body = entry.path.replace(/\{(\w+)\}/g, (_, param) => `\${${param}}`);
    lines.push(
      `  /** \`${entry.path}\`: ${storageAccepts(storage, entry)}. */`,
      `  ${key}: ({ ${params.join(', ')} }: { ${type} }) => \`${body}\`,`,
    );
  }
  lines.push('} as const;', '');
}

/** What only the Cloud Functions use: server-only collections and Storage prefixes. */
function generateTypeScriptServer(contract, lines) {
  lines.push('/** Collections only the Cloud Functions use. firestore.rules deny clients. */');
  lines.push('export const SERVER_COLLECTIONS = {');
  for (const [key, name] of Object.entries(contract.serverCollections)) {
    lines.push(`  ${key}: '${name}',`);
  }
  lines.push('} as const;', '');

  lines.push('const STORAGE_PATH_TEMPLATES = {');
  for (const [key, entry] of Object.entries(contract.storage.paths)) {
    lines.push(`  ${key}: '${entry.path}',`);
  }
  lines.push('} as const;', '');
  lines.push(
    'type StorageTemplate = (typeof STORAGE_PATH_TEMPLATES)[keyof typeof STORAGE_PATH_TEMPLATES];',
    'type StorageParams<T extends string> = T extends `${string}{${infer Name}}${infer Rest}`',
    '  ? Name | StorageParams<Rest>',
    '  : never;',
    '',
    '/**',
    ' * The folder of a STORAGE_PATHS path up to the last parameter given, ending in `/`, to delete',
    " * everything under it: `storagePrefix('profileAvatar', { userId })` is `profiles/${userId}/`.",
    ' * The parameters given must be the first ones of the path.',
    ' */',
    'export function storagePrefix<K extends keyof typeof STORAGE_PATH_TEMPLATES>(',
    '  path: K,',
    '  params: Partial<Record<StorageParams<(typeof STORAGE_PATH_TEMPLATES)[K]>, string>>,',
    '): string {',
    '  const values: Partial<Record<StorageParams<StorageTemplate>, string>> = params;',
    "  let prefix = '';",
    "  let literals = '';",
    "  for (const segment of STORAGE_PATH_TEMPLATES[path].split('/')) {",
    '    const name = /^\\{(\\w+)\\}$/.exec(segment)?.[1] as StorageParams<StorageTemplate> | undefined;',
    '    if (name === undefined) {',
    '      literals += `${segment}/`;',
    '      continue;',
    '    }',
    '    const value = values[name];',
    '    if (value === undefined) break;',
    "    if (value === '' || value.includes('/')) {",
    '      throw new Error(`storagePrefix: "${name}" must be one path segment`);',
    '    }',
    '    prefix += `${literals}${value}/`;',
    "    literals = '';",
    '  }',
    '  if (!prefix) throw new Error(`storagePrefix: ${path} needs its first parameter`);',
    '  return prefix;',
    '}',
    '',
  );
}

function generateTypeScript(contract, { server = false } = {}) {
  const lines = HEADER.map((line) => `// ${line}`);
  lines.push('', '/** Top-level Firestore collections. */', 'export const COLLECTIONS = {');
  for (const [key, name] of Object.entries(contract.collections)) {
    lines.push(`  ${key}: '${name}',`);
  }
  lines.push('} as const;', '');

  lines.push('/** Firestore subcollections, with the documents they live under. */');
  lines.push('export const SUBCOLLECTIONS = {');
  for (const [key, entry] of Object.entries(contract.subcollections)) {
    lines.push(`  /** ${subcollectionPaths(entry).join(', ')} */`, `  ${key}: '${entry.name}',`);
  }
  lines.push('} as const;', '');

  lines.push('/** Limits shared by the web, the native app and firestore.rules. */');
  lines.push('export const LIMITS = {');
  for (const [group, entries] of Object.entries(contract.limits)) {
    lines.push(`  ${group}: {`);
    for (const [key, limit] of Object.entries(entries)) {
      lines.push(`    /** ${limit.doc} */`, `    ${key}: ${limit.value},`);
    }
    lines.push('  },');
  }
  lines.push('} as const;', '');

  generateTypeScriptStorage(contract.storage, lines);
  if (server) generateTypeScriptServer(contract, lines);
  return lines.join('\n');
}

/** `aiChat` → `AIChat`, `groupRequests` → `GroupRequests`. */
function swiftTypeName(key) {
  const name = key.charAt(0).toUpperCase() + key.slice(1);
  return name.replace(/^Ai(?=[A-Z])/, 'AI');
}

function generateSwift(contract) {
  const lines = HEADER.map((line) => `// ${line}`);
  lines.push('', '/// Top-level Firestore collections.', 'enum FirestoreCollections {');
  for (const [key, name] of Object.entries(contract.collections)) {
    lines.push(`  static let ${key} = "${name}"`);
  }
  lines.push('}', '');

  lines.push('/// Firestore subcollections, with the documents they live under.');
  lines.push('enum FirestoreSubcollections {');
  for (const [key, entry] of Object.entries(contract.subcollections)) {
    const paths = subcollectionPaths(entry).map((p) => `\`${p}\``);
    lines.push(`  /// ${paths.join(', ')}`, `  static let ${key} = "${entry.name}"`);
  }
  lines.push('}', '');

  lines.push('/// Limits shared by the web, the native app and firestore.rules.');
  lines.push('enum Limits {');
  const groups = Object.entries(contract.limits);
  groups.forEach(([group, entries], index) => {
    lines.push(`  enum ${swiftTypeName(group)} {`);
    for (const [key, limit] of Object.entries(entries)) {
      lines.push(`    /// ${limit.doc}`, `    static let ${key} = ${limit.value}`);
    }
    lines.push('  }');
    if (index < groups.length - 1) lines.push('');
  });
  lines.push('}', '');

  generateSwiftStorage(contract.storage, lines);
  return lines.join('\n');
}

/** `userId` → `userID`, as Swift names it. */
function swiftParamName(param) {
  return param.replace(/Id$/, 'ID');
}

function generateSwiftStorage(storage, lines) {
  lines.push(`/// Upload size limits, in bytes. ${MAX_BYTES_DOC}`);
  lines.push('enum StorageMaxBytes {');
  for (const [key, entry] of Object.entries(storage.maxBytes)) {
    lines.push(`  /// ${entry.doc}`, `  static let ${key} = ${entry.megabytes} * 1024 * 1024`);
  }
  lines.push('}', '');

  lines.push('/// Content types that storage.rules accept, by kind of file.');
  lines.push('enum StorageContentTypes {');
  for (const [key, entry] of Object.entries(storage.contentTypes)) {
    lines.push(`  /// ${entry.doc}`);
    const values = entry.values.map((value) => `"${value}"`);
    const oneLine = `  static let ${key} = [${values.join(', ')}]`;
    if (oneLine.length <= 100) {
      lines.push(oneLine);
    } else {
      lines.push(`  static let ${key} = [`, ...values.map((value) => `    ${value},`), '  ]');
    }
  }
  lines.push('}', '');

  lines.push('/// Where uploaded files go, as storage.rules match them.');
  lines.push('enum StoragePaths {');
  const entries = Object.entries(storage.paths);
  entries.forEach(([key, entry], index) => {
    const params = storageParams(entry.path).map((param) => `${swiftParamName(param)}: String`);
    const body = entry.path.replace(/\{(\w+)\}/g, (_, param) => `\\(${swiftParamName(param)})`);
    const accepts = storageAccepts(storage, entry);
    lines.push(`  /// \`${entry.path}\`: ${accepts}.`);
    const oneLine = `  static func ${key}(${params.join(', ')}) -> String {`;
    if (oneLine.length <= 100) {
      lines.push(oneLine);
    } else {
      lines.push(
        `  static func ${key}(`,
        ...params.map((param, i) => {
          return `    ${param}${i < params.length - 1 ? ',' : ''}`;
        }),
        '  ) -> String {',
      );
    }
    lines.push(`    "${body}"`, '  }');
    if (index < entries.length - 1) lines.push('');
  });
  lines.push('}', '');
}

async function formatTypeScript(source, file) {
  const config = (await prettier.resolveConfig(path.join(ROOT, file))) ?? {};
  return prettier.format(source, { ...config, filepath: path.join(ROOT, file) });
}

async function readIfExists(file) {
  try {
    return (await readFile(path.join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function main() {
  const check = process.argv.includes('--check');
  const contract = JSON.parse(await readFile(path.join(ROOT, CONTRACT_PATH), 'utf8'));
  validate(contract);

  const typescript = generateTypeScript(contract);
  const outputs = [
    ...(await Promise.all(
      TS_OUTPUTS.map(async (file) => [file, await formatTypeScript(typescript, file)]),
    )),
    [
      FUNCTIONS_OUTPUT,
      await formatTypeScript(generateTypeScript(contract, { server: true }), FUNCTIONS_OUTPUT),
    ],
    [SWIFT_OUTPUT, generateSwift(contract)],
  ];

  const stale = [];
  for (const [file, content] of outputs) {
    if ((await readIfExists(file)) === content) continue;
    stale.push(file);
    if (!check) await writeFile(path.join(ROOT, file), content);
  }

  if (check && stale.length > 0) {
    console.error(
      `Out of date with ${CONTRACT_PATH}:\n${stale.map((file) => `  ${file}`).join('\n')}\n` +
        'Run `npm run contract:generate` and commit the result.',
    );
    process.exit(1);
  }
  console.log(
    check
      ? 'Firestore contract: generated files are up to date.'
      : stale.length > 0
        ? `Firestore contract: wrote ${stale.join(', ')}`
        : 'Firestore contract: nothing to change.',
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
