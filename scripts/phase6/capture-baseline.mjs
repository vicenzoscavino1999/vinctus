import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'phase6', 'baseline');
const COVERAGE_SUMMARY = path.join(ROOT, 'coverage', 'coverage-summary.json');

const run = (cmd, args, { cwd = ROOT } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });

const safeReadJson = async (filePath) => {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
};

const formatPct = (value) => `${Number(value).toFixed(2)}%`;

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log('Phase 6 baseline: running API inventory...');
  await run(npmCmd, ['run', 'phase6:inventory']);

  console.log('Phase 6 baseline: running unit test coverage...');
  await run(npmCmd, ['run', 'test:coverage']);

  if (!(await fs.stat(COVERAGE_SUMMARY).catch(() => null))) {
    throw new Error(`Missing coverage summary: ${path.relative(ROOT, COVERAGE_SUMMARY)}`);
  }

  const summary = await safeReadJson(COVERAGE_SUMMARY);
  const totals = summary.total || summary.totals || null;
  if (!totals) {
    throw new Error('Coverage summary missing totals');
  }

  const testCoverage = {
    capturedAt: new Date().toISOString(),
    statements: totals.statements?.pct ?? null,
    branches: totals.branches?.pct ?? null,
    functions: totals.functions?.pct ?? null,
    lines: totals.lines?.pct ?? null,
  };

  await fs.writeFile(
    path.join(OUT_DIR, 'test-coverage.json'),
    `${JSON.stringify(testCoverage, null, 2)}\n`,
    'utf8',
  );

  await fs.writeFile(
    path.join(OUT_DIR, 'test-coverage.txt'),
    [
      `capturedAt: ${testCoverage.capturedAt}`,
      `statements: ${formatPct(testCoverage.statements)}`,
      `branches: ${formatPct(testCoverage.branches)}`,
      `functions: ${formatPct(testCoverage.functions)}`,
      `lines: ${formatPct(testCoverage.lines)}`,
      '',
    ].join('\n'),
    'utf8',
  );

  console.log('Phase 6 baseline: running type coverage...');
  const typeCoverageRun = await run(npxCmd, [
    'type-coverage',
    '--detail',
    '--strict',
    '--tsconfig',
    'tsconfig.json',
  ]);

  await fs.writeFile(path.join(OUT_DIR, 'type-coverage.txt'), typeCoverageRun.stdout, 'utf8');

  console.log(`Phase 6 baseline saved to ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((error) => {
  console.error('Phase 6 baseline failed:', error);
  process.exit(1);
});

