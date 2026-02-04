import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './registerSW';
import App from './App';
import ErrorBoundary from '@/shared/ui/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
