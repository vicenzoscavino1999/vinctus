import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import PasswordResetActionScreen from './PasswordResetActionScreen';

describe('PasswordResetActionScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('verifies oobCode on mount and immediately reports expired links', async () => {
    vi.mocked(verifyPasswordResetCode).mockRejectedValueOnce(
      Object.assign(new Error('expired'), { code: 'auth/expired-action-code' }),
    );

    render(<PasswordResetActionScreen oobCode="expired-code" continueUrl={null} />);

    await waitFor(() =>
      expect(
        screen.getByText(/El enlace es inválido o ya expiró\. Solicita uno nuevo\./i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByPlaceholderText('Nueva contraseña')).not.toBeInTheDocument();
  });

  it('validates mismatch and resets password once code is verified', async () => {
    vi.mocked(verifyPasswordResetCode).mockResolvedValueOnce('alice@example.com');
    vi.mocked(confirmPasswordReset).mockResolvedValueOnce(undefined);

    render(<PasswordResetActionScreen oobCode="valid-code" continueUrl="/login" />);

    await waitFor(() =>
      expect(
        screen.getByText(/Ingresa una nueva contraseña para alice@example\.com\./i),
      ).toBeInTheDocument(),
    );

    const passwordInput = screen.getByPlaceholderText('Nueva contraseña');
    const confirmInput = screen.getByPlaceholderText('Confirmar nueva contraseña');

    fireEvent.change(passwordInput, { target: { value: 'secret123' } });
    fireEvent.change(confirmInput, { target: { value: 'different123' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar nueva contraseña/i }));
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(confirmPasswordReset).not.toHaveBeenCalled();

    fireEvent.change(confirmInput, { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar nueva contraseña/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/Contraseña actualizada correctamente para alice@example\.com\./i),
      ).toBeInTheDocument(),
    );
    expect(confirmPasswordReset).toHaveBeenCalledWith(expect.anything(), 'valid-code', 'secret123');
  });
});
