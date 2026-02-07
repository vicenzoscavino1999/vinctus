import fs from 'node:fs/promises';
import net from 'node:net';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { chromium } from '@playwright/test';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const outFile = process.env.METRICS_OUT || 'docs/phase6/reports/phase6-metrics-run.json';
const baseUrl = process.env.METRICS_BASE_URL || 'http://127.0.0.1:5173';
const shouldStartDevServer = process.env.METRICS_START_DEV_SERVER !== 'false';
const appWaitMs = Number.parseInt(process.env.METRICS_APP_WAIT_MS || '1200', 10) || 1200;
const maxLoadMoreClicks = Number.parseInt(process.env.METRICS_FEED_LOAD_MORE || '2', 10) || 2;

const env = {
  ...process.env,
  VITE_USE_FIREBASE_EMULATOR: 'true',
  VITE_FIREBASE_EMULATOR_HOST: process.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1',
  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID || 'vinctus-dev',
  VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY || 'test',
  VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'localhost',
  VITE_FIREBASE_STORAGE_BUCKET:
    process.env.VITE_FIREBASE_STORAGE_BUCKET || 'vinctus-dev.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'test',
  VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID || 'test',
  VITE_ENABLE_DEV_METRICS: 'true',
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPort = (port, host = '127.0.0.1', timeoutMs = 60000) =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const probe = () => {
      const socket = net.createConnection(port, host);
      socket.on('connect', () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for ${host}:${port}`));
          return;
        }
        setTimeout(probe, 250);
      });
    };
    probe();
  });

const startDevServer = async () => {
  if (!shouldStartDevServer) return null;

  const child = spawn(npmCmd, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  await waitForPort(5173);
  return child;
};

const killWindowsProcessTree = async (pid) =>
  new Promise((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: true,
    });
    killer.once('exit', () => resolve());
    killer.once('error', () => resolve());
  });

const stopProcess = async (child) =>
  new Promise((resolve) => {
    if (!child || child.killed || child.exitCode !== null) {
      resolve();
      return;
    }

    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    child.once('exit', done);

    if (process.platform === 'win32') {
      void killWindowsProcessTree(child.pid).then(done);
      setTimeout(done, 5000);
      return;
    }

    child.kill('SIGINT');
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }, 4000);
    setTimeout(done, 6000);
  });

const isLoggedIn = async (page) => {
  const createBtn = page.locator('button[aria-label*="Crear"]');
  const discoverSearch = page.locator('input[aria-label*="Buscar intereses"]');
  const feedLike = page.locator('button[aria-label="Dar like"]');
  const profileEdit = page.getByRole('button', { name: /Editar Perfil/i });

  if (await createBtn.isVisible({ timeout: 1200 }).catch(() => false)) return true;
  if (await discoverSearch.isVisible({ timeout: 1200 }).catch(() => false)) return true;
  if (await feedLike.isVisible({ timeout: 1200 }).catch(() => false)) return true;
  if (await profileEdit.isVisible({ timeout: 1200 }).catch(() => false)) return true;
  return false;
};

const login = async (page) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vinctus_onboarding_complete', 'true');
  });
  await page.goto(`${baseUrl}/`);

  if (await isLoggedIn(page)) return;

  const emailInput = page.locator('input[type="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  await emailInput.fill('alice@vinctus.local');
  await passwordInput.fill('password123');

  const form = page.locator('form').filter({ has: emailInput }).first();
  await form.getByRole('button', { name: /^Entrar$/i }).click();

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await isLoggedIn(page)) return;
    await page.waitForTimeout(500);
  }

  const authError = await page
    .locator('text=/correo|contrasena|contraseña|password|error/i')
    .first()
    .textContent()
    .catch(() => null);
  throw new Error(`Login did not complete.${authError ? ` UI error: ${authError}` : ''}`);
};

const waitMetricsApi = async (page) => {
  await page.waitForFunction(() => typeof window.vinctusMetrics !== 'undefined', undefined, {
    timeout: 20000,
  });
};

const resetMetrics = async (page) => {
  await page.evaluate(() => {
    window.vinctusMetrics.reset();
    performance.clearResourceTimings();
  });
};

const snapshot = async (page) =>
  page.evaluate(() => {
    return window.vinctusMetrics.snapshot();
  });

const collectNetworkStats = async (page) =>
  page.evaluate(() => {
    const entries = performance.getEntriesByType('resource');
    let totalTransferBytes = 0;
    let storageEgressBytes = 0;
    let functionsInvocations = 0;
    const byHost = {};

    for (const rawEntry of entries) {
      const entry = rawEntry;
      const name = entry.name || '';
      let host = 'unknown';

      try {
        host = new URL(name).host;
      } catch {
        host = 'unknown';
      }

      const transferSize =
        typeof entry.transferSize === 'number'
          ? entry.transferSize
          : typeof entry.encodedBodySize === 'number'
            ? entry.encodedBodySize
            : 0;

      totalTransferBytes += transferSize;
      byHost[host] = (byHost[host] || 0) + transferSize;

      const isStorage =
        name.includes('firebasestorage.googleapis.com') ||
        name.includes('localhost:9199') ||
        name.includes('127.0.0.1:9199') ||
        name.includes('/v0/b/');

      const isFunction =
        name.includes('.cloudfunctions.net') ||
        name.includes('/us-central1/') ||
        name.includes('localhost:5001') ||
        name.includes('127.0.0.1:5001');

      if (isStorage) {
        storageEgressBytes += transferSize;
      }
      if (isFunction) {
        functionsInvocations += 1;
      }
    }

    const topHosts = Object.entries(byHost)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([host, bytes]) => ({ host, bytes }));

    return {
      totalTransferBytes,
      storageEgressBytes,
      functionsInvocations,
      topHosts,
      sampleCount: entries.length,
    };
  });

const extractFirestoreTotals = (snap) => {
  const totals = snap?.totals || {};
  const bySource = totals.bySource || {};
  return {
    reads: totals.reads || 0,
    writes: totals.writes || 0,
    deletes: bySource['firestore.deleteDoc'] || 0,
    listenersActive: totals.listenersActive || 0,
    listenersPeak: totals.listenersPeak || 0,
    listenerStarts: totals.listenerStarts || 0,
    listenerStops: totals.listenerStops || 0,
    calls: totals.calls || 0,
    bySource,
  };
};

const waitForScreenReady = async (page, kind) => {
  if (kind === 'discover') {
    await page.locator('input[aria-label*="Buscar intereses"]').first().waitFor({ timeout: 20000 });
    return;
  }
  if (kind === 'feed') {
    await page.locator('button[aria-label="Dar like"]').first().waitFor({ timeout: 20000 });
    return;
  }
  if (kind === 'post') {
    await page.locator('h1').first().waitFor({ timeout: 20000 });
    return;
  }
  if (kind === 'chat') {
    await page.waitForURL('**/messages**', { timeout: 20000 });
    await page.waitForSelector(
      'input[placeholder*="Escribe un mensaje"], input[placeholder*="Buscar mensajes"]',
      { timeout: 20000 },
    );
    return;
  }
  if (kind === 'profile') {
    await page.getByRole('button', { name: /Editar Perfil/i }).first().waitFor({ timeout: 20000 });
  }
};

const leaveFlow = async (page) => {
  await page.goto(`${baseUrl}/help`);
  await wait(700);
  return snapshot(page);
};

const measureSimpleFlow = async (page, label, route, kind) => {
  await resetMetrics(page);
  const startedAt = Date.now();
  await page.goto(`${baseUrl}${route}`);
  await waitForScreenReady(page, kind);
  await wait(appWaitMs);
  const openSnap = await snapshot(page);
  const latencyMs = Date.now() - startedAt;
  const network = await collectNetworkStats(page);
  const afterLeaveSnap = await leaveFlow(page);

  return {
    label,
    route,
    latencyMs,
    firestore: extractFirestoreTotals(openSnap),
    listenersActiveAfterLeave: afterLeaveSnap?.totals?.listenersActive || 0,
    network,
  };
};

const clickLoadMore = async (page) => {
  const button = page.getByRole('button', { name: /Cargar/i }).first();
  const visible = await button.isVisible({ timeout: 1800 }).catch(() => false);
  if (!visible) return false;
  await button.click();
  await wait(900);
  return true;
};

const measureFeedFlow = async (page) => {
  await resetMetrics(page);
  const startedAt = Date.now();

  await page.goto(`${baseUrl}/feed`);
  await waitForScreenReady(page, 'feed');
  await wait(appWaitMs);

  let pagesLoaded = 1;
  for (let i = 0; i < maxLoadMoreClicks; i += 1) {
    const clicked = await clickLoadMore(page);
    if (!clicked) break;
    pagesLoaded += 1;
  }

  const visiblePosts = await page.locator('button[aria-label="Dar like"]').count();
  const openSnap = await snapshot(page);
  const latencyMs = Date.now() - startedAt;
  const network = await collectNetworkStats(page);
  const afterLeaveSnap = await leaveFlow(page);

  // Round-trip check for leaked listeners (navigate back and leave again)
  await page.goto(`${baseUrl}/feed`);
  await waitForScreenReady(page, 'feed');
  await wait(900);
  const secondAfterLeaveSnap = await leaveFlow(page);

  const firestore = extractFirestoreTotals(openSnap);
  const feedReadsForGate =
    (firestore.bySource?.['feed.getDocs'] || 0) + (firestore.bySource?.['feed.getDoc'] || 0);
  const readPerVisiblePost =
    visiblePosts > 0 ? Number((Math.max(0, feedReadsForGate) / visiblePosts).toFixed(3)) : null;

  return {
    label: 'feed_3_pages',
    route: '/feed',
    latencyMs,
    pagesLoaded,
    visiblePosts,
    readPerVisiblePost,
    firestore: {
      ...firestore,
      gateReads: Math.max(0, feedReadsForGate),
    },
    listenersActiveAfterLeave: afterLeaveSnap?.totals?.listenersActive || 0,
    listenersActiveAfterRoundTrip: secondAfterLeaveSnap?.totals?.listenersActive || 0,
    network,
  };
};

const measureChatFlow = async (page) => {
  await resetMetrics(page);
  const startedAt = Date.now();

  await page.goto(`${baseUrl}/messages?conversation=dm_user_a_user_b`);
  await waitForScreenReady(page, 'chat');
  await wait(appWaitMs + 500);

  const openSnap = await snapshot(page);
  const latencyMs = Date.now() - startedAt;
  const network = await collectNetworkStats(page);
  const afterLeaveSnap = await leaveFlow(page);

  // Round-trip leak check
  await page.goto(`${baseUrl}/messages?conversation=dm_user_a_user_b`);
  await waitForScreenReady(page, 'chat');
  await wait(900);
  const secondAfterLeaveSnap = await leaveFlow(page);

  return {
    label: 'chat_open',
    route: '/messages',
    latencyMs,
    firestore: extractFirestoreTotals(openSnap),
    listenersActiveAfterLeave: afterLeaveSnap?.totals?.listenersActive || 0,
    listenersActiveAfterRoundTrip: secondAfterLeaveSnap?.totals?.listenersActive || 0,
    network,
  };
};

const main = async () => {
  const devServer = await startDevServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await login(page);
    await waitMetricsApi(page);

    const discover = await measureSimpleFlow(page, 'discover_critical', '/discover', 'discover');
    const feed = await measureFeedFlow(page);
    const post = await measureSimpleFlow(page, 'post_open', '/post/post_1', 'post');
    const chat = await measureChatFlow(page);
    const profile = await measureSimpleFlow(page, 'profile_critical', '/profile', 'profile');

    const payload = {
      capturedAt: new Date().toISOString(),
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      baseUrl,
      dataset: {
        extraPosts: Number.parseInt(process.env.PHASE6_EXTRA_POSTS || '120', 10) || 120,
        extraDirectConversations:
          Number.parseInt(process.env.PHASE6_EXTRA_DIRECT_CONVERSATIONS || '80', 10) || 80,
      },
      flows: {
        discover,
        feed,
        post,
        chat,
        profile,
      },
    };

    await fs.mkdir('docs/phase6/reports', { recursive: true });
    await fs.writeFile(outFile, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`Phase6 metrics saved to ${outFile}`);
  } finally {
    await browser.close();
    await stopProcess(devServer);
  }
};

main().catch((error) => {
  console.error('Phase6 metrics collection failed:', error);
  process.exit(1);
});
