import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const outputPackageRelativePath = 'docs/app-review-package.generated.md';
const outputReviewNotesRelativePath = 'docs/app-review-notes.generated.md';
const outputPackagePath = path.resolve(rootDir, outputPackageRelativePath);
const outputReviewNotesPath = path.resolve(rootDir, outputReviewNotesRelativePath);
const reviewNotesDraftPath = path.resolve(rootDir, 'docs/app-review-notes-draft.md');

const defaultValues = {
  privacyUrl: 'https://vinctus.app/privacy',
  termsUrl: 'https://vinctus.app/terms',
  communityUrl: 'https://vinctus.app/community-guidelines',
  supportUrl: 'https://vinctus.app/support',
  supportEmail: 'support@vinctus.app',
  securityEmail: 'security@vinctus.app',
  demoUid: 'reviewer_demo',
  demoEmail: 'reviewer@vinctus.local',
};

const placeholderRegex =
  /\[REPLACE_(?:REVIEW_EMAIL|REVIEW_PASSWORD)_BEFORE_SUBMIT\]|\[REPLACE_BEFORE_SUBMIT\]|<to be provided before submission>|placeholder/i;

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

const readEnvMap = async () => {
  const envLocalPath = path.resolve(rootDir, '.env.local');
  const envExamplePath = path.resolve(rootDir, '.env.example');
  const values = new Map();
  let source = 'fallback-defaults';

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

const getEnvValue = (map, key, fallback) => {
  const value = (map.get(key) ?? '').trim();
  return value.length > 0 ? value : fallback;
};

const isValidEmail = (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

const tryGit = (command, fallback = 'n/a') => {
  try {
    const output = execSync(command, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const value = output.trim();
    return value.length > 0 ? value : fallback;
  } catch {
    return fallback;
  }
};

const hasPlaceholders = (raw) => placeholderRegex.test(raw);

const renderReviewNotes = (draftContent, credentials) => {
  const generatedAtIso = new Date().toISOString();
  let rendered = draftContent;

  if (credentials.ready) {
    rendered = rendered.replace(
      /\[REPLACE_REVIEW_EMAIL_BEFORE_SUBMIT\]/g,
      credentials.email,
    );
    rendered = rendered.replace(
      /\[REPLACE_REVIEW_PASSWORD_BEFORE_SUBMIT\]/g,
      credentials.password,
    );

    let replacementIndex = 0;
    rendered = rendered.replace(/\[REPLACE_BEFORE_SUBMIT\]/g, () => {
      replacementIndex += 1;
      if (replacementIndex === 1) return credentials.email;
      if (replacementIndex === 2) return credentials.password;
      return credentials.email;
    });
  }

  const header = [
    '<!-- Generated file. Do not edit directly. -->',
    '<!-- Source: docs/app-review-notes-draft.md -->',
    `<!-- Generated at: ${generatedAtIso} -->`,
    '',
  ].join('\n');

  const content = `${header}${rendered.trimEnd()}\n`;
  return {
    content,
    hasPlaceholders: hasPlaceholders(content),
  };
};

const buildMarkdown = (ctx) => {
  const {
    generatedAtIso,
    envSource,
    branch,
    commitShort,
    appleFlag,
    urls,
    contacts,
    demo,
    reviewCredentialsReady,
    reviewProdEmail,
    reviewNotesGeneratedPath,
    reviewNotesHasPlaceholders,
  } = ctx;

  const placeholderStatus = reviewNotesHasPlaceholders ? 'YES' : 'NO';
  const productionReviewEmail = reviewCredentialsReady
    ? reviewProdEmail
    : '[REPLACE_REVIEW_EMAIL_BEFORE_SUBMIT]';
  const productionReviewPassword = reviewCredentialsReady
    ? '[SET_FROM_ENV_REVIEW_PROD_PASSWORD]'
    : '[REPLACE_REVIEW_PASSWORD_BEFORE_SUBMIT]';
  const reviewNotesCredentialAction = reviewNotesHasPlaceholders
    ? 'Set REVIEW_PROD_EMAIL + REVIEW_PROD_PASSWORD and rerun `npm run review:package`.'
    : 'Production review credentials are injected from local env (not committed).';

  return `# App Review Package - Vinctus

Generated at: ${generatedAtIso}
Environment source: ${envSource}
Branch: ${branch}
Commit: ${commitShort}

## Reviewer Access

### Local QA / Emulators

- Seed command: \`npm run seed:app-review:emulators\`
- Email: \`${demo.email}\`
- Password: \`Review123!\`
- UID: \`${demo.uid}\`

### Production App Review (before submit)

- Email: ${productionReviewEmail}
- Password: ${productionReviewPassword}
- Generated review notes: \`${reviewNotesGeneratedPath}\`
- Placeholders still present in generated review-notes: ${placeholderStatus}

## Legal and Support

- Privacy Policy: ${urls.privacy}
- Terms of Service: ${urls.terms}
- Community Guidelines: ${urls.community}
- Support URL: ${urls.support}
- Support email: ${contacts.support}
- Security email: ${contacts.security}

## Auth and Access Notes

- Apple Sign-In flag in env: \`${appleFlag || '<unset>'}\`
- Rule: if Google Sign-In is visible in iOS production, Apple Sign-In must also be visible.
- Setup guide: \`docs/apple-sign-in-setup.md\`

## Reviewer Quick Path

1. Login with demo account.
2. Go to Settings and verify legal links, AI consent toggle, and Delete Account entrypoint.
3. Go to Help and verify support/security contact.
4. Open Feed/Post and verify comment/report flow.
5. Open Messages and verify direct + group conversations.
6. Open Moderation panel (\`/moderation\`) and verify queue items.

## Compliance Evidence Map

- Sign in with Apple wiring: \`src/app/providers/AuthContext.tsx\`, \`src/features/auth/components/LoginScreen.tsx\`
- Delete account backend + status: \`functions/src/deleteAccount.ts\`
- UGC reports + queue trigger: \`src/shared/lib/firestore/reports.ts\`, \`functions/src/index.ts\`
- AI consent enforcement: \`api/chat.ts\`, \`functions/src/arena/createDebate.ts\`
- Safe area baseline: \`src/index.css\`
- Offline UX banner: \`src/app/routes/AppLayout.tsx\`
- Native capabilities baseline: \`src/shared/lib/native/pushNotifications.ts\`, \`src/shared/lib/native/camera.ts\`, \`src/shared/lib/native/haptics.ts\`

## Submission Commands

\`\`\`bash
npm run review:package
npm run preflight:appstore
npm run lint
npm run typecheck
npm run build
\`\`\`

## Manual Blockers Before Submit

1. ${reviewNotesCredentialAction}
2. Complete Apple Developer paid setup and Firebase Apple provider config.
3. Build/TestFlight validation on real iPhone with signed iOS binary.
4. Complete App Store Connect privacy labels and age rating questionnaire.

## Source Docs

- \`docs/app-store-readiness.md\`
- \`docs/app-store-submission-checklist.md\`
- \`docs/app-store-metadata-draft.md\`
- \`docs/app-review-notes-draft.md\`
- \`docs/app-review-demo-account.md\`
`;
};

const main = async () => {
  const envInfo = await readEnvMap();
  const values = envInfo.values;

  if (!existsSync(reviewNotesDraftPath)) {
    throw new Error('Missing docs/app-review-notes-draft.md');
  }

  const reviewNotesDraftRaw = await fs.readFile(reviewNotesDraftPath, 'utf8');
  const reviewProdEmail = getEnvValue(values, 'REVIEW_PROD_EMAIL', '');
  const reviewProdPassword = getEnvValue(values, 'REVIEW_PROD_PASSWORD', '');
  const reviewCredentialsReady =
    isValidEmail(reviewProdEmail) && reviewProdPassword.trim().length >= 8;
  const renderedReviewNotes = renderReviewNotes(reviewNotesDraftRaw, {
    ready: reviewCredentialsReady,
    email: reviewProdEmail,
    password: reviewProdPassword,
  });

  const urls = {
    privacy: getEnvValue(values, 'VITE_PRIVACY_POLICY_URL', defaultValues.privacyUrl),
    terms: getEnvValue(values, 'VITE_TERMS_OF_SERVICE_URL', defaultValues.termsUrl),
    community: getEnvValue(values, 'VITE_COMMUNITY_GUIDELINES_URL', defaultValues.communityUrl),
    support: getEnvValue(values, 'VITE_SUPPORT_URL', defaultValues.supportUrl),
  };

  const contacts = {
    support: getEnvValue(values, 'VITE_SUPPORT_EMAIL', defaultValues.supportEmail),
    security: getEnvValue(values, 'VITE_SECURITY_EMAIL', defaultValues.securityEmail),
  };

  const demo = {
    uid: getEnvValue(values, 'REVIEW_DEMO_UID', defaultValues.demoUid),
    email: getEnvValue(values, 'REVIEW_DEMO_EMAIL', defaultValues.demoEmail),
  };

  const appleFlag = getEnvValue(values, 'VITE_ENABLE_APPLE_SIGN_IN', '');

  const markdown = buildMarkdown({
    generatedAtIso: new Date().toISOString(),
    envSource: envInfo.source,
    branch: tryGit('git rev-parse --abbrev-ref HEAD'),
    commitShort: tryGit('git rev-parse --short HEAD'),
    appleFlag,
    urls,
    contacts,
    demo,
    reviewCredentialsReady,
    reviewProdEmail,
    reviewNotesGeneratedPath: outputReviewNotesRelativePath,
    reviewNotesHasPlaceholders: renderedReviewNotes.hasPlaceholders,
  });

  await fs.writeFile(outputReviewNotesPath, renderedReviewNotes.content, 'utf8');
  await fs.writeFile(outputPackagePath, markdown, 'utf8');
  console.log(`[review-package] generated ${outputReviewNotesRelativePath}`);
  console.log(`[review-package] generated ${outputPackageRelativePath}`);
};

main().catch((error) => {
  console.error('[review-package] failed:', error);
  process.exit(1);
});
