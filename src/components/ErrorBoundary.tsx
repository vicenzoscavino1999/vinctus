import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'hsl(0 0% 4%)' }}>
                    <div className="text-center max-w-md">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle size={32} className="text-red-400" />
                        </div>
                        <h1 className="text-2xl font-serif text-white mb-3">
                            Algo salió mal
                        </h1>
                        <p className="text-neutral-400 text-sm mb-6">
                            Ha ocurrido un error inesperado. Por favor, intenta recargar la página.
                        </p>
                        <button
                            onClick={this.handleRetry}
                            className="btn-primary inline-flex items-center gap-2"
                        >
                            <RefreshCw size={16} />
                            Reintentar
                        </button>
                        {process.env.NODE_ENV === 'development' && this.state.error && (
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
