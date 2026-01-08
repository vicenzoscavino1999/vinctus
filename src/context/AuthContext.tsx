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
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    updateProfile,
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
    signInWithEmail: (email: string, password: string) => Promise<void>;
    signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
    signOut: () => Promise<void>;
    clearError: () => void;
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

// Helper to translate Firebase error codes to Spanish
const translateError = (code: string): string => {
    const errors: Record<string, string> = {
        'auth/email-already-in-use': 'Este correo ya est\u00E1 registrado',
        'auth/invalid-email': 'Correo electr\u00F3nico inv\u00E1lido',
        'auth/operation-not-allowed': 'Operaci\u00F3n no permitida',
        'auth/weak-password': 'La contrase\u00F1a debe tener al menos 6 caracteres',
        'auth/user-disabled': 'Esta cuenta ha sido deshabilitada',
        'auth/user-not-found': 'No existe una cuenta con este correo',
        'auth/wrong-password': 'Contrase\u00F1a incorrecta',
        'auth/invalid-credential': 'Credenciales inv\u00E1lidas',
        'auth/too-many-requests': 'Demasiados intentos. Intenta m\u00E1s tarde',
        'auth/popup-closed-by-user': 'Ventana cerrada antes de completar',
    };
    return errors[code] || 'Error de autenticaci\u00F3n';
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

    // Clear error
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    // Sign in with Google
    const signInWithGoogle = useCallback(async () => {
        setError(null);
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (err) {
            const code = (err as { code?: string }).code || '';
            setError(translateError(code));
            throw err;
        }
    }, []);

    // Sign in with email/password
    const signInWithEmail = useCallback(async (email: string, password: string) => {
        setError(null);
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            const code = (err as { code?: string }).code || '';
            setError(translateError(code));
            throw err;
        }
    }, []);

    // Sign up with email/password
    const signUpWithEmail = useCallback(async (email: string, password: string, displayName?: string) => {
        setError(null);
        try {
            const result = await createUserWithEmailAndPassword(auth, email, password);
            // Update display name if provided
            if (displayName && result.user) {
                await updateProfile(result.user, { displayName });
                // Re-fetch user to get updated profile
                setUser(mapUser(result.user));
            }
        } catch (err) {
            const code = (err as { code?: string }).code || '';
            setError(translateError(code));
            throw err;
        }
    }, []);

    // Sign out
    const signOut = useCallback(async () => {
        setError(null);
        try {
            await firebaseSignOut(auth);
        } catch (err) {
            const code = (err as { code?: string }).code || '';
            setError(translateError(code));
            throw err;
        }
    }, []);

    // Memoize context value
    const value = useMemo<AuthContextType>(() => ({
        user,
        loading,
        error,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        clearError,
    }), [user, loading, error, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut, clearError]);

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
