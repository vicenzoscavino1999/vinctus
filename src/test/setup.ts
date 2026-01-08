import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Firebase to avoid needing real credentials in tests
vi.mock('../lib/firebase', () => ({
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
    onAuthStateChanged: vi.fn((auth, callback) => {
        // Immediately call with null user for tests
        callback(null);
        return () => { }; // unsubscribe function
    }),
    GoogleAuthProvider: vi.fn(),
}));

// Mock Firestore
vi.mock('firebase/firestore', () => ({
    getFirestore: vi.fn(() => ({})),
    collection: vi.fn(),
    doc: vi.fn(),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
    deleteDoc: vi.fn(),
    onSnapshot: vi.fn(),
}));
