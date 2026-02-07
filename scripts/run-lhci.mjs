import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const resolveChromePath = () => {
  const configured = process.env.LHCI_CHROME_PATH || process.env.CHROME_PATH;
  if (configured && configured.trim().length > 0) {
    return configured;
  }

  try {
    const executablePath = chromium.executablePath();
    if (typeof executablePath === 'string' && executablePath.trim().length > 0) {
      return executablePath;
    }
  } catch {
    return null;
  }

  return null;
};

const chromePath = resolveChromePath();
if (!chromePath) {
  console.error('Unable to resolve Chrome path for LHCI.');
  console.error('Run `npm run lhci:install-browser` or set `LHCI_CHROME_PATH`.');
  process.exit(1);
}

const strictMode = process.argv.includes('--strict');

const child = spawn('npx lhci autorun --config=.lighthouserc.cjs', {
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    LHCI_CHROME_PATH: chromePath,
    LHCI_STRICT: strictMode ? 'true' : process.env.LHCI_STRICT,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
