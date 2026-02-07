import { lazy, Suspense, useEffect } from 'react';

import LoginScreen from '@/features/auth/components/LoginScreen';
import PasswordResetActionScreen from '@/features/auth/components/PasswordResetActionScreen';
import { AuthProvider, useAuth } from '@/app/providers/AuthContext';
import { initTheme } from '@/shared/lib/theme';
import PageLoader from '@/shared/ui/PageLoader';

const getStoredItem = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    // Check if localStorage is accessible (can be blocked in private mode)
    if (!window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    // localStorage blocked or quota exceeded
    return null;
  }
};

const setStoredItem = (key: string, value: string): void => {
  if (typeof window === 'undefined') return;
  try {
    // Check if localStorage is accessible (can be blocked in private mode)
    if (!window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage blocked or quota exceeded - fail silently
  }
};

type PasswordResetAction = {
  oobCode: string;
  continueUrl: string | null;
};

const getPasswordResetAction = (): PasswordResetAction | null => {
  if (typeof window === 'undefined') return null;

  const searchParams = new URLSearchParams(window.location.search);
  const mode = searchParams.get('mode');
  const oobCode = searchParams.get('oobCode');

  if (mode !== 'resetPassword' || !oobCode) {
    return null;
  }

  return {
    oobCode,
    continueUrl: searchParams.get('continueUrl'),
  };
};

const OnboardingFlow = lazy(() => import('@/features/auth/components/OnboardingFlow'));
const AuthenticatedAppShell = lazy(() => import('@/app/routes/AuthenticatedAppShell'));

// Inner app that uses auth context
function AppContent() {
  const { user, loading } = useAuth();
  const passwordResetAction = getPasswordResetAction();

  useEffect(() => {
    const cleanup = initTheme();
    return () => cleanup();
  }, []);

  if (passwordResetAction) {
    return (
      <PasswordResetActionScreen
        oobCode={passwordResetAction.oobCode}
        continueUrl={passwordResetAction.continueUrl}
      />
    );
  }

  // Check if onboarding is complete
  const onboardingComplete = getStoredItem('vinctus_onboarding_complete') === 'true';

  // Show loading while checking auth
  if (loading) {
    return <PageLoader />;
  }

  // Show login screen if not authenticated
  if (!user) {
    return <LoginScreen />;
  }

  // Show onboarding if not completed
  if (!onboardingComplete) {
    const handleOnboardingComplete = () => {
      setStoredItem('vinctus_onboarding_complete', 'true');
      window.location.reload(); // Simple reload to update state
    };

    return (
      <Suspense fallback={<PageLoader />}>
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <AuthenticatedAppShell />
    </Suspense>
  );
}

// Main App with AuthProvider wrapper
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
