import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const strictMode = args.has('--strict');
const skipUrlChecks = args.has('--skip-url-checks');
const rootDir = process.cwd();

const results = [];

const STATUS = {
  pass: 'PASS',
  warn: 'WARN',
  fail: 'FAIL',
};

const toRelative = (targetPath) => path.relative(rootDir, path.resolve(rootDir, targetPath));

const pushResult = (status, message, detail = '') => {
  results.push({ status, message, detail });
};

const pass = (message, detail = '') => pushResult(STATUS.pass, message, detail);
const warn = (message, detail = '') => pushResult(STATUS.warn, message, detail);
const fail = (message, detail = '') => pushResult(STATUS.fail, message, detail);

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

const readFileIfExists = async (relativePath) => {
  const absolutePath = path.resolve(rootDir, relativePath);
  if (!existsSync(absolutePath)) return null;
  return fs.readFile(absolutePath, 'utf8');
};

const checkFileExists = async (relativePath, label) => {
  const absolutePath = path.resolve(rootDir, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`${label} missing`, toRelative(relativePath));
    return null;
  }

  const stat = await fs.stat(absolutePath);
  if (stat.size === 0) {
    fail(`${label} is empty`, toRelative(relativePath));
    return null;
  }

  pass(`${label} found`, toRelative(relativePath));
  return absolutePath;
};

const checkContains = async (relativePath, pattern, label) => {
  const raw = await readFileIfExists(relativePath);
  if (raw == null) {
    fail(`${label} file not found`, toRelative(relativePath));
    return;
  }
  if (pattern.test(raw)) {
    pass(`${label} detected`, toRelative(relativePath));
  } else {
    fail(`${label} missing evidence`, toRelative(relativePath));
  }
};

