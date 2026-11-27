import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GroupDetailView, type GroupData } from '@/features/groups/components/GroupDetailView';

const sampleGroup: GroupData = {
  id: 'group_1',
  categoryId: 'science',
  name: 'Fisica Cuantica',
  description: 'Exploracion de fundamentos',
  members: 4,
  postsPerWeek: 2,
  iconUrl: null,
  icon: 'F',
  recentPosts: [{ id: 'p1', title: 'Dualidad onda-particula', author: 'Alice', time: 'hace 2h' }],
  topMembers: [{ id: 'u1', name: 'Alice', role: 'Admin', posts: 3 }],
};

describe('GroupDetailView', () => {
  it('hides member list trigger and renders private notice when locked', () => {
    const onOpenMembers = vi.fn();

    render(
      <GroupDetailView
        isLoading={false}
        error={null}
        group={sampleGroup}
        category={{ id: 'science', label: 'Ciencia' }}
        isJoined={false}
        joinLabel="Solicitar"
        joinDisabled={false}
        canOpenChat={false}
        openingChat={false}
        isAuthenticated={true}
        canCreatePost={false}
        canEditGroup={false}
        canLeaveGroup={false}
        isPrivateLocked={true}
        onJoinGroup={vi.fn()}
        onGoBack={vi.fn()}
        onNavigateToCategory={vi.fn()}
        onOpenGroupChat={vi.fn()}
        onOpenCreatePost={vi.fn()}
        onEditGroup={vi.fn()}
        onOpenMembers={onOpenMembers}
        onLeaveGroup={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Este grupo es privado. Solicita acceso para ver las publicaciones.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Solo los miembros pueden ver la lista de participantes.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver miembros' })).toBeNull();
    expect(screen.queryByText('Dualidad onda-particula')).toBeNull();
  });

  it('renders members, posts, and callbacks when accessible', () => {
    const onOpenMembers = vi.fn();
    const onEditGroup = vi.fn();

    render(
      <GroupDetailView
        isLoading={false}
        error={null}
        group={sampleGroup}
        category={null}
        isJoined={true}
        joinLabel="Tu grupo"
        joinDisabled={true}
        canOpenChat={true}
        openingChat={false}
        isAuthenticated={true}
        canCreatePost={true}
        canEditGroup={true}
        canLeaveGroup={false}
        isPrivateLocked={false}
        onJoinGroup={vi.fn()}
        onGoBack={vi.fn()}
        onNavigateToCategory={vi.fn()}
        onOpenGroupChat={vi.fn()}
        onOpenCreatePost={vi.fn()}
        onEditGroup={onEditGroup}
        onOpenMembers={onOpenMembers}
        onLeaveGroup={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ver miembros' }));
    expect(onOpenMembers).toHaveBeenCalledTimes(1);

    // Edit and leave are in the group's "⋯" menu.
    fireEvent.click(screen.getByRole('button', { name: 'Opciones del grupo' }));
    expect(screen.queryByRole('button', { name: 'Salir' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' }));
    expect(onEditGroup).toHaveBeenCalledTimes(1);
    expect(screen.getByText('4 miembros')).toBeInTheDocument();
  });

  it('renders top member avatar and triggers onOpenMember when clicked', () => {
    const onOpenMember = vi.fn();
    const groupWithAvatar: GroupData = {
      ...sampleGroup,
      topMembers: [
        {
          id: 'u1',
          name: 'Alice',
          role: 'Admin',
          posts: 3,
          photoURL: 'https://example.com/alice.jpg',
        },
      ],
    };

    const { container } = render(
      <GroupDetailView
        isLoading={false}
        error={null}
        group={groupWithAvatar}
        category={null}
        isJoined={true}
        joinLabel="Tu grupo"
        joinDisabled={true}
        canOpenChat={false}
        openingChat={false}
        isAuthenticated={true}
        canCreatePost={false}
        canEditGroup={false}
        canLeaveGroup={false}
        isPrivateLocked={false}
        onJoinGroup={vi.fn()}
        onGoBack={vi.fn()}
        onNavigateToCategory={vi.fn()}
        onOpenGroupChat={vi.fn()}
        onOpenCreatePost={vi.fn()}
        onEditGroup={vi.fn()}
        onOpenMembers={vi.fn()}
        onOpenMember={onOpenMember}
        onLeaveGroup={vi.fn()}
      />,
    );

    expect(container.querySelector('img[src="https://example.com/alice.jpg"]')).not.toBeNull();
    fireEvent.click(screen.getByText('Alice'));
    expect(onOpenMember).toHaveBeenCalledWith('u1');
  });
});
