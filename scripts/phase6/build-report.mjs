import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const ROOT = process.cwd();

const REPORT_FILE = path.join(ROOT, 'docs', 'phase6', 'reports', 'bundle.html');

const run = (cmd, args, { cwd = ROOT, env = process.env } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });

async function main() {
  await fs.mkdir(path.dirname(REPORT_FILE), { recursive: true });

  await run(npmCmd, ['run', 'build'], {
    env: { ...process.env, VINCTUS_BUNDLE_REPORT: 'true' },
  });

  const exists = await fs.stat(REPORT_FILE).catch(() => null);
  if (!exists) {
    throw new Error(`Bundle report was not generated: ${path.relative(ROOT, REPORT_FILE)}`);
  }

  console.log(`Bundle report saved: ${path.relative(ROOT, REPORT_FILE)}`);
}

main().catch((error) => {
  console.error('Build report failed:', error);
  process.exit(1);
});

