import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupportModal from '@/features/help/components/SupportModal';

const authMock = vi.hoisted(() => ({
  user: { uid: 'user-1', email: 'ana@example.com' } as { uid: string; email: string | null } | null,
}));
const toastMock = vi.hoisted(() => ({
  showToast: vi.fn(),
}));
const helpApiMock = vi.hoisted(() => ({
  createSupportTicket: vi.fn(),
}));

vi.mock('@/context/auth', () => ({
  useAuth: () => authMock,
}));
vi.mock('@/shared/ui/Toast', () => ({
  useToast: () => toastMock,
}));
vi.mock('@/features/help/api', () => helpApiMock);

describe('SupportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.user = { uid: 'user-1', email: 'ana@example.com' };
  });

  it('renders native mailto links in the menu without calling window.open', () => {
    render(
      <MemoryRouter>
        <SupportModal isOpen onClose={vi.fn()} initialView="menu" />
      </MemoryRouter>,
    );

    const supportLink = screen.getByRole('link', { name: /Escribir por correo/i });
    const securityLink = screen.getByRole('link', { name: /Reporte de seguridad/i });
    expect(supportLink).toHaveAttribute('href', 'mailto:support@vinctus.app');
    expect(securityLink).toHaveAttribute('href', 'mailto:security@vinctus.app');
  });

  it('submits a valid support ticket with normalized production appVersion', async () => {
    helpApiMock.createSupportTicket.mockResolvedValueOnce('ticket-1');
    const onClose = vi.fn();

    render(
      <MemoryRouter>
        <SupportModal isOpen onClose={onClose} initialView="form" initialType="issue" />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText(/No puedo enviar mensajes/i), {
      target: { value: 'Error al abrir notificaciones' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Cuéntanos qué pasó/i), {
      target: { value: 'Al entrar en la bandeja de solicitudes aparece un spinner infinito.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(helpApiMock.createSupportTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          uid: 'user-1',
          email: 'ana@example.com',
          type: 'issue',
          title: 'Error al abrir notificaciones',
          appVersion: 'web-1.0.0',
        }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
