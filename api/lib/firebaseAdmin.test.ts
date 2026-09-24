import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const MODULE_URL = new URL('./firebaseAdmin.ts', import.meta.url).href;

// Runs the module in plain Node ESM, like the Vercel runtime. Vitest's CJS interop would hide
// import bugs such as `import * as admin from 'firebase-admin'` exposing only `default`.
function initInPlainNode(serviceAccountJson: string): unknown {
  const script = `
    const { getAuth, getDb } = await import(process.argv[1]);
    console.log(JSON.stringify({
      doc: typeof getDb().doc,
      verifyIdToken: typeof getAuth().verifyIdToken,
    }));
  `;
  const output = execFileSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--no-warnings',
      '--input-type=module',
      '-e',
      script,
      MODULE_URL,
    ],
    { encoding: 'utf8', env: { ...process.env, FIREBASE_SERVICE_ACCOUNT: serviceAccountJson } },
  );
  return JSON.parse(output.trim().split('\n').pop() ?? 'null');
}

describe('api/lib/firebaseAdmin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('reports a missing FIREBASE_SERVICE_ACCOUNT', async () => {
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '');
    const { getDb } = await import('./firebaseAdmin.js');

    expect(() => getDb()).toThrow('FIREBASE_SERVICE_ACCOUNT not configured');
  });

  it('initializes Firestore and Auth from the service account JSON under plain Node ESM', () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
      publicKeyEncoding: { format: 'pem', type: 'spki' },
    });
    const serviceAccountJson = JSON.stringify({
      client_email: 'admin@demo-vinctus.iam.gserviceaccount.com',
      private_key: privateKey,
      project_id: 'demo-vinctus',
      type: 'service_account',
    });

    expect(initInPlainNode(serviceAccountJson)).toEqual({
      doc: 'function',
      verifyIdToken: 'function',
    });
  });
});
