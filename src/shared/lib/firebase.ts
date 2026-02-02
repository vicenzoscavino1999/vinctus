// Firebase configuration for Vinctus
// Credentials loaded from environment variables (.env.local)

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFirestore as getFirestoreLite } from 'firebase/firestore/lite';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Auth instance
export const auth = getAuth(app);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();

// Firestore instance (force long-polling to reduce WebChannel blocks)
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

// Firestore Lite instance (REST) for operations sensitive to WebChannel blocks
export const dbLite = getFirestoreLite(app);

// Functions instance
export const functions = getFunctions(app);

// Storage instance
export const storage = getStorage(app);

// Emulator wiring (local dev)
const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';
const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
const emulatorPorts = {
  auth: 9099,
  firestore: 8080,
  functions: 5001,
  storage: 9199,
};

if (useEmulators) {
  const globalKey = '__VINCTUS_EMULATORS_CONNECTED__';
  const globalState = globalThis as Record<string, unknown>;
  if (!globalState[globalKey]) {
    connectAuthEmulator(auth, `http://${emulatorHost}:${emulatorPorts.auth}`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, emulatorHost, emulatorPorts.firestore);
    connectFunctionsEmulator(functions, emulatorHost, emulatorPorts.functions);
    connectStorageEmulator(storage, emulatorHost, emulatorPorts.storage);
    globalState[globalKey] = true;
  }
}

export default app;
