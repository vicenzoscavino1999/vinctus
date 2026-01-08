import { useState, lazy, Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { LoginScreen, ToastProvider } from './components';
import AppLayout from './components/AppLayout';
import PageLoader from './components/PageLoader';
import { AppStateProvider } from './context';

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

// App with Router and Authentication
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return getStoredItem('vinctus_authenticated') === 'true';
  });
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !getStoredItem('vinctus_onboarding_complete');
  });

  const handleLogin = () => {
    setStoredItem('vinctus_authenticated', 'true');
    setIsAuthenticated(true);
  };

  const handleOnboardingComplete = () => {
    setStoredItem('vinctus_onboarding_complete', 'true');
    setShowOnboarding(false);
  };

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // Show onboarding if not completed
  if (showOnboarding) {
    return (
      <Suspense fallback={<PageLoader />}>
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </Suspense>
    );
  }

  return (
    <BrowserRouter>
      <AppStateProvider>
        <ToastProvider>
          <AppLayout />
        </ToastProvider>
      </AppStateProvider>
    </BrowserRouter>
  );
}
