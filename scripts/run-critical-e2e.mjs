import { spawn } from 'node:child_process';
import process from 'node:process';

const runnerCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const projectId = 'vinctus-dev';

const env = {
  ...process.env,
  GCLOUD_PROJECT: projectId,
  FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_USE_FIREBASE_EMULATOR: 'true',
  VITE_FIREBASE_EMULATOR_HOST: process.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1',
};

const command = `${runnerCmd} firebase emulators:exec --project ${projectId} --only auth,firestore,storage,functions "npm run seed && npm run test:e2e:critical:run"`;

const child = spawn(command, {
  stdio: 'inherit',
  env,
  shell: true,
});

child.on('error', (error) => {
  console.error('Failed to run critical e2e:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
