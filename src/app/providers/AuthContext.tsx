import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPhoneNumber,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  RecaptchaVerifier,
  type User,
  type ConfirmationResult,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from '@/shared/lib/firebase';
import { trackAppCall, trackFirestoreRead, trackFirestoreWrite } from '@/shared/lib/devMetrics';

// Types
interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  emailVerified: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  phoneCodeSent: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
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
    emailVerified: firebaseUser.emailVerified,
  };
};

const ensureUserProfile = async (firebaseUser: User): Promise<void> => {
  try {
    const userRef = doc(db, 'users', firebaseUser.uid);
    trackFirestoreRead('auth.ensureUserProfile.getUser');
    const snapshot = await getDoc(userRef);

    const displayName = firebaseUser.displayName ?? null;
    const displayNameLowercase = displayName ? displayName.toLowerCase() : null;
    const photoURL = firebaseUser.photoURL ?? null;
    const email = firebaseUser.email ?? null;
    const phoneNumber = firebaseUser.phoneNumber ?? null;
    const defaultPrivacy = {
      accountVisibility: 'public' as 'public' | 'private',
      allowDirectMessages: true,
      showOnlineStatus: true,
      showLastActive: true,
      allowFriendRequests: true,
      blockedUsers: [],
    };
    const defaultNotifications = {
      pushEnabled: true,
      emailEnabled: true,
      mentionsOnly: false,
      weeklyDigest: false,
      productUpdates: true,
    };

    let accountVisibility: 'public' | 'private' = 'public';

    const isNewUser = !snapshot.exists();

    if (isNewUser) {
      trackFirestoreWrite('auth.ensureUserProfile.createUser');
      await setDoc(userRef, {
        uid: firebaseUser.uid,
        displayName,
        displayNameLowercase,
        email,
        photoURL,
        phoneNumber,
        reputation: 0,
        karmaGlobal: 0,
        karmaByInterest: {},
        settings: {
          privacy: defaultPrivacy,
          notifications: defaultNotifications,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      accountVisibility = defaultPrivacy.accountVisibility;
    } else {
      const data = snapshot.data() as {
        displayName?: string | null;
        displayNameLowercase?: string | null;
        photoURL?: string | null;
        email?: string | null;
        phoneNumber?: string | null;
        settings?: {
          privacy?: { accountVisibility?: string };
          notifications?: Record<string, unknown>;
        };
      };
      const updates: Record<string, unknown> = {};

      if (data.displayName !== displayName) {
        updates.displayName = displayName;
      }

      if (data.displayNameLowercase !== displayNameLowercase) {
        updates.displayNameLowercase = displayNameLowercase;
      }

      if (data.photoURL !== photoURL) {
        updates.photoURL = photoURL;
      }

      if (data.email !== email) {
        updates.email = email;
      }

      if (data.phoneNumber !== phoneNumber) {
        updates.phoneNumber = phoneNumber;
      }

      if (
        data.settings?.privacy?.accountVisibility !== 'public' &&
        data.settings?.privacy?.accountVisibility !== 'private'
      ) {
        updates['settings.privacy'] = defaultPrivacy;
      } else if (!data.settings?.notifications) {
        updates['settings.notifications'] = defaultNotifications;
      }

      accountVisibility =
        data.settings?.privacy?.accountVisibility === 'private' ? 'private' : 'public';

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        trackFirestoreWrite('auth.ensureUserProfile.updateUser');
        await setDoc(userRef, updates, { merge: true });
      }
    }

    const publicPayload: Record<string, unknown> = {
      uid: firebaseUser.uid,
      displayName,
      displayNameLowercase,
      photoURL,
      accountVisibility,
      updatedAt: serverTimestamp(),
    };

    if (isNewUser) {
      publicPayload.reputation = 0;
      publicPayload.karmaGlobal = 0;
      publicPayload.karmaByInterest = {};
    }

    trackFirestoreWrite('auth.ensureUserProfile.upsertUserPublic');
    await setDoc(doc(db, 'users_public', firebaseUser.uid), publicPayload, { merge: true });
  } catch (error) {
    console.error('Error ensuring user profile:', error);
  }
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
      if (firebaseUser) {
        void ensureUserProfile(firebaseUser);
      }
    });

    return () => unsubscribe();
  }, []);

  // Handle redirect result (for mobile/PWA Google sign-in)
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          await ensureUserProfile(result.user);
        }
      } catch (err) {
        const code = (err as { code?: string }).code || '';
        setError(translateError(code));
      }
    };
    void handleRedirectResult();
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
  // Strategy: Try popup first (works on most browsers including Safari)
  // If popup is blocked or fails, fall back to redirect
  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      trackAppCall('auth.signInWithGoogle');
      // Try popup first - works better on Safari/iOS than redirect
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const error = err as { code?: string };

      // If popup was blocked or closed, try redirect as fallback
      if (
        error.code === 'auth/popup-blocked' ||
        error.code === 'auth/popup-closed-by-user' ||
        error.code === 'auth/cancelled-popup-request'
      ) {
        try {
          trackAppCall('auth.signInWithGoogle.redirectFallback');
          // Fallback to redirect
          await signInWithRedirect(auth, googleProvider);
          return; // Redirect will handle the rest
        } catch (redirectErr) {
          const redirectCode = (redirectErr as { code?: string }).code || '';
          setError(translateError(redirectCode));
          throw redirectErr;
        }
      }

      // For other errors, show the error message
      setError(translateError(error.code || ''));
      throw err;
    }
  }, []);

  // Sign in with email/password
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      trackAppCall('auth.signInWithEmail');
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const code = (err as { code?: string }).code || '';
      setError(translateError(code));
      throw err;
    }
  }, []);

  // Sign up with email/password
  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName?: string) => {
      setError(null);
      try {
        trackAppCall('auth.signUpWithEmail');
        const result = await createUserWithEmailAndPassword(auth, email, password);
        // Update display name if provided
        if (displayName && result.user) {
          await updateProfile(result.user, { displayName });
        }
        // Send email verification
        if (result.user) {
          await sendEmailVerification(result.user);
        }
        if (result.user) {
          await ensureUserProfile(result.user);
          setUser(mapUser(result.user));
        }
      } catch (err) {
        const code = (err as { code?: string }).code || '';
        setError(translateError(code));
        throw err;
      }
    },
    [],
  );

  // Reset password
  const resetPassword = useCallback(async (email: string) => {
    setError(null);
    try {
      trackAppCall('auth.resetPassword');
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      const code = (err as { code?: string }).code || '';
      setError(translateError(code));
      throw err;
    }
  }, []);

  // Send phone verification code
  const sendPhoneCode = useCallback(
    async (phoneNumber: string, recaptchaContainerId: string) => {
      setError(null);
      try {
        trackAppCall('auth.sendPhoneCode');
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
        const confirmationResult = await signInWithPhoneNumber(
          auth,
          phoneNumber,
          recaptchaVerifierRef.current,
        );
        confirmationResultRef.current = confirmationResult;
        setPhoneCodeSent(true);
      } catch (err) {
        const code = (err as { code?: string }).code || '';
        setError(translateError(code));
        resetPhoneAuth();
        throw err;
      }
    },
    [resetPhoneAuth],
  );

  // Verify phone code
  const verifyPhoneCode = useCallback(
    async (code: string) => {
      setError(null);
      if (!confirmationResultRef.current) {
        setError('Primero solicita un código de verificación');
        return;
      }
      try {
        trackAppCall('auth.verifyPhoneCode');
        await confirmationResultRef.current.confirm(code);
        resetPhoneAuth();
      } catch (err) {
        const code = (err as { code?: string }).code || '';
        setError(translateError(code));
        throw err;
      }
    },
    [resetPhoneAuth],
  );

  // Sign out
  const signOut = useCallback(async () => {
    setError(null);
    try {
      trackAppCall('auth.signOut');
      await firebaseSignOut(auth);
      resetPhoneAuth();
    } catch (err) {
      const code = (err as { code?: string }).code || '';
      setError(translateError(code));
      throw err;
    }
  }, [resetPhoneAuth]);

  // Memoize context value
  const value = useMemo<AuthContextType>(
    () => ({
      user,
      loading,
      error,
      phoneCodeSent,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      resetPassword,
      sendPhoneCode,
      verifyPhoneCode,
      signOut,
      clearError,
      resetPhoneAuth,
    }),
    [
      user,
      loading,
      error,
      phoneCodeSent,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      resetPassword,
      sendPhoneCode,
      verifyPhoneCode,
      signOut,
      clearError,
      resetPhoneAuth,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
