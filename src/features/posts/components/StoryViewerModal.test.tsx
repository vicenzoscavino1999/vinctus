import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import StoryViewerModal, {
  type StoryViewerGroup,
} from '@/features/posts/components/StoryViewerModal';
import type { StoryFeedItem } from '@/features/posts/hooks/useStories';

const makeStory = (
  id: string,
  ownerId: string,
  ownerName: string,
  mediaType: StoryFeedItem['mediaType'] = 'image',
): StoryFeedItem => ({
  id,
  source: 'story',
  ownerId,
  ownerName,
  ownerPhoto: null,
  mediaType,
  mediaUrl:
    mediaType === 'image' ? `https://example.com/${id}.jpg` : `https://example.com/${id}.mp4`,
  mediaPath: mediaType === 'image' ? `stories/${id}.jpg` : `stories/${id}.mp4`,
  thumbUrl: null,
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
});
