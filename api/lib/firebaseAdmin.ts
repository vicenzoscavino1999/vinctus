import * as admin from 'firebase-admin';

let cached: { db: FirebaseFirestore.Firestore; auth: admin.auth.Auth } | null = null;

function getServiceAccount() {
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

  return serviceAccount as admin.ServiceAccount;
}

function initAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(getServiceAccount()),
    });
  }
  return {
    db: admin.firestore(),
    auth: admin.auth(),
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

export { admin };
