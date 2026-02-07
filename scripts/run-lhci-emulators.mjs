import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  FIREBASE_PROJECT_ID: 'vinctus-dev',
  GCLOUD_PROJECT: 'vinctus-dev',
  VITE_FIREBASE_PROJECT_ID: 'vinctus-dev',
  VITE_USE_FIREBASE_EMULATOR: 'true',
  VITE_FIREBASE_EMULATOR_HOST: process.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1',
  VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY || 'test',
  VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'localhost',
  VITE_FIREBASE_STORAGE_BUCKET:
    process.env.VITE_FIREBASE_STORAGE_BUCKET || 'vinctus-dev.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'test',
  VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID || 'test',
};

const command =
  'npx firebase emulators:exec --project vinctus-dev --only auth,firestore,storage "npm run seed && npm run lhci"';

const child = spawn(command, {
  shell: true,
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
