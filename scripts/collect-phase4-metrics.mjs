import fs from 'node:fs/promises';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const outFile = process.env.METRICS_OUT || 'phase4-metrics.json';
const baseUrl = process.env.METRICS_BASE_URL || 'http://localhost:5173';

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

const applyMetricEnv = () => {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      process.env[key] = value;
    }
  }
};

const startDevServer = async () => {
  applyMetricEnv();
  const server = await createServer({
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
  });
  await server.listen();
  return server;
};

const stopProcess = async (server) => {
  if (!server) return;
  await server.close();
};

const isLoggedIn = async (page) => {
  const createBtn = page.locator('button[aria-label*="Crear"]');
  const discoverBtn = page.locator('[aria-label*="Descub"]');

  if (await createBtn.isVisible({ timeout: 1500 }).catch(() => false)) return true;
  if (await discoverBtn.isVisible({ timeout: 1500 }).catch(() => false)) return true;
  return false;
};

const login = async (page) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('vinctus_onboarding_complete', 'true');
  });
  await page.goto(`${baseUrl}/`);

  if (await isLoggedIn(page)) return;

  await page.locator('input[type="email"]').fill('alice@vinctus.local');
  await page.locator('input[type="password"]').fill('password123');

  await page
    .locator('form')
    .getByRole('button', { name: /Entrar/i })
    .first()
    .click();

  await page.waitForFunction(
    () => !!document.querySelector('button[aria-label*="Crear"]') || !!document.querySelector('[aria-label*="Descub"]'),
    undefined,
    { timeout: 20000 },
  );
};

const waitMetricsApi = async (page) => {
  await page.waitForFunction(() => typeof window.vinctusMetrics !== 'undefined', undefined, {
    timeout: 20000,
  });
};

const resetMetrics = async (page) => {
  await page.evaluate(() => {
    window.vinctusMetrics.reset();
  });
};

const snapshot = async (page) =>
  page.evaluate(() => {
    return window.vinctusMetrics.snapshot();
  });

const pickFlow = (snap, flow) => {
  const f = snap.flows?.[flow] || {};
  return {
    reads: f.reads || 0,
    writes: f.writes || 0,
    calls: f.calls || 0,
    listenersActive: f.listenersActive || 0,
    listenersPeak: f.listenersPeak || 0,
    listenerStarts: f.listenerStarts || 0,
    listenerStops: f.listenerStops || 0,
  };
};

const measureFeed = async (page) => {
  await page.goto(`${baseUrl}/discover`);
  await wait(800);
  await resetMetrics(page);
  await page.goto(`${baseUrl}/feed`);
  await wait(2600);
  const open = await snapshot(page);
  await page.goto(`${baseUrl}/help`);
  await wait(900);
  const afterLeave = await snapshot(page);
  return { open, afterLeave };
};

const openConversation = async (page) => {
  const firstRow = page.locator('a,button,[role="button"]').filter({ hasText: /Bob|Alice|Carla|mensaje|chat|dm_/i }).first();
  if (await firstRow.isVisible({ timeout: 2500 }).catch(() => false)) {
    await firstRow.click();
    await wait(1200);
  }
};

const measureChat = async (page) => {
  await page.goto(`${baseUrl}/discover`);
  await wait(800);
  await resetMetrics(page);
  await page.goto(`${baseUrl}/messages`);
  await wait(2200);
  await openConversation(page);
  const open = await snapshot(page);
  await page.goto(`${baseUrl}/help`);
  await wait(900);
  const afterLeave = await snapshot(page);
  return { open, afterLeave };
};

const measureCreatePost = async (page) => {
  await page.goto(`${baseUrl}/discover`);
  await wait(800);
  await resetMetrics(page);
  await page.goto(`${baseUrl}/feed`);
  await wait(1700);

  const createBtn = page.locator('button[aria-label*="Crear"]').first();
  await createBtn.waitFor({ state: 'visible', timeout: 20000 });
  await createBtn.click();

  await page.getByPlaceholder(/Escribe la descripcion/i).fill(`Phase4 metrics post ${Date.now()}`);
  await page.getByRole('button', { name: /^Publicar$/ }).click();

  await page.waitForURL('**/feed', { timeout: 20000 });
  await wait(1200);
  return snapshot(page);
};

const main = async () => {
  const dev = await startDevServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await login(page);
    await waitMetricsApi(page);

    const feed = await measureFeed(page);
    const chat = await measureChat(page);
    const createPost = await measureCreatePost(page);

    const data = {
      capturedAt: new Date().toISOString(),
      feed: {
        open: pickFlow(feed.open, 'feed'),
        listenersActiveAfterLeave: feed.afterLeave.totals?.listenersActive || 0,
      },
      chat: {
        open: pickFlow(chat.open, 'chat'),
        listenersActiveAfterLeave: chat.afterLeave.totals?.listenersActive || 0,
      },
      createPost: pickFlow(createPost, 'feed'),
      totals: {
        feedOpen: feed.open.totals,
        chatOpen: chat.open.totals,
        createPost: createPost.totals,
      },
    };

    await fs.writeFile(outFile, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Metrics saved to ${outFile}`);
  } finally {
    await browser.close();
    await stopProcess(dev);
  }
};

main().catch((error) => {
  console.error('Metrics collection failed:', error);
  process.exit(1);
});
