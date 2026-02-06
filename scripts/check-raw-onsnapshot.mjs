import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const SNAPSHOT_REGEX = /\bonSnapshot\s*\(/;

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath));
}

function isAllowedOnSnapshotFile(relativePath) {
  const posixPath = toPosix(relativePath);

  if (/^src\/features\/[^/]+\/api\/.+\.(ts|tsx)$/.test(posixPath)) {
    return true;
  }

  if (/^src\/.+\.(test|spec)\.(ts|tsx)$/.test(posixPath)) {
    return true;
  }

  return false;
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

async function main() {
  const files = await collectFiles(ROOT);
  const offenders = [];

  for (const absolutePath of files) {
    const relativePath = path.relative(process.cwd(), absolutePath);
    if (isAllowedOnSnapshotFile(relativePath)) {
      continue;
    }

    const contents = await fs.readFile(absolutePath, 'utf8');
    if (!SNAPSHOT_REGEX.test(contents)) {
      continue;
    }

    const lineNumber = contents
      .slice(0, contents.search(SNAPSHOT_REGEX))
      .split(/\r?\n/).length;

    offenders.push(`${toPosix(relativePath)}:${lineNumber}`);
  }

  if (offenders.length > 0) {
    console.error('Raw onSnapshot usage guardrail failed.');
    console.error('Use feature/shared API wrappers that return unsubscribe instead.');
    offenders.forEach((entry) => console.error(`- ${entry}`));
    process.exit(1);
  }

  console.log('Raw onSnapshot guardrail check passed.');
}

main().catch((error) => {
  console.error('Raw onSnapshot guardrail check crashed:', error);
  process.exit(1);
});
