// Firebase Authentication Context for Vinctus
// Provides user state and sign-in/sign-out functions

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useMemo,
    useRef,
    type ReactNode
} from 'react';
import {
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPhoneNumber,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    updateProfile,
    RecaptchaVerifier,
    type User,
    type ConfirmationResult
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

// Types
interface AuthUser {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    phoneNumber: string | null;
}

interface AuthContextType {
    user: AuthUser | null;
    loading: boolean;
    error: string | null;
    phoneCodeSent: boolean;
    signInWithGoogle: () => Promise<void>;
    signInWithEmail: (email: string, password: string) => Promise<void>;
    signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
    sendPhoneCode: (phoneNumber: string, recaptchaContainerId: string) => Promise<void>;
    verifyPhoneCode: (code: string) => Promise<void>;
    signOut: () => Promise<void>;
    clearError: () => void;
    resetPhoneAuth: () => void;
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
        phoneNumber: firebaseUser.phoneNumber,
    };
};

// Helper to translate Firebase error codes to Spanish
const translateError = (code: string): string => {
    const errors: Record<string, string> = {
        'auth/email-already-in-use': 'Este correo ya está registrado',
        'auth/invalid-email': 'Correo electrónico inválido',
        'auth/operation-not-allowed': 'Operación no permitida',
        'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
        'auth/user-disabled': 'Esta cuenta ha sido deshabilitada',
        'auth/user-not-found': 'No existe una cuenta con este correo',
        'auth/wrong-password': 'Contraseña incorrecta',
        'auth/invalid-credential': 'Credenciales inválidas',
        'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde',
        'auth/popup-closed-by-user': 'Ventana cerrada antes de completar',
        'auth/invalid-phone-number': 'Número de teléfono inválido',
        'auth/missing-phone-number': 'Ingresa un número de teléfono',
        'auth/quota-exceeded': 'Límite de SMS excedido. Intenta más tarde',
        'auth/invalid-verification-code': 'Código de verificación incorrecto',
        'auth/code-expired': 'El código ha expirado. Solicita uno nuevo',
    };
    return errors[code] || 'Error de autenticación';
};

interface AuthProviderProps {
    children: ReactNode;
}

// Provider component
export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [phoneCodeSent, setPhoneCodeSent] = useState(false);

    // Store confirmation result for phone auth
    const confirmationResultRef = useRef<ConfirmationResult | null>(null);
    const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

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

    // Reset phone auth state
    const resetPhoneAuth = useCallback(() => {
        setPhoneCodeSent(false);
        confirmationResultRef.current = null;
        if (recaptchaVerifierRef.current) {
            recaptchaVerifierRef.current.clear();
            recaptchaVerifierRef.current = null;
        }
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

    // Send phone verification code
    const sendPhoneCode = useCallback(async (phoneNumber: string, recaptchaContainerId: string) => {
        setError(null);
        try {
            // Clean up previous verifier if exists
            if (recaptchaVerifierRef.current) {
                recaptchaVerifierRef.current.clear();
            }

            // Create new reCAPTCHA verifier
            recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaContainerId, {
                size: 'invisible',
                callback: () => {
                    // reCAPTCHA solved
                },
            });

            // Send SMS
            const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifierRef.current);
            confirmationResultRef.current = confirmationResult;
            setPhoneCodeSent(true);
        } catch (err) {
            const code = (err as { code?: string }).code || '';
            setError(translateError(code));
            resetPhoneAuth();
            throw err;
        }
    }, [resetPhoneAuth]);

    // Verify phone code
    const verifyPhoneCode = useCallback(async (code: string) => {
        setError(null);
        if (!confirmationResultRef.current) {
            setError('Primero solicita un código de verificación');
            return;
        }
        try {
            await confirmationResultRef.current.confirm(code);
            resetPhoneAuth();
        } catch (err) {
            const code = (err as { code?: string }).code || '';
            setError(translateError(code));
            throw err;
        }
    }, [resetPhoneAuth]);

    // Sign out
    const signOut = useCallback(async () => {
        setError(null);
        try {
            await firebaseSignOut(auth);
            resetPhoneAuth();
        } catch (err) {
            const code = (err as { code?: string }).code || '';
            setError(translateError(code));
            throw err;
        }
    }, [resetPhoneAuth]);

    // Memoize context value
    const value = useMemo<AuthContextType>(() => ({
        user,
        loading,
        error,
        phoneCodeSent,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPhoneCode,
        verifyPhoneCode,
        signOut,
        clearError,
        resetPhoneAuth,
    }), [user, loading, error, phoneCodeSent, signInWithGoogle, signInWithEmail, signUpWithEmail, sendPhoneCode, verifyPhoneCode, signOut, clearError, resetPhoneAuth]);

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
