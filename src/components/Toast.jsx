import { createContext, useContext, useState, useCallback } from 'react';

// Toast Context
const ToastContext = createContext(null);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export const ToastProvider = ({ children }) => {
    const [toast, setToast] = useState(null);

    const showToast = useCallback((message, type = 'info', duration = 3000) => {
        setToast({ message, type, id: Date.now() });
        setTimeout(() => setToast(null), duration);
    }, []);

    const hideToast = useCallback(() => setToast(null), []);

    return (
        <ToastContext.Provider value={{ showToast, hideToast }}>
            {children}
            {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
        </ToastContext.Provider>
    );
};

// Toast Component
const Toast = ({ message, type, onClose }) => {
    const bgColor = {
        error: 'bg-red-900/90 border-red-700',
        success: 'bg-green-900/90 border-green-700',
        info: 'bg-neutral-800/95 border-neutral-700',
        warning: 'bg-amber-900/90 border-amber-700'
    }[type] || 'bg-neutral-800/95 border-neutral-700';

    return (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-fade-up">
            <div className={`${bgColor} border rounded-lg px-4 py-3 shadow-xl backdrop-blur-sm flex items-center gap-3 max-w-sm`}>
                <span className="text-sm text-white/90">{message}</span>
                <button
                    onClick={onClose}
                    className="text-white/60 hover:text-white text-lg leading-none"
                >
                    ×
                </button>
            </div>
        </div>
    );
};

export default Toast;
