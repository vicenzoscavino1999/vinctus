import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const isSmokeFastMode = isCI && process.env.PLAYWRIGHT_SMOKE_FAST === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? 'line' : 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: isSmokeFastMode
      ? 'npm run dev -- --port 5173'
      : isCI
        ? 'npm run build && npm run preview -- --port 5173'
        : 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !isCI,
    env: {
      VITE_USE_FIREBASE_EMULATOR: 'true',
      VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1',
      VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID || 'vinctus-dev',
      VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY || 'test',
      VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'localhost',
      VITE_FIREBASE_STORAGE_BUCKET:
        process.env.VITE_FIREBASE_STORAGE_BUCKET || 'vinctus-dev.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'test',
      VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID || 'test',
    },
  },
});
