import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { auditPostEngagement } from '../functions/lib/postEngagementAudit.js';

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { deleteApp, initializeApp } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const flag = process.argv[i];
  if (!['--project', '--uid', '--max-posts', '--output'].includes(flag) || !process.argv[i + 1]) {
    throw new Error(
      'Usage: node scripts/audit-post-engagement.mjs --project PROJECT --uid UID [--max-posts 100] [--output report.json]',
    );
  }
  args.set(flag, process.argv[i + 1]);
}
const projectId = args.get('--project');
const uid = args.get('--uid');
if (!projectId || !uid)
  throw new Error('Explicit --project and --uid are required; environment defaults are not used.');
const maxPosts = Number(args.get('--max-posts') ?? 100);
const app = initializeApp({ projectId }, 'post-engagement-audit');
try {
  const report = await auditPostEngagement(getFirestore(app), uid, maxPosts);
  const output = `${JSON.stringify({ projectId, firestoreEmulatorHost: process.env.FIRESTORE_EMULATOR_HOST ?? null, ...report }, null, 2)}\n`;
  if (args.has('--output')) {
    // Do not replace an existing report or create an output inside the repository implicitly.
    await writeFile(args.get('--output'), output, { flag: 'wx' });
    console.log(`Audit saved to ${args.get('--output')}; no database writes.`);
  } else console.log(output);
} finally {
  await deleteApp(app);
}
