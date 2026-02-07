import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/shared/lib/errors';
import { createSupportTicket } from '@/features/help/api/mutations';
import type { CreateSupportTicketInput } from '@/features/help/api/types';

vi.mock('@/shared/lib/firestore', () => ({
  createSupportTicket: vi.fn(),
}));

const firestore = await import('@/shared/lib/firestore');

const validInput: CreateSupportTicketInput = {
  uid: 'user_1',
  email: 'user@example.com',
  type: 'issue',
  title: 'No puedo enviar mensajes',
  message: 'Al intentar enviar mensajes, la app se queda cargando.',
  context: {
    path: '/messages',
    href: 'https://vinctus.app/messages',
    userAgent: 'Mozilla/5.0',
    platform: 'Win32',
    locale: 'es-PE',
    screen: {
      width: 1920,
      height: 1080,
    },
    viewport: {
      width: 1280,
      height: 720,
    },
    timezoneOffset: 300,
  },
  appVersion: 'v0.0.2-alpha',
};

describe('help api mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates and normalizes support payload', async () => {
    vi.mocked(firestore.createSupportTicket).mockResolvedValueOnce('ticket_1');

    await expect(
      createSupportTicket({
        ...validInput,
        title: '  No puedo enviar mensajes  ',
        message: '  Al intentar enviar mensajes, la app se queda cargando.  ',
        appVersion: '  v0.0.2-alpha  ',
      }),
    ).resolves.toBe('ticket_1');

    expect(firestore.createSupportTicket).toHaveBeenCalledWith({
      ...validInput,
      title: 'No puedo enviar mensajes',
      message: 'Al intentar enviar mensajes, la app se queda cargando.',
      appVersion: 'v0.0.2-alpha',
    });
  });

  it('allows nullable email and forwards null', async () => {
    vi.mocked(firestore.createSupportTicket).mockResolvedValueOnce('ticket_0');

    await expect(createSupportTicket({ ...validInput, email: null })).resolves.toBe('ticket_0');
    expect(firestore.createSupportTicket).toHaveBeenCalledWith({
      ...validInput,
      email: null,
    });
  });

  it('retries transient support ticket failures', async () => {
    vi.mocked(firestore.createSupportTicket)
      .mockRejectedValueOnce({ code: 'network-request-failed', message: 'offline' })
      .mockResolvedValueOnce('ticket_2');

    await expect(createSupportTicket(validInput)).resolves.toBe('ticket_2');
    expect(firestore.createSupportTicket).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid payload before write', async () => {
    const task = createSupportTicket({
      ...validInput,
      title: 'abc',
    });
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(firestore.createSupportTicket).not.toHaveBeenCalled();
  });

  it('maps source errors to AppError', async () => {
    vi.mocked(firestore.createSupportTicket).mockRejectedValueOnce({
      code: 'permission-denied',
      message: 'Denied',
    });

    const task = createSupportTicket(validInput);
    await expect(task).rejects.toBeInstanceOf(AppError);
    await expect(task).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
