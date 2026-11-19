import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeleteAccountModal from './DeleteAccountModal';

const mockUser = { uid: 'user_a' };
const mockSignOut = vi.fn();
const mockShowToast = vi.fn();
const mockGetStatus = vi.fn();
const mockStartDeletion = vi.fn();

vi.mock('@/context/auth', () => ({
  useAuth: () => ({
    user: mockUser,
    signOut: mockSignOut,
  }),
}));

vi.mock('@/shared/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/features/settings/api', () => ({
  getAccountDeletionStatus: (...args: unknown[]) => mockGetStatus(...args),
  startAccountDeletion: (...args: unknown[]) => mockStartDeletion(...args),
}));

describe('DeleteAccountModal', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStatus.mockResolvedValue({
      status: 'not_requested',
      jobId: null,
      updatedAt: null,
      completedAt: null,
      lastError: null,
    });
    mockStartDeletion.mockResolvedValue({
      mode: 'async',
      status: 'queued',
      jobId: 'user_a',
    });
  });

  it('requires ELIMINAR confirmation and transitions to completed when server deletes auth user', async () => {
    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Sin solicitud')).toBeInTheDocument());

    const submitButton = screen.getByRole('button', { name: /Solicitar eliminación/i });
    expect(submitButton).toBeDisabled();

    const input = screen.getByPlaceholderText('Escribe ELIMINAR');
    fireEvent.change(input, { target: { value: 'borrar' } });
    expect(submitButton).toBeDisabled();

    fireEvent.change(input, { target: { value: ' eliminar ' } });
    expect(submitButton).toBeEnabled();

    fireEvent.click(submitButton);
    await waitFor(() => expect(screen.getByText('Solicitud en cola')).toBeInTheDocument());

    // Simulate Auth user removed by server before next status refresh
    mockGetStatus.mockRejectedValueOnce(
      Object.assign(new Error('unauthenticated'), { code: 'functions/unauthenticated' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));

    await waitFor(() => expect(screen.getByText('Cuenta eliminada')).toBeInTheDocument());
    expect(screen.getByText(/Borrado completado/i)).toBeInTheDocument();
  });
});
