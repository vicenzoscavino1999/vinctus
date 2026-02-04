import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { logErrorToService } from '@/shared/lib/errorLogging';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private static MAX_RETRIES = 2;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logErrorToService(error, errorInfo);
  }

  handleRetry = (): void => {
    if (this.state.retryCount >= ErrorBoundary.MAX_RETRIES) {
      // After max retries, force reload
      window.location.reload();
      return;
    }
    // Try soft retry first (just re-render children)
    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  handleGoHome = (): void => {
    // Navigate to home without full reload
    window.history.pushState({}, '', '/');
    this.setState({ hasError: false, error: null, retryCount: 0 });
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  render() {
    if (this.state.hasError) {
      const isLastRetry = this.state.retryCount >= ErrorBoundary.MAX_RETRIES;

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-surface-base">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} className="text-red-400" />
            </div>
            <h1 className="text-2xl font-serif text-white mb-3">Algo salió mal</h1>
            <p className="text-neutral-400 text-sm mb-6">
              {isLastRetry
                ? 'El error persiste. Intenta recargar la página completamente.'
                : 'Ha ocurrido un error inesperado. Puedes reintentar o volver al inicio.'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleGoHome}
                className="px-4 py-3 rounded-button bg-neutral-800 text-neutral-300 text-sm hover:bg-neutral-700 transition-colors inline-flex items-center gap-2"
              >
                <Home size={16} />
                Ir al inicio
              </button>
              <button
                onClick={this.handleRetry}
                className="btn-primary inline-flex items-center gap-2"
              >
                <RefreshCw size={16} />
                {isLastRetry ? 'Recargar página' : 'Reintentar'}
              </button>
            </div>
            {this.state.retryCount > 0 && (
              <p className="text-neutral-600 text-xs mt-4">
                Intento {this.state.retryCount} de {ErrorBoundary.MAX_RETRIES}
              </p>
            )}
            {import.meta.env.DEV && this.state.error && (
              <pre className="mt-6 text-left text-xs text-red-400 bg-red-500/10 p-4 rounded-lg overflow-auto max-h-40">
                {this.state.error.toString()}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
