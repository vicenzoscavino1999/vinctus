import { spawn } from 'node:child_process';
import process from 'node:process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const isSmoke = process.argv.includes('--smoke');
const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  'vinctus-dev';

const env = {
  ...process.env,
  CI: '1',
  FIREBASE_PROJECT_ID: projectId,
  GCLOUD_PROJECT: projectId,
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_USE_FIREBASE_EMULATOR: 'true',
  VITE_FIREBASE_EMULATOR_HOST: process.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1',
  ...(isSmoke ? { PLAYWRIGHT_SMOKE_FAST: '1' } : {}),
};

const onlyArg = 'auth,firestore,storage,functions';
const testScript = isSmoke ? 'test:e2e:smoke' : 'test:e2e';
const execCommand = `npm run seed && npm run ${testScript}`;

const fullCommand = `${npxCmd} firebase emulators:exec --project ${projectId} --only ${onlyArg} "${execCommand}"`;

const child = spawn(fullCommand, {
  env,
  shell: true,
  stdio: 'inherit',
});

child.on('exit', (code) => {
  if (typeof code === 'number' && code !== 0) {
    console.error(`[run-e2e-local-ci] exited with code ${code}`);
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error('[run-e2e-local-ci] failed to start', error);
  process.exit(1);
});
