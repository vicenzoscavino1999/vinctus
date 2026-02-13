// Firebase configuration for Vinctus
// Credentials loaded from environment variables (.env.local)

import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider, OAuthProvider, connectAuthEmulator } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
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

const APP_CHECK_ENABLED = import.meta.env.VITE_ENABLE_FIREBASE_APP_CHECK === 'true';
const APP_CHECK_SITE_KEY = (import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY ?? '').trim();
const APP_CHECK_DEBUG_TOKEN = (import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN ?? '').trim();
const APP_CHECK_AUTO_REFRESH =
  import.meta.env.VITE_FIREBASE_APP_CHECK_TOKEN_AUTO_REFRESH !== 'false';

const setupAppCheck = (): AppCheck | null => {
  if (typeof window === 'undefined' || !APP_CHECK_ENABLED) {
    return null;
  }

  if (!APP_CHECK_SITE_KEY) {
    console.warn('[firebase] App Check enabled but VITE_FIREBASE_APP_CHECK_SITE_KEY is missing');
    return null;
  }

  if (APP_CHECK_DEBUG_TOKEN) {
    const globalState = globalThis as Record<string, unknown>;
    globalState.FIREBASE_APPCHECK_DEBUG_TOKEN =
      APP_CHECK_DEBUG_TOKEN === 'true' ? true : APP_CHECK_DEBUG_TOKEN;
  }

  try {
    return initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: APP_CHECK_AUTO_REFRESH,
    });
  } catch (error) {
    console.warn('[firebase] App Check initialization failed', error);
    return null;
  }
};

// App Check is optional and controlled by environment flags.
export const appCheck = setupAppCheck();

// Auth instance
export const auth = getAuth(app);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();

// Apple Auth Provider (required on iOS when offering social sign-in)
export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

const createFirestore = () => {
  const baseConfig = {
    experimentalForceLongPolling: true,
  } as const;

  const persistenceDisabled =
    import.meta.env.MODE === 'test' || import.meta.env.VITE_FIRESTORE_PERSISTENCE === 'false';

  if (persistenceDisabled || typeof window === 'undefined') {
    return initializeFirestore(app, {
      ...baseConfig,
      localCache: memoryLocalCache(),
    });
  }

  try {
    return initializeFirestore(app, {
      ...baseConfig,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (error) {
    console.warn('[firebase] persistent cache unavailable, falling back to memory cache', error);
    return initializeFirestore(app, {
      ...baseConfig,
      localCache: memoryLocalCache(),
    });
  }
};

// Firestore instance (long-polling + IndexedDB cache when available)
export const db = createFirestore();

// Firestore Lite instance (REST) for operations sensitive to WebChannel blocks
export const dbLite = getFirestoreLite(app);

// Functions instance
export const functions = getFunctions(app);

// Storage instance
export const storage = getStorage(app);

// Emulator wiring: enabled explicitly by env flag (also used by CI/LHCI workflows).
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
