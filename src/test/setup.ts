import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Firebase to avoid needing real credentials in tests
vi.mock('@/shared/lib/firebase', () => ({
  auth: {},
  db: {},
  googleProvider: {},
  default: {},
}));

// Mock Firebase Auth functions
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn((_auth, callback) => {
    // Immediately call with null user for tests
    callback(null);
    return () => {}; // unsubscribe function
  }),
  GoogleAuthProvider: vi.fn(),
}));

// Mock Firestore
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: vi.fn((_ref, callback) => {
    callback({ docs: [] });
    return () => {};
  }),
  serverTimestamp: vi.fn(() => new Date()),
  query: vi.fn((...args) => args[0]),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  runTransaction: vi.fn(async (_db, callback) => {
    const mockTx = {
      get: vi.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
      set: vi.fn(),
      delete: vi.fn(),
    };
    return callback(mockTx);
  }),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  })),
}));
