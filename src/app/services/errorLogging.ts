import type { ErrorInfo } from 'react';

// Centralized hook for external error reporting.
export const logErrorToService = (error: Error, errorInfo?: ErrorInfo): void => {
  console.error('ErrorBoundary caught:', error, errorInfo);
};
