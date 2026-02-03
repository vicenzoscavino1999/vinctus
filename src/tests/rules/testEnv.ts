import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let cachedEnv: RulesTestEnvironment | null = null;

function parseHostPort(
  value: string | undefined,
  fallbackPort: number,
): { host: string; port: number } {
  if (!value) return { host: '127.0.0.1', port: fallbackPort };
  const [host, rawPort] = value.split(':');
  const parsed = Number(rawPort);
  return {
    host: host || '127.0.0.1',
    port: Number.isFinite(parsed) ? parsed : fallbackPort,
  };
}

function projectId(): string {
  return process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'vinctus-dev';
}

export async function getRulesTestEnv(): Promise<RulesTestEnvironment> {
  if (cachedEnv) return cachedEnv;

  const firestore = parseHostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080);
  const storage = parseHostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199);

  cachedEnv = await initializeTestEnvironment({
    projectId: projectId(),
    firestore: {
      ...firestore,
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
    },
    storage: {
      ...storage,
      rules: readFileSync(resolve(process.cwd(), 'storage.rules'), 'utf8'),
    },
  });

  return cachedEnv;
}

export async function clearRulesTestData(): Promise<void> {
  const env = await getRulesTestEnv();
  await env.clearFirestore();
  await env.clearStorage();
}

export async function cleanupRulesTestEnv(): Promise<void> {
  if (!cachedEnv) return;
  await cachedEnv.cleanup();
  cachedEnv = null;
}
