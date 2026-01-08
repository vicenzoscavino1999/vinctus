import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Toast as ToastData, ToastContextType, ToastType } from '../types';

// Toast Context
const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
    const [toast, setToast] = useState<ToastData | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast: ToastContextType['showToast'] = useCallback((message, type = 'info', duration = 3000) => {
        // Clear any existing timer
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }

        setToast({ message, type, id: Date.now() });

        // Set new timer and store reference
        timerRef.current = setTimeout(() => {
            setToast(null);
            timerRef.current = null;
        }, duration);
    }, []);

    const hideToast = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setToast(null);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, []);

    return (
        <ToastContext.Provider value={{ showToast, hideToast }}>
            {children}
            {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
        </ToastContext.Provider>
    );
};

// Toast Component
type ToastProps = {
    message: string;
    type: ToastType;
    onClose: () => void;
};

const Toast = ({ message, type, onClose }: ToastProps) => {
    const bgColor: Record<ToastType, string> = {
        error: 'bg-red-900/90 border-red-700',
        success: 'bg-green-900/90 border-green-700',
        info: 'bg-neutral-800/95 border-neutral-700',
        warning: 'bg-amber-900/90 border-amber-700'
    };
    const backgroundClass = bgColor[type] || 'bg-neutral-800/95 border-neutral-700';

    return (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-fade-up">
            <div className={`${backgroundClass} border rounded-lg px-4 py-3 shadow-xl backdrop-blur-sm flex items-center gap-3 max-w-sm`}>
                <span className="text-sm text-white/90">{message}</span>
                <button
                    onClick={onClose}
                    className="text-white/60 hover:text-white transition-colors"
                    aria-label="Cerrar notificacion"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
};

export default Toast;

