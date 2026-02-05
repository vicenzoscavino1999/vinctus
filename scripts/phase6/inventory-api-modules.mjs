import { promises as fs } from 'node:fs';
import path from 'node:path';

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.d.ts']);

function parseArgs(argv) {
  const args = { out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      args.out = argv[i + 1] || null;
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
}

function isSourceFile(filePath) {
  if (filePath.endsWith('.d.ts')) return true;
  const ext = path.extname(filePath);
  return SOURCE_EXTENSIONS.has(ext);
}

function isTestFile(filePath) {
  return /\.(test|spec)\.[^.]+$/.test(filePath);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(entryPath);
      }
      if (!entry.isFile()) return [];
      if (!isSourceFile(entryPath)) return [];
      if (isTestFile(entryPath)) return [];
      return [entryPath];
    }),
  );

  return nested.flat();
}

async function collectApiInventory() {
  const root = process.cwd();
  const featuresRoot = path.join(root, 'src', 'features');

  if (!(await fileExists(featuresRoot))) {
    throw new Error(`Missing features root: ${path.relative(root, featuresRoot)}`);
  }

  const featureEntries = await fs.readdir(featuresRoot, { withFileTypes: true });
  const modules = [];

  for (const entry of featureEntries) {
    if (!entry.isDirectory()) continue;

    const moduleName = entry.name;
    const apiDir = path.join(featuresRoot, moduleName, 'api');

    if (!(await fileExists(apiDir))) continue;

    const files = await collectFiles(apiDir);
    const relFiles = files.map((filePath) => path.relative(root, filePath)).sort();

    modules.push({
      module: moduleName,
      apiDir: path.relative(root, apiDir),
      count: relFiles.length,
      files: relFiles,
    });
  }

  modules.sort((a, b) => b.count - a.count || a.module.localeCompare(b.module));

  return {
    generatedAt: new Date().toISOString(),
    totalModulesWithApi: modules.length,
    totalApiFiles: modules.reduce((sum, m) => sum + m.count, 0),
    modules,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log('Usage: node scripts/phase6/inventory-api-modules.mjs [--out <path>]');
    process.exit(0);
  }

  const inventory = await collectApiInventory();
  const json = JSON.stringify(inventory, null, 2);

  if (args.out) {
    const outPath = path.resolve(process.cwd(), args.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, json, 'utf8');
  } else {
    process.stdout.write(`${json}\n`);
  }
}

main().catch((error) => {
  console.error('API inventory failed:', error);
  process.exit(1);
});

