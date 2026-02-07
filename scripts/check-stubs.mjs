import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.d.ts']);
const STUB_DATE_REGEX = /TODO:\s*STUB REMOVE BY:\s*(\d{4}-\d{2}-\d{2})/g;
const TICKET_REGEX = /Ticket:\s*([A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)*)/;
const LOOKAHEAD_LINES = 5;
const FORBIDDEN_LEGACY_FILES = [
  'src/context/AuthContext.tsx',
  'src/context/AppState.tsx',
  'src/shared/lib/firestore.legacy.ts',
];

function isSourceFile(filePath) {
  if (filePath.endsWith('.d.ts')) return true;
  return SOURCE_EXTENSIONS.has(path.extname(filePath));
}

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.name !== 'node_modules')
      .map(async (entry) => {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return collectFiles(entryPath);
        }
        return isSourceFile(entryPath) ? [entryPath] : [];
      }),
  );

  return nested.flat();
}

function normalizeDate(dateString) {
  const parsed = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10) === dateString ? parsed : null;
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function extractNearbyTicket(lines, lineNumber) {
  const start = lineNumber - 1;
  const end = Math.min(lines.length, start + LOOKAHEAD_LINES);
  for (let i = start; i < end; i += 1) {
    const match = lines[i].match(TICKET_REGEX);
    if (match) return match[1];
  }
  return null;
}

async function main() {
  const files = await collectFiles(ROOT);
  const errors = [];
  const today = todayUtc();

  for (const legacyFile of FORBIDDEN_LEGACY_FILES) {
    const absolutePath = path.resolve(process.cwd(), legacyFile);
    const exists = await fs
      .access(absolutePath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      errors.push(`${legacyFile} forbidden legacy file exists`);
    }
  }

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    STUB_DATE_REGEX.lastIndex = 0;
    let match = STUB_DATE_REGEX.exec(raw);

    while (match) {
      const [fullMatch, dateString] = match;
      const before = raw.slice(0, match.index);
      const lineNumber = before.split(/\r?\n/).length;
      const parsedDate = normalizeDate(dateString);

      if (!parsedDate) {
        errors.push(
          `${path.relative(process.cwd(), filePath)}:${lineNumber} invalid date in "${fullMatch}"`,
        );
      } else if (parsedDate < today) {
        errors.push(
          `${path.relative(process.cwd(), filePath)}:${lineNumber} expired stub (REMOVE BY ${dateString})`,
        );
      }

      const ticket = extractNearbyTicket(lines, lineNumber);
      if (!ticket) {
        errors.push(
          `${path.relative(process.cwd(), filePath)}:${lineNumber} missing "Ticket: <ID>" near stub marker`,
        );
      }

      match = STUB_DATE_REGEX.exec(raw);
    }
  }

  if (errors.length > 0) {
    console.error('Stub guardrail check failed:');
    errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log('Stub guardrail check passed.');
}

main().catch((error) => {
  console.error('Stub guardrail check crashed:', error);
  process.exit(1);
});
