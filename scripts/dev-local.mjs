import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import process from 'node:process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const projectId =
  process.env.VITE_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  'vinctus-dev';

const env = {
  ...process.env,
  FIREBASE_PROJECT_ID: projectId,
  GCLOUD_PROJECT: projectId,
  VITE_USE_FIREBASE_EMULATOR: 'true',
};

const run = (cmd, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`));
      }
    });
  });

const waitForPort = (port, host, timeoutMs) =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const socket = net.createConnection(port, host);
      socket.on('connect', () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for ${host}:${port}`));
        } else {
          setTimeout(tryConnect, 500);
        }
      });
    };
    tryConnect();
  });

const ensureFunctionsDeps = async () => {
  if (!existsSync('functions/node_modules')) {
    await run(npmCmd, ['--prefix', 'functions', 'install'], { env });
  }
  await run(npmCmd, ['--prefix', 'functions', 'run', 'build'], { env });
};

const main = async () => {
  await ensureFunctionsDeps();

  const emulator = spawn(
    npxCmd,
    ['firebase', 'emulators:start', '--only', 'auth,firestore,storage,functions', '--project', projectId],
    { stdio: 'inherit', env, shell: process.platform === 'win32' },
  );

  const shutdown = () => {
    emulator.kill('SIGINT');
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const emulatorHost = '127.0.0.1';
  await Promise.all([
    waitForPort(8080, emulatorHost, 30000), // Firestore
    waitForPort(9099, emulatorHost, 30000), // Auth
    waitForPort(9199, emulatorHost, 30000), // Storage
  ]);
  await run(npmCmd, ['run', 'seed'], { env });

  const app = spawn(npmCmd, ['run', 'dev', '--', '--port', '5173'], {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });

  app.on('exit', (code) => {
    emulator.kill('SIGINT');
    process.exit(code ?? 0);
  });

  emulator.on('exit', (code) => {
    if (code && code !== 0) {
      process.exit(code);
    }
  });
};

main().catch((error) => {
  console.error('dev:local failed:', error);
  process.exit(1);
});
