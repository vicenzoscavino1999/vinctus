// Firebase Authentication Context for Vinctus
// Provides user state and sign-in/sign-out functions

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useMemo,
    type ReactNode
} from 'react';
import {
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    type User
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

// Types
interface AuthUser {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
}

interface AuthContextType {
    user: AuthUser | null;
    loading: boolean;
    error: string | null;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

// Create context
const AuthContext = createContext<AuthContextType | null>(null);

// Helper to convert Firebase User to AuthUser
const mapUser = (firebaseUser: User | null): AuthUser | null => {
    if (!firebaseUser) return null;
    return {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
    };
};

interface AuthProviderProps {
    children: ReactNode;
}

// Provider component
export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Listen to auth state changes
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(mapUser(firebaseUser));
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Sign in with Google
    const signInWithGoogle = useCallback(async () => {
        setError(null);
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error al iniciar sesi\u00F3n';
            setError(message);
            throw err;
        }
    }, []);

    // Sign out
    const signOut = useCallback(async () => {
        setError(null);
        try {
            await firebaseSignOut(auth);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error al cerrar sesi\u00F3n';
            setError(message);
            throw err;
        }
    }, []);

    // Memoize context value
    const value = useMemo<AuthContextType>(() => ({
        user,
        loading,
        error,
        signInWithGoogle,
        signOut,
    }), [user, loading, error, signInWithGoogle, signOut]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// Custom hook
export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export default AuthContext;
