import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const args = new Set(process.argv.slice(2));
const submitMode = args.has('--submit');

const LEVEL = {
  pass: 'PASS',
  warn: 'WARN',
  fail: 'FAIL',
};

const results = [];
const defaults = {
  privacyUrl: 'https://vinctus.app/privacy',
  termsUrl: 'https://vinctus.app/terms',
  communityUrl: 'https://vinctus.app/community-guidelines',
  supportUrl: 'https://vinctus.app/support',
  supportEmail: 'support@vinctus.app',
  securityEmail: 'security@vinctus.app',
};

const pushResult = (level, message, detail = '') => {
  results.push({ level, message, detail });
};

const pass = (message, detail = '') => pushResult(LEVEL.pass, message, detail);
const warn = (message, detail = '') => pushResult(LEVEL.warn, message, detail);
const fail = (message, detail = '') => pushResult(LEVEL.fail, message, detail);

const runCommand = (command, commandArgs) => {
  const child = spawnSync(command, commandArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return child.status === null ? 1 : child.status;
};

const parseDotEnv = (raw) => {
  const map = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
};

const readEnv = async () => {
  const envLocalPath = path.resolve(rootDir, '.env.local');
  const envExamplePath = path.resolve(rootDir, '.env.example');
  const values = new Map();
  let source = 'none';

  if (existsSync(envExamplePath)) {
    const raw = await fs.readFile(envExamplePath, 'utf8');
    for (const [key, value] of parseDotEnv(raw).entries()) {
      values.set(key, value);
    }
    source = '.env.example';
  }

  if (existsSync(envLocalPath)) {
    const raw = await fs.readFile(envLocalPath, 'utf8');
    for (const [key, value] of parseDotEnv(raw).entries()) {
      values.set(key, value);
    }
    return {
      source: source === '.env.example' ? '.env.local + .env.example' : '.env.local',
      values,
    };
  }

  return {
    source,
    values,
  };
};

const getEnvValue = (map, key) => (map.get(key) ?? '').trim();
const getEnvOrDefault = (map, key, fallback) => {
  const value = getEnvValue(map, key);
  return value || fallback;
};

const isHttpsUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const isValidEmail = (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

const checkFilePresent = async (relativePath, label) => {
  const absolutePath = path.resolve(rootDir, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`${label} missing`, relativePath);
    return null;
  }
  const content = await fs.readFile(absolutePath, 'utf8');
  if (!content.trim()) {
    fail(`${label} empty`, relativePath);
    return null;
  }
  pass(`${label} found`, relativePath);
  return content;
};

const main = async () => {
  console.log(`[gate:appstore] mode=${submitMode ? 'submit' : 'baseline'}`);

  const reviewPackageExitCode = runCommand(npmCmd, ['run', 'review:package']);
  if (reviewPackageExitCode !== 0) {
    fail('Review package generation failed', 'npm run review:package');
  } else {
    pass('Review package generation passed', 'npm run review:package');
  }

  const preflightExitCode = runCommand(npmCmd, [
    'run',
    'preflight:appstore',
    '--',
    '--skip-url-checks',
  ]);
  if (preflightExitCode !== 0) {
    fail('Preflight command failed', 'npm run preflight:appstore -- --skip-url-checks');
  } else {
    pass('Preflight command passed', 'npm run preflight:appstore -- --skip-url-checks');
  }

  const reviewPackageContent = await checkFilePresent(
    'docs/app-review-package.generated.md',
    'Generated review package',
  );
  const reviewNotesContent = await checkFilePresent(
    'docs/app-review-notes-draft.md',
    'Review notes draft',
  );
  const generatedReviewNotesContent = await checkFilePresent(
    'docs/app-review-notes.generated.md',
    'Generated review notes',
  );

  const envInfo = await readEnv();
  if (envInfo.source === '.env.local') {
    pass('Environment source is .env.local');
  } else if (envInfo.source === '.env.local + .env.example') {
    pass('Environment source is .env.local + .env.example');
  } else if (envInfo.source === '.env.example') {
    warn('Environment source fallback (.env.example)', 'Create .env.local for release checks.');
  } else {
    fail('Environment file missing', 'Expected .env.local or .env.example');
  }

  const env = envInfo.values;
  const appleFlag = getEnvValue(env, 'VITE_ENABLE_APPLE_SIGN_IN');
  if (appleFlag === 'true' || appleFlag === 'false') {
    pass('Apple Sign-In flag is explicit', `VITE_ENABLE_APPLE_SIGN_IN=${appleFlag}`);
  } else {
    if (submitMode) {
      fail(
        'Apple Sign-In flag missing/invalid',
        `VITE_ENABLE_APPLE_SIGN_IN=${appleFlag || '<empty>'}`,
      );
    } else {
      warn(
        'Apple Sign-In flag missing/invalid',
        `VITE_ENABLE_APPLE_SIGN_IN=${appleFlag || '<empty>'} (set true/false before submit)`,
      );
    }
  }

  if (submitMode) {
    if (appleFlag !== 'true') {
      fail(
        'Submit mode requires Apple Sign-In enabled',
        'Set VITE_ENABLE_APPLE_SIGN_IN=true for iOS review parity with Google login.',
      );
    } else {
      pass('Submit mode Apple Sign-In requirement satisfied');
    }
  }

  const legalValues = [
    {
      key: 'VITE_PRIVACY_POLICY_URL',
      fallback: defaults.privacyUrl,
    },
    {
      key: 'VITE_TERMS_OF_SERVICE_URL',
      fallback: defaults.termsUrl,
    },
    {
      key: 'VITE_COMMUNITY_GUIDELINES_URL',
      fallback: defaults.communityUrl,
    },
    {
      key: 'VITE_SUPPORT_URL',
      fallback: defaults.supportUrl,
    },
  ];

  for (const item of legalValues) {
    const configured = getEnvValue(env, item.key);
    const value = getEnvOrDefault(env, item.key, item.fallback);
    if (!configured) {
      if (submitMode) {
        fail(`Missing legal URL env`, item.key);
      } else {
        warn(`Legal URL env not set, using default`, `${item.key}=${value}`);
      }
    }
    if (!isHttpsUrl(value)) {
      fail(`Legal URL must be https`, `${item.key}=${value}`);
      continue;
    }
    pass(`Legal URL format ok`, `${item.key}=${value}`);
  }

  const supportEmailConfigured = getEnvValue(env, 'VITE_SUPPORT_EMAIL');
  const securityEmailConfigured = getEnvValue(env, 'VITE_SECURITY_EMAIL');
  const supportEmail = getEnvOrDefault(env, 'VITE_SUPPORT_EMAIL', defaults.supportEmail);
  const securityEmail = getEnvOrDefault(env, 'VITE_SECURITY_EMAIL', defaults.securityEmail);

  if (!supportEmailConfigured) {
    if (submitMode) {
      fail('Missing support email env', 'VITE_SUPPORT_EMAIL');
    } else {
      warn('Support email env not set, using default', supportEmail);
    }
  }

  if (isValidEmail(supportEmail)) {
    pass('Support email format ok', supportEmail);
  } else {
    fail('Support email invalid', supportEmail || '<empty>');
  }

  if (!securityEmailConfigured) {
    if (submitMode) {
      fail('Missing security email env', 'VITE_SECURITY_EMAIL');
    } else {
      warn('Security email env not set, using default', securityEmail);
    }
  }

  if (isValidEmail(securityEmail)) {
    pass('Security email format ok', securityEmail);
  } else {
    fail('Security email invalid', securityEmail || '<empty>');
  }

  const placeholderRegex =
    /\[REPLACE_(?:REVIEW_EMAIL|REVIEW_PASSWORD)_BEFORE_SUBMIT\]|\[REPLACE_BEFORE_SUBMIT\]|<to be provided before submission>/i;
  const draftReviewNotesHasPlaceholders = Boolean(reviewNotesContent?.match(placeholderRegex));
  const generatedReviewNotesHasPlaceholders = Boolean(
    generatedReviewNotesContent?.match(placeholderRegex),
  );
  const reviewPackageHasPlaceholders = Boolean(reviewPackageContent?.match(placeholderRegex));

  if (draftReviewNotesHasPlaceholders) {
    pass('Draft review notes template placeholders detected (expected)');
  } else {
    pass('Draft review notes are placeholder-free');
  }

  const generatedReviewArtifactsHavePlaceholders =
    generatedReviewNotesHasPlaceholders || reviewPackageHasPlaceholders;

  if (generatedReviewArtifactsHavePlaceholders) {
    if (submitMode) {
      fail(
        'Generated review artifacts contain placeholders',
        'Set REVIEW_PROD_EMAIL and REVIEW_PROD_PASSWORD, then run npm run review:package.',
      );
    } else {
      warn(
        'Generated review artifacts contain placeholders',
        'Set REVIEW_PROD_EMAIL and REVIEW_PROD_PASSWORD before submit, then run npm run review:package.',
      );
    }
  } else {
    pass('Generated review artifacts are placeholder-free');
  }

  const reviewPackageHasEvidence =
    reviewPackageContent?.includes('## Compliance Evidence Map') &&
    reviewPackageContent?.includes('## Manual Blockers Before Submit');
  if (reviewPackageHasEvidence) {
    pass('Generated review package has mandatory sections');
  } else {
    fail('Generated review package missing mandatory sections');
  }

  const summary = results.reduce(
    (acc, item) => {
      if (item.level === LEVEL.pass) acc.pass += 1;
      if (item.level === LEVEL.warn) acc.warn += 1;
      if (item.level === LEVEL.fail) acc.fail += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 },
  );

  console.log('\nGate results:');
  for (const item of results) {
    const detail = item.detail ? ` (${item.detail})` : '';
    console.log(`- [${item.level}] ${item.message}${detail}`);
  }

  console.log(
    `\nSummary -> PASS: ${summary.pass} | WARN: ${summary.warn} | FAIL: ${summary.fail} | mode=${
      submitMode ? 'submit' : 'baseline'
    }`,
  );

  const shouldFail = summary.fail > 0 || (submitMode && summary.warn > 0);
  if (shouldFail) {
    console.error('App Store gate failed.');
    process.exit(1);
  }

  console.log('App Store gate passed.');
};

main().catch((error) => {
  console.error('App Store gate crashed:', error);
  process.exit(1);
});
