import path from 'node:path';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'docs', 'phase6', 'reports', 'lhci');

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
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  await run(npmCmd, ['run', 'build']);
  await run(npxCmd, ['lhci', 'collect', '--config', '.lighthouserc.json']);
  await run(npxCmd, ['lhci', 'assert', '--config', '.lighthouserc.json']);
  await run(npxCmd, ['lhci', 'upload', '--config', '.lighthouserc.json']);

  console.log(`LHCI reports saved: ${path.relative(ROOT, REPORTS_DIR)}`);
}

main().catch((error) => {
  console.error('LHCI baseline failed:', error);
  process.exit(1);
});
