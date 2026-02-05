import path from 'node:path';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, 'docs', 'phase6', 'reports');

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
  await fs.mkdir(REPORT_DIR, { recursive: true });

  await run(npmCmd, ['run', 'type:coverage']);
  await run(npmCmd, ['run', 'test:coverage']);
  await run(npmCmd, ['run', 'lhci:phase6']);

  console.log(`Day 14 reports updated in: ${path.relative(ROOT, REPORT_DIR)}`);
}

main().catch((error) => {
  console.error('Phase 6 Day 14 report failed:', error);
  process.exit(1);
});