const checkUrlReachable = async (label, rawUrl) => {
  const url = (rawUrl ?? '').trim();
  if (!url) {
    fail(`${label} URL is empty`);
    return;
  }

  try {
    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol)) {
      fail(`${label} URL must use http/https`, url);
      return;
    }
  } catch {
    fail(`${label} URL is invalid`, url);
    return;
  }

  if (skipUrlChecks) {
    pass(`${label} URL check skipped by flag`, url);
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (response.ok) {
      pass(`${label} URL reachable`, `${url} -> ${response.status}`);
    } else {
      warn(`${label} URL returned non-OK`, `${url} -> ${response.status}`);
    }
  } catch (error) {
    warn(
      `${label} URL could not be verified`,
      `${url} -> ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
};

const getEnvValue = (envMap, key, fallback = '') => {
  const value = (envMap.get(key) ?? '').trim();
  return value.length > 0 ? value : fallback;
};

const run = async () => {
  console.log('App Store preflight started.');

  const requiredDocs = [
    'docs/app-store-readiness.md',
    'docs/app-store-sprint-1-operativo.md',
    'docs/app-store-metadata-draft.md',
    'docs/app-store-privacy-age-rating-draft.md',
    'docs/app-review-notes-draft.md',
    'docs/app-review-demo-account.md',
    'docs/apple-sign-in-setup.md',
    'docs/capacitor-ios-setup.md',
    'docs/trust-safety-sla.md',
  ];

  const requiredPublicPages = [
    'public/privacy.html',
    'public/terms.html',
    'public/community-guidelines.html',
    'public/support.html',
  ];

  await Promise.all([
    ...requiredDocs.map((file) => checkFileExists(file, 'Required doc')),
    ...requiredPublicPages.map((file) => checkFileExists(file, 'Required public page')),
  ]);

  await checkContains(
    'src/app/providers/AuthContext.tsx',
    /VITE_ENABLE_APPLE_SIGN_IN/,
    'Apple Sign-In feature flag',
  );
  await checkContains(
    'src/features/auth/components/LoginScreen.tsx',
    /Continuar con Apple/,
    'Apple Sign-In button copy',
  );
  await checkContains(
    'src/features/auth/components/LoginScreen.tsx',
    /LEGAL_LINKS\.communityGuidelinesPublicUrl/,
    'Community Guidelines link in login',
  );
  await checkContains(
    'src/features/help/pages/HelpPage.tsx',
    /\/legal\/community-guidelines/,
    'Community Guidelines link in help',
  );
  await checkContains(
    'functions/src/deleteAccount.ts',
    /requestAccountDeletion/,
    'Delete account callable',
  );
  await checkContains(
    'functions/src/deleteAccount.ts',
    /getAccountDeletionStatus/,
    'Delete account status callable',
  );
  await checkContains(
    'functions/src/index.ts',
    /onReportCreatedQueue/,
    'Moderation queue trigger',
  );
  await checkContains('api/chat.ts', /hasServerAIConsent/, 'AI consent enforcement in chat API');
  await checkContains(
    'functions/src/arena/createDebate.ts',
    /hasServerAIConsent/,
    'AI consent enforcement in Arena',
  );
  await checkContains(
    'src/app/routes/AppLayout.tsx',
    /Sin conexion/,
    'Offline UX banner in app shell',
  );
  await checkContains('src/index.css', /\.safe-area-inset/, 'Safe-area utility class');
  await checkContains(
    'src/app/routes/AppLayout.tsx',
    /\/legal\/community-guidelines/,
    'In-app Community Guidelines route',
  );
  await checkContains(
    'src/features/settings/pages/SettingsPage.tsx',
    /\/legal\/community-guidelines/,
    'Community Guidelines link in settings',
  );
  await checkContains(
    'src/features/settings/pages/SettingsPage.tsx',
    /Probar haptics/,
    'Native haptics test action',
  );
  await checkContains(
    'ios/App/App/Info.plist',
    /NSCameraUsageDescription/,
    'iOS camera usage description',
  );
  await checkContains(
    'ios/App/App/Info.plist',
    /NSPhotoLibraryUsageDescription/,
    'iOS photo library usage description',
  );
  await checkContains(
    'ios/App/App/Info.plist',
    /NSPhotoLibraryAddUsageDescription/,
    'iOS photo save usage description',
  );
  await checkContains(
    'ios/App/App/Info.plist',
    /NSMicrophoneUsageDescription/,
    'iOS microphone usage description',
  );

  await checkFileExists(
    'src/features/legal/pages/CommunityGuidelinesPage.tsx',
    'Community Guidelines page',
  );
  await checkFileExists('src/shared/lib/native/pushNotifications.ts', 'Native push wrapper');
  await checkFileExists('src/shared/lib/native/camera.ts', 'Native camera wrapper');
  await checkFileExists('src/shared/lib/native/haptics.ts', 'Native haptics wrapper');

  const envLocalRaw = await readFileIfExists('.env.local');
  const envExampleRaw = await readFileIfExists('.env.example');

  let envMap = new Map();
  if (envExampleRaw != null) {
    for (const [key, value] of parseDotEnv(envExampleRaw).entries()) {
      envMap.set(key, value);
    }
  }

  if (envLocalRaw != null) {
    for (const [key, value] of parseDotEnv(envLocalRaw).entries()) {
      envMap.set(key, value);
    }
    pass(
      'Environment source selected',
      envExampleRaw != null ? '.env.local + .env.example' : '.env.local',
    );
  } else if (envExampleRaw != null) {
    warn(
      'Environment source selected fallback',
      '.env.example (create .env.local for local overrides)',
    );
  } else {
    fail('Environment file missing', '.env.local and .env.example not found');
  }

  const legalUrls = {
    privacy: getEnvValue(envMap, 'VITE_PRIVACY_POLICY_URL', 'https://vinctus.app/privacy'),
    terms: getEnvValue(envMap, 'VITE_TERMS_OF_SERVICE_URL', 'https://vinctus.app/terms'),
    community: getEnvValue(
      envMap,
      'VITE_COMMUNITY_GUIDELINES_URL',
      'https://vinctus.app/community-guidelines',
    ),
    support: getEnvValue(envMap, 'VITE_SUPPORT_URL', 'https://vinctus.app/support'),
  };

  const supportEmail = getEnvValue(envMap, 'VITE_SUPPORT_EMAIL', 'support@vinctus.app');
  const securityEmail = getEnvValue(envMap, 'VITE_SECURITY_EMAIL', 'security@vinctus.app');
  const appleFlag = getEnvValue(envMap, 'VITE_ENABLE_APPLE_SIGN_IN', '');

  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(supportEmail)) {
    pass('Support email format looks valid', supportEmail);
  } else {
    fail('Support email format invalid', supportEmail);
  }

  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(securityEmail)) {
    pass('Security email format looks valid', securityEmail);
  } else {
    fail('Security email format invalid', securityEmail);
  }

  if (appleFlag === 'true' || appleFlag === 'false') {
    pass('Apple Sign-In env flag configured', `VITE_ENABLE_APPLE_SIGN_IN=${appleFlag}`);
  } else {
    warn(
      'Apple Sign-In env flag missing or invalid',
      `VITE_ENABLE_APPLE_SIGN_IN=${appleFlag || '<empty>'} (use true/false)`,
    );
  }

  await checkUrlReachable('Privacy Policy', legalUrls.privacy);
  await checkUrlReachable('Terms of Service', legalUrls.terms);
  await checkUrlReachable('Community Guidelines', legalUrls.community);
  await checkUrlReachable('Support', legalUrls.support);

  const reviewNotesRaw = await readFileIfExists('docs/app-review-notes.generated.md');
  if (reviewNotesRaw != null) {
    if (
      /<to be provided before submission>/i.test(reviewNotesRaw) ||
      /\[REPLACE_REVIEW_EMAIL_BEFORE_SUBMIT\]/i.test(reviewNotesRaw) ||
      /\[REPLACE_REVIEW_PASSWORD_BEFORE_SUBMIT\]/i.test(reviewNotesRaw) ||
      /\[REPLACE_BEFORE_SUBMIT\]/i.test(reviewNotesRaw) ||
      /placeholder/i.test(reviewNotesRaw)
    ) {
      warn(
        'Generated review notes still contain placeholders',
        'Set REVIEW_PROD_EMAIL + REVIEW_PROD_PASSWORD and run npm run review:package before submit.',
      );
    } else {
      pass('Generated review notes look production-ready', 'No placeholder markers detected.');
    }
  } else {
    warn(
      'Generated review notes file missing',
      'Run npm run review:package to generate docs/app-review-notes.generated.md.',
    );
  }

  const summary = results.reduce(
    (acc, item) => {
      if (item.status === STATUS.pass) acc.pass += 1;
      if (item.status === STATUS.warn) acc.warn += 1;
      if (item.status === STATUS.fail) acc.fail += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 },
  );

  console.log('\nPreflight results:');
  for (const item of results) {
    const suffix = item.detail ? ` (${item.detail})` : '';
    console.log(`- [${item.status}] ${item.message}${suffix}`);
  }

  console.log(
    `\nSummary -> PASS: ${summary.pass} | WARN: ${summary.warn} | FAIL: ${summary.fail}${
      strictMode ? ' | mode=strict' : ''
    }`,
  );

  const shouldFail = summary.fail > 0 || (strictMode && summary.warn > 0);
  if (shouldFail) {
    console.error('App Store preflight failed.');
    process.exit(1);
  }

  console.log('App Store preflight passed.');
};

run().catch((error) => {
  console.error('App Store preflight crashed:', error);
  process.exit(1);
});
