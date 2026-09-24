// Modular entry points on purpose: the repo is "type": "module", and under ESM
// `import * as admin from 'firebase-admin'` only exposes `default`, so admin.apps,
// admin.credential and admin.initializeApp were undefined at runtime.
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth as getAdminAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let cached: { db: Firestore; auth: Auth } | null = null;

function getServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
  }

  const trimmed = raw.trim();
  let parsed: Record<string, unknown> | string;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
  }

  if (typeof parsed === 'string') {
    parsed = JSON.parse(parsed) as Record<string, unknown>;
  }

  const serviceAccount = parsed as Record<string, unknown>;
  const privateKey = serviceAccount['private_key'];
  if (typeof privateKey === 'string') {
    serviceAccount['private_key'] = privateKey.replace(/\\n/g, '\n');
  }

  return serviceAccount as ServiceAccount;
}

function initAdmin() {
  const app = getApps()[0] ?? initializeApp({ credential: cert(getServiceAccount()) });
  return {
    db: getFirestore(app),
    auth: getAdminAuth(app),
  };
}

export function getAdmin() {
  if (!cached) {
    cached = initAdmin();
  }
  return cached;
}

export function getDb() {
  return getAdmin().db;
}

export function getAuth() {
  return getAdmin().auth;
}
