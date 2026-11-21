import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Header from '@/app/routes/Header';

describe('Header', () => {
  it('renders notifications button without badge when notificationCount is 0', () => {
    render(
      <MemoryRouter>
        <Header notificationCount={0} />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: 'Notificaciones' });
    expect(button).toBeInTheDocument();
    expect(screen.queryByText('9+')).not.toBeInTheDocument();
  });

  it('shows numeric badge and accessible pending label when notificationCount is positive', () => {
    render(
      <MemoryRouter>
        <Header notificationCount={3} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('button', { name: 'Notificaciones (3 pendientes)' }),
    ).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('caps badge display at 9+ and invokes onCreatePost when clicking create button', () => {
    const onCreatePost = vi.fn();
    render(
      <MemoryRouter>
        <Header notificationCount={14} onCreatePost={onCreatePost} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('button', { name: 'Notificaciones (14 pendientes)' }),
    ).toBeInTheDocument();
    expect(screen.getByText('9+')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Crear publicación' }));
    expect(onCreatePost).toHaveBeenCalledTimes(1);
  });
});
