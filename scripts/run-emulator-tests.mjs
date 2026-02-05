import { spawn } from 'node:child_process';
import process from 'node:process';

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  'vinctus-dev';

const env = {
  ...process.env,
  GCLOUD_PROJECT: projectId,
  FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_USE_FIREBASE_EMULATOR: 'true',
  VITE_FIREBASE_EMULATOR_HOST: process.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1',
  VITE_ENABLE_DEV_METRICS: 'false',
};

const vitestArgs = process.argv.slice(2);

const child = spawn(
  npxCmd,
  ['vitest', 'run', '--config', 'vitest.emulators.config.ts', ...vitestArgs],
  {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  },
);

child.on('error', (error) => {
  console.error('Failed to run emulator tests:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
