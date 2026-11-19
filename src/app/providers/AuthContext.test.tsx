import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { appleProvider, googleProvider } from '@/shared/lib/firebase';

const REDIRECT_PENDING_KEY = 'vinctus_auth_redirect_pending';

type AuthModule = typeof import('./AuthContext');
let AuthProvider: AuthModule['AuthProvider'];
let useAuth: AuthModule['useAuth'];

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

const authError = (code: string) => Object.assign(new Error(code), { code });

describe('AuthContext social sign-in', () => {
  beforeAll(async () => {
    // Apple sign-in is gated by a module-level env flag, so import after stubbing it
    vi.stubEnv('VITE_ENABLE_APPLE_SIGN_IN', 'true');
    ({ AuthProvider, useAuth } = await import('./AuthContext'));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.mocked(signInWithPopup).mockReset();
    vi.mocked(signInWithRedirect).mockReset();
    vi.mocked(getRedirectResult).mockReset().mockResolvedValue(null);
    window.sessionStorage.clear();
  });

  it.each([
    ['Google', 'signInWithGoogle'],
    ['Apple', 'signInWithApple'],
  ] as const)('does not redirect when the user closes the %s popup', async (_name, method) => {
    vi.mocked(signInWithPopup).mockRejectedValue(authError('auth/popup-closed-by-user'));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current[method]();
    });

    expect(signInWithRedirect).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('does not redirect when a newer popup request cancels the previous one', async () => {
    vi.mocked(signInWithPopup).mockRejectedValue(authError('auth/cancelled-popup-request'));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signInWithGoogle();
    });

    expect(signInWithRedirect).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it.each([
    ['google', 'signInWithGoogle', googleProvider],
    ['apple', 'signInWithApple', appleProvider],
  ] as const)(
    'falls back to redirect when the %s popup is blocked',
    async (provider, method, authProvider) => {
      vi.mocked(signInWithPopup).mockRejectedValue(authError('auth/popup-blocked'));
      vi.mocked(signInWithRedirect).mockResolvedValue(undefined as never);
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current[method]();
      });

      expect(signInWithRedirect).toHaveBeenCalledWith(expect.anything(), authProvider);
      expect(window.sessionStorage.getItem(REDIRECT_PENDING_KEY)).toBe(provider);
    },
  );

  it('shows a specific message for an unauthorized domain on Google sign-in', async () => {
    vi.mocked(signInWithPopup).mockRejectedValue(authError('auth/unauthorized-domain'));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await expect(result.current.signInWithGoogle()).rejects.toMatchObject({
        code: 'auth/unauthorized-domain',
      });
    });

    expect(result.current.error).toBe('Este dominio no esta autorizado para iniciar sesion');
  });

  it('uses Apple error messages for a failed Apple redirect', async () => {
    window.sessionStorage.setItem(REDIRECT_PENDING_KEY, 'apple');
    vi.mocked(getRedirectResult).mockRejectedValue(authError('auth/invalid-credential'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Credencial Apple invalida. Revisa Service ID, Team ID, Key ID y private key en Firebase.',
      ),
    );
    expect(window.sessionStorage.getItem(REDIRECT_PENDING_KEY)).toBeNull();
  });

  it('uses generic error messages for a failed Google redirect', async () => {
    window.sessionStorage.setItem(REDIRECT_PENDING_KEY, 'google');
    vi.mocked(getRedirectResult).mockRejectedValue(authError('auth/invalid-credential'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.error).toBe('Credenciales invalidas'));
  });

  describe('installed PWA', () => {
    const mockStandalone = (standalone: boolean) =>
      vi.spyOn(window, 'matchMedia').mockImplementation(
        (query: string) =>
          ({
            matches: standalone && query === '(display-mode: standalone)',
            media: query,
          }) as MediaQueryList,
      );

    afterEach(() => {
      vi.restoreAllMocks();
      // Keep the Apple flag stub from beforeAll; only the auth domain changes per test
      vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', undefined);
    });

    it.each([
      ['google', 'signInWithGoogle', googleProvider],
      ['apple', 'signInWithApple', appleProvider],
    ] as const)(
      'uses a full-page %s redirect when the auth domain is the app host',
      async (provider, method, authProvider) => {
        mockStandalone(true);
        vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', window.location.host);
        vi.mocked(signInWithRedirect).mockResolvedValue(undefined as never);
        const { result } = renderHook(() => useAuth(), { wrapper });

        await act(async () => {
          await result.current[method]();
        });

        expect(signInWithPopup).not.toHaveBeenCalled();
        expect(signInWithRedirect).toHaveBeenCalledWith(expect.anything(), authProvider);
        expect(window.sessionStorage.getItem(REDIRECT_PENDING_KEY)).toBe(provider);
      },
    );

    it('keeps the popup while the auth domain is still firebaseapp.com', async () => {
      mockStandalone(true);
      vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'vinctus-daf32.firebaseapp.com');
      vi.mocked(signInWithPopup).mockResolvedValue(undefined as never);
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.signInWithGoogle();
      });

      expect(signInWithPopup).toHaveBeenCalled();
      expect(signInWithRedirect).not.toHaveBeenCalled();
    });
  });

  it('keeps the popup in a regular browser tab even with the app-host auth domain', async () => {
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', window.location.host);
    vi.mocked(signInWithPopup).mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signInWithGoogle();
    });

    expect(signInWithPopup).toHaveBeenCalled();
    expect(signInWithRedirect).not.toHaveBeenCalled();
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', undefined);
  });

  it('skips the redirect result when no redirect is pending', async () => {
    renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(getRedirectResult).not.toHaveBeenCalled());
  });

  it('trims email and suppresses auth/user-not-found on resetPassword to prevent account enumeration', async () => {
    vi.mocked(sendPasswordResetEmail).mockRejectedValueOnce(authError('auth/user-not-found'));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await expect(result.current.resetPassword('  ghost@example.com  ')).resolves.toBeUndefined();
    });

    expect(sendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), 'ghost@example.com');
    expect(result.current.error).toBeNull();
  });

  it('still bootstraps Firestore profile when sendEmailVerification fails during signUpWithEmail', async () => {
    const newUser = {
      uid: 'u_new',
      email: 'new@example.com',
      displayName: 'New User',
      photoURL: null,
      phoneNumber: null,
      emailVerified: false,
    } as unknown as User;
    vi.mocked(doc).mockImplementation(((_db: unknown, ...segments: string[]) =>
      segments.join('/')) as never);
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValueOnce({ user: newUser } as never);
    vi.mocked(updateProfile).mockResolvedValueOnce(undefined);
    vi.mocked(sendEmailVerification).mockRejectedValueOnce(authError('auth/too-many-requests'));
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => false,
      data: () => undefined,
    } as never);
    vi.mocked(setDoc).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await expect(
        result.current.signUpWithEmail('  new@example.com ', 'password123', '  New User  '),
      ).resolves.toBeUndefined();
    });

    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'new@example.com',
      'password123',
    );
    expect(updateProfile).toHaveBeenCalledWith(newUser, { displayName: 'New User' });
    expect(setDoc).toHaveBeenCalledWith('users/u_new', expect.objectContaining({ uid: 'u_new' }));
    expect(result.current.user?.uid).toBe('u_new');
  });
});
