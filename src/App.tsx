import { lazy, Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';

import LoginScreen from './components/LoginScreen';
import PageLoader from './components/PageLoader';
import { ToastProvider } from './components/Toast';
import { AppStateProvider, AuthProvider, useAuth } from './context';

const getStoredItem = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const setStoredItem = (key: string, value: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage errors (private mode, quota, SSR)
  }
};

const OnboardingFlow = lazy(() => import('./components/OnboardingFlow'));
const AppLayout = lazy(() => import('./components/AppLayout'));

// Inner app that uses auth context
function AppContent() {
  const { user, loading } = useAuth();

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
      <BrowserRouter>
        <AppStateProvider>
          <ToastProvider>
            <AppLayout />
          </ToastProvider>
        </AppStateProvider>
      </BrowserRouter>
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
