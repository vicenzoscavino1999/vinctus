import type { ErrorInfo } from 'react';

// Centralized hook for external error reporting.
// Keep this in shared so shared UI components (like ErrorBoundary) don't depend on app layer.
export const logErrorToService = (error: Error, errorInfo?: ErrorInfo): void => {
  console.error('ErrorBoundary caught:', error, errorInfo);
};
