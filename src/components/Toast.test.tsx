import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from './Toast';

// Componente helper para probar el hook useToast
const TestComponent = () => {
    const { showToast } = useToast();

    return (
        <div>
            <button onClick={() => showToast('Test message', 'success')}>
                Show Success
            </button>
            <button onClick={() => showToast('Error message', 'error')}>
                Show Error
            </button>
            <button onClick={() => showToast('Warning message', 'warning')}>
                Show Warning
            </button>
        </div>
    );
};

describe('Toast', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Renderizado', () => {
        it('no muestra toast inicialmente', () => {
            render(
                <ToastProvider>
                    <TestComponent />
                </ToastProvider>
            );

            expect(screen.queryByText('Test message')).not.toBeInTheDocument();
        });

        it('muestra toast success cuando se activa', async () => {
            render(
                <ToastProvider>
                    <TestComponent />
                </ToastProvider>
            );

            fireEvent.click(screen.getByText('Show Success'));

            expect(screen.getByText('Test message')).toBeInTheDocument();
        });

        it('muestra toast error cuando se activa', async () => {
            render(
                <ToastProvider>
                    <TestComponent />
                </ToastProvider>
            );

            fireEvent.click(screen.getByText('Show Error'));

            expect(screen.getByText('Error message')).toBeInTheDocument();
        });

        it('muestra toast warning cuando se activa', async () => {
            render(
                <ToastProvider>
                    <TestComponent />
                </ToastProvider>
            );

            fireEvent.click(screen.getByText('Show Warning'));

            expect(screen.getByText('Warning message')).toBeInTheDocument();
        });
    });

    describe('Auto-dismiss', () => {
        it('desaparece automaticamente despues del timeout', async () => {
            render(
                <ToastProvider>
                    <TestComponent />
                </ToastProvider>
            );

            fireEvent.click(screen.getByText('Show Success'));
            expect(screen.getByText('Test message')).toBeInTheDocument();

            // Avanzar el tiempo
            await act(async () => {
                vi.advanceTimersByTime(4000);
            });

            expect(screen.queryByText('Test message')).not.toBeInTheDocument();
        });
    });

    describe('Cierre manual', () => {
        it('se cierra al hacer click en el boton X', async () => {
            render(
                <ToastProvider>
                    <TestComponent />
                </ToastProvider>
            );

            fireEvent.click(screen.getByText('Show Success'));
            expect(screen.getByText('Test message')).toBeInTheDocument();

            // Click en boton cerrar
            const closeButton = screen.getByLabelText('Cerrar notificacion');
            fireEvent.click(closeButton);

            expect(screen.queryByText('Test message')).not.toBeInTheDocument();
        });
    });
});

