import { lazy, Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { AppStateProvider } from '@/app/providers/AppState';
import PageLoader from '@/shared/ui/PageLoader';
import { ToastProvider } from '@/shared/ui/Toast';

const AppLayout = lazy(() => import('@/app/routes/AppLayout'));

export default function AuthenticatedAppShell() {
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
