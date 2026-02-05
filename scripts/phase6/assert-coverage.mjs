import path from 'node:path';
import process from 'node:process';
import { promises as fs } from 'node:fs';

const args = process.argv.slice(2);
const options = {
  summary: path.join(process.cwd(), 'coverage', 'emulators', 'coverage-summary.json'),
  statements: 85,
  branches: 80,
  functions: 85,
  lines: 85,
};

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (!arg.startsWith('--')) {
    continue;
  }

  const key = arg.slice(2);
  const next = args[index + 1];
  if (next == null || next.startsWith('--')) {
    continue;
  }

  if (key === 'summary') {
    options.summary = path.resolve(process.cwd(), next);
  } else if (key in options) {
    const parsed = Number(next);
    if (!Number.isNaN(parsed)) {
      options[key] = parsed;
    }
  }

  index += 1;
}

const toFixed = (value) => Number(value).toFixed(2);

const summaryRaw = await fs.readFile(options.summary, 'utf8');
const summary = JSON.parse(summaryRaw);
const total = summary.total ?? summary.totals;

if (!total) {
  throw new Error(`Coverage summary has no total section: ${options.summary}`);
}

const metrics = {
  statements: Number(total.statements?.pct ?? 0),
  branches: Number(total.branches?.pct ?? 0),
  functions: Number(total.functions?.pct ?? 0),
  lines: Number(total.lines?.pct ?? 0),
};

const failures = Object.entries(metrics).filter(([metric, value]) => value < options[metric]);

console.log(`Coverage summary: ${path.relative(process.cwd(), options.summary)}`);
console.log(
  `Current => statements ${toFixed(metrics.statements)} | branches ${toFixed(metrics.branches)} | functions ${toFixed(metrics.functions)} | lines ${toFixed(metrics.lines)}`,
);
console.log(
  `Target  => statements ${toFixed(options.statements)} | branches ${toFixed(options.branches)} | functions ${toFixed(options.functions)} | lines ${toFixed(options.lines)}`,
);

if (failures.length > 0) {
  const reasons = failures
    .map(([metric, value]) => `${metric} ${toFixed(value)} < ${toFixed(options[metric])}`)
    .join(', ');
  throw new Error(`Coverage gate failed: ${reasons}`);
}

console.log('Coverage gate passed.');
