import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const strictMode = args.has('--strict');
const productionMode = args.has('--production');
const rootDir = process.cwd();

const STATUS = {
  pass: 'PASS',
  warn: 'WARN',
  fail: 'FAIL',
};

const results = [];

const push = (status, message, detail = '') => {
  results.push({ status, message, detail });
};

const pass = (message, detail = '') => push(STATUS.pass, message, detail);
const warn = (message, detail = '') => push(STATUS.warn, message, detail);
const fail = (message, detail = '') => push(STATUS.fail, message, detail);

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

const getEnv = async () => {
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
    source = source === '.env.example' ? '.env.local + .env.example' : '.env.local';
  }

  return { source, values };
};

const getValue = (map, key) => (map.get(key) ?? '').trim();
const isBool = (value) => value === 'true' || value === 'false';

const run = async () => {
  console.log(
    `[preflight:appcheck] strict=${strictMode ? 'on' : 'off'} production=${
      productionMode ? 'on' : 'off'
    }`,
  );

  const env = await getEnv();
  if (env.source === 'none') {
    fail('Environment file missing', 'Expected .env.local or .env.example');
  } else {
    pass('Environment source found', env.source);
  }

  const appCheckEnabledRaw = getValue(env.values, 'VITE_ENABLE_FIREBASE_APP_CHECK');
  if (!isBool(appCheckEnabledRaw)) {
    fail(
      'VITE_ENABLE_FIREBASE_APP_CHECK invalid',
      `${appCheckEnabledRaw || '<empty>'} (use true/false)`,
    );
  } else {
    pass('VITE_ENABLE_FIREBASE_APP_CHECK format valid', appCheckEnabledRaw);
  }

  const appCheckEnabled = appCheckEnabledRaw === 'true';
  const siteKey = getValue(env.values, 'VITE_FIREBASE_APP_CHECK_SITE_KEY');
  const debugToken = getValue(env.values, 'VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN');
  const autoRefresh = getValue(env.values, 'VITE_FIREBASE_APP_CHECK_TOKEN_AUTO_REFRESH');

  if (!appCheckEnabled) {
    warn('App Check is disabled', 'Set VITE_ENABLE_FIREBASE_APP_CHECK=true for staging rollout.');
  } else {
    if (!siteKey) {
      fail('Missing App Check site key', 'VITE_FIREBASE_APP_CHECK_SITE_KEY');
    } else if (siteKey.length < 20) {
      warn('App Check site key looks short', siteKey);
    } else {
      pass('App Check site key present');
    }

    if (autoRefresh && !isBool(autoRefresh)) {
      fail(
        'VITE_FIREBASE_APP_CHECK_TOKEN_AUTO_REFRESH invalid',
        `${autoRefresh} (use true/false)`,
      );
    } else if (autoRefresh) {
      pass('App Check token auto refresh flag valid', autoRefresh);
    } else {
      pass('App Check token auto refresh default applied', 'true');
    }
  }

  if (productionMode) {
    if (debugToken) {
      fail(
        'Debug token must be empty in production mode',
        'Clear VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN',
      );
    } else {
      pass('Debug token is empty for production mode');
    }
  } else if (debugToken) {
    warn('Debug token configured', 'Use only in controlled staging/local tests.');
  }

  // iOS native App Check verification (monitoring-safe before Enforcement).
  const readOptional = async (relPath) => {
    const abs = path.resolve(rootDir, relPath);
    if (!existsSync(abs)) return null;
    return fs.readFile(abs, 'utf8');
  };

  const iosProjectYml = await readOptional('ios-native/VinctusNative/project.yml');
  if (iosProjectYml && /product:\s*FirebaseAppCheck\b/.test(iosProjectYml)) {
    pass('iOS FirebaseAppCheck dependency declared', 'ios-native/VinctusNative/project.yml');
  } else {
    fail('iOS FirebaseAppCheck dependency missing', 'ios-native/VinctusNative/project.yml');
  }

  const iosBootstrap = await readOptional(
    'ios-native/VinctusNative/Sources/App/FirebaseBootstrap.swift',
  );
  if (
    iosBootstrap &&
    iosBootstrap.includes('AppCheckBootstrap.configureProviderFactoryIfNeeded()') &&
    iosBootstrap.indexOf('AppCheckBootstrap.configureProviderFactoryIfNeeded()') <
      iosBootstrap.indexOf('FirebaseApp.configure(options:')
  ) {
    pass('iOS App Check configured before FirebaseApp.configure');
  } else {
    fail(
      'iOS App Check bootstrap missing or ordered after FirebaseApp.configure',
      'ios-native/VinctusNative/Sources/App/FirebaseBootstrap.swift',
    );
  }

  const iosInfoPlist = await readOptional('ios-native/VinctusNative/Resources/Info.plist');
  if (!iosInfoPlist) {
    fail('iOS Info.plist missing', 'ios-native/VinctusNative/Resources/Info.plist');
  } else {
    const enabledMatch = iosInfoPlist.match(
      /<key>VINCTUS_ENABLE_APP_CHECK<\/key>\s*<(true|false)\s*\/>/i,
    );
    const providerMatch = iosInfoPlist.match(
      /<key>VINCTUS_APP_CHECK_PROVIDER<\/key>\s*<string>([^<]*)<\/string>/i,
    );
    const iosEnabled = enabledMatch ? enabledMatch[1].toLowerCase() === 'true' : null;
    const iosProvider = providerMatch ? providerMatch[1].trim().toLowerCase() : '';

    if (iosEnabled === null) {
      fail('iOS VINCTUS_ENABLE_APP_CHECK key missing in Info.plist');
    } else if (!iosEnabled && productionMode) {
      fail('iOS VINCTUS_ENABLE_APP_CHECK must be true in production mode');
    } else if (!iosEnabled) {
      warn('iOS App Check disabled in Info.plist', 'VINCTUS_ENABLE_APP_CHECK=false');
    } else {
      pass('iOS VINCTUS_ENABLE_APP_CHECK enabled', 'true');
    }

    const validProviders = new Set([
      'auto',
      'debug',
      'devicecheck',
      'device_check',
      'device-check',
      'appattest',
      'app_attest',
      'app-attest',
      'disabled',
    ]);
    if (!validProviders.has(iosProvider)) {
      fail('iOS VINCTUS_APP_CHECK_PROVIDER invalid', iosProvider || '<empty>');
    } else if (productionMode && (iosProvider === 'debug' || iosProvider === 'disabled')) {
      fail('iOS VINCTUS_APP_CHECK_PROVIDER cannot be debug/disabled in production', iosProvider);
    } else {
      pass('iOS VINCTUS_APP_CHECK_PROVIDER valid', iosProvider);
    }

    if (['appattest', 'app_attest', 'app-attest'].includes(iosProvider)) {
      const iosEntitlements = await readOptional(
        'ios-native/VinctusNative/Resources/VinctusNative.entitlements',
      );
      if (
        iosEntitlements &&
        iosEntitlements.includes('com.apple.developer.devicecheck.appattest-environment')
      ) {
        pass('iOS App Attest entitlement present');
      } else {
        fail(
          'iOS App Attest provider selected without appattest-environment entitlement',
          'Add com.apple.developer.devicecheck.appattest-environment or use VINCTUS_APP_CHECK_PROVIDER=auto',
        );
      }
    }
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

  console.log('\nApp Check preflight results:');
  for (const item of results) {
    const detail = item.detail ? ` (${item.detail})` : '';
    console.log(`- [${item.status}] ${item.message}${detail}`);
  }

  console.log(
    `\nSummary -> PASS: ${summary.pass} | WARN: ${summary.warn} | FAIL: ${summary.fail}${
      strictMode ? ' | mode=strict' : ''
    }`,
  );

  if (summary.fail > 0 || (strictMode && summary.warn > 0)) {
    console.error('App Check preflight failed.');
    process.exit(1);
  }

  console.log('App Check preflight passed.');
};

run().catch((error) => {
  console.error('App Check preflight crashed:', error);
  process.exit(1);
});
