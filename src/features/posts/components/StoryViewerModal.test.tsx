import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StoryViewerModal, {
  type StoryViewerGroup,
} from '@/features/posts/components/StoryViewerModal';
import type { StoryFeedItem } from '@/features/posts/hooks/useStories';

const makeStory = (
  id: string,
  ownerId: string,
  ownerName: string,
  mediaType: StoryFeedItem['mediaType'] = 'image',
  source: StoryFeedItem['source'] = 'story',
): StoryFeedItem => ({
  id,
  source,
  ownerId,
  ownerName,
  ownerPhoto: null,
  mediaType,
  mediaUrl:
    mediaType === 'image' ? `https://example.com/${id}.jpg` : `https://example.com/${id}.mp4`,
  mediaPath:
    mediaType === 'image'
      ? `stories/${ownerId}/${id}/original/x.jpg`
      : `stories/${ownerId}/${id}/original/x.mp4`,
  thumbUrl: null,
  thumbPath: null,
  createdAt: new Date('2026-02-10T12:00:00.000Z'),
  expiresAt: new Date('2026-02-11T12:00:00.000Z'),
});

const makeGroups = (): StoryViewerGroup[] => [
  {
    ownerId: 'owner-1',
    ownerName: 'Ana',
    ownerPhoto: null,
    stories: [makeStory('story-1', 'owner-1', 'Ana')],
  },
  {
    ownerId: 'owner-2',
    ownerName: 'Beto',
    ownerPhoto: null,
    stories: [makeStory('story-2', 'owner-2', 'Beto')],
  },
];

describe('StoryViewerModal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.clearAllTimers();
    });
    vi.useRealTimers();
  });

  it('avanza en secuencia entre usuarios sin cerrar al terminar la primera historia', () => {
    const onClose = vi.fn();
    render(<StoryViewerModal isOpen groups={makeGroups()} onClose={onClose} />);

    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText('Beto')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5100);
    });

    expect(screen.getByText('Beto')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reporta historias vistas y cierra al finalizar la ultima historia', () => {
    const onClose = vi.fn();
    const onStorySeen = vi.fn();
    render(
      <StoryViewerModal isOpen groups={makeGroups()} onClose={onClose} onStorySeen={onStorySeen} />,
    );

    expect(onStorySeen).toHaveBeenCalledWith('story-1');

    act(() => {
      vi.advanceTimersByTime(5100);
    });

    expect(onStorySeen).toHaveBeenCalledWith('story-2');

    act(() => {
      vi.advanceTimersByTime(5100);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('no autoavanza historias de video por tiempo fijo', () => {
    const onClose = vi.fn();
    const groups: StoryViewerGroup[] = [
      {
        ownerId: 'owner-video',
        ownerName: 'Canal',
        ownerPhoto: null,
        stories: [makeStory('story-video', 'owner-video', 'Canal', 'video')],
      },
    ];

    render(<StoryViewerModal isOpen groups={groups} onClose={onClose} />);

    act(() => {
      vi.advanceTimersByTime(30000);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Canal')).toBeInTheDocument();
  });

  it('pausa mientras confirma borrado y mantiene el visor abierto si falla', async () => {
    const onDeleteStory = vi
      .fn()
      .mockRejectedValueOnce(new Error('permission-denied'))
      .mockResolvedValueOnce(undefined);
    const onClose = vi.fn();

    render(
      <StoryViewerModal
        isOpen
        groups={makeGroups()}
        currentUserId="owner-1"
        onDeleteStory={onDeleteStory}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar historia' }));
    expect(screen.getByText('¿Eliminar esta historia?')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByText('Tu historia')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    vi.useRealTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => {
      expect(screen.getByText('No se pudo eliminar la historia.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => {
      expect(onDeleteStory).toHaveBeenCalledTimes(2);
    });
  });

  it('permite denunciar historia ajena y bloquear al autor cerrando el visor', async () => {
    const onReportStory = vi.fn().mockResolvedValue(undefined);
    const onBlockUser = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    vi.useRealTimers();
    render(
      <StoryViewerModal
        isOpen
        groups={makeGroups()}
        currentUserId="viewer-1"
        onReportStory={onReportStory}
        onBlockUser={onBlockUser}
        onClose={onClose}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Eliminar historia' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Más opciones' }));
    fireEvent.click(screen.getByRole('button', { name: 'Denunciar historia' }));

    const detailsInput = screen.getByPlaceholderText('Describe el motivo del reporte');
    fireEvent.keyDown(detailsInput, { key: 'ArrowRight' });
    expect(screen.getByText('Ana')).toBeInTheDocument();

    fireEvent.change(detailsInput, { target: { value: 'Contenido inapropiado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    await waitFor(() => {
      expect(onReportStory).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'story-1' }),
        'spam',
        'Contenido inapropiado',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Más opciones' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear a Ana' }));
    fireEvent.click(screen.getByRole('button', { name: /^Bloquear$/ }));

    await waitFor(() => {
      expect(onBlockUser).toHaveBeenCalledWith('owner-1', 'Ana');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('oculta acciones de moderación y borrado en YouTube Shorts y muestra fallback ante imagen rota', () => {
    const shortStory = makeStory(
      'yt-short-abc',
      'yt-short-owner-abc',
      'Canal Short',
      'video',
      'seededShort',
    );
    const brokenGroup: StoryViewerGroup[] = [
      {
        ownerId: 'owner-1',
        ownerName: 'Ana',
        ownerPhoto: null,
        stories: [makeStory('broken-1', 'owner-1', 'Ana')],
      },
      {
        ownerId: 'yt-short-owner-abc',
        ownerName: 'Canal Short',
        ownerPhoto: null,
        stories: [shortStory],
      },
    ];

    render(
      <StoryViewerModal
        isOpen
        groups={brokenGroup}
        currentUserId="viewer-1"
        onDeleteStory={vi.fn()}
        onReportStory={vi.fn()}
        onBlockUser={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const img = screen.getByAltText('Historia');
    fireEvent.error(img);
    expect(screen.getByText('No se pudo cargar la historia')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.queryByRole('button', { name: 'Más opciones' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar historia' })).not.toBeInTheDocument();
  });
});
