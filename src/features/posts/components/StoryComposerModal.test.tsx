import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StoryComposerModal from '@/features/posts/components/StoryComposerModal';

const mockShowToast = vi.fn();
const mockCreateStory = vi.fn();
const mockGetNewStoryId = vi.fn();
const mockUploadStoryImage = vi.fn();
const mockUploadStoryVideo = vi.fn();
const mockDeleteStoryFiles = vi.fn();
const mockImageCompression = vi.fn();

vi.mock('@/context/auth', () => ({
  useAuth: () => ({
    user: {
      uid: 'user_1',
      displayName: `  ${'A'.repeat(100)}  `,
      photoURL: 'https://example.com/avatar.jpg',
    },
  }),
}));

vi.mock('@/shared/ui/Toast', () => ({
  useToast: () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }),
}));

vi.mock('@/features/posts/api', () => ({
  createStory: (...args: unknown[]) => mockCreateStory(...args),
  getNewStoryId: (...args: unknown[]) => mockGetNewStoryId(...args),
}));

vi.mock('@/shared/lib/storage', () => ({
  uploadStoryImage: (...args: unknown[]) => mockUploadStoryImage(...args),
  uploadStoryVideo: (...args: unknown[]) => mockUploadStoryVideo(...args),
  deleteStoryFiles: (...args: unknown[]) => mockDeleteStoryFiles(...args),
}));

vi.mock('browser-image-compression', () => ({
  default: (...args: unknown[]) => mockImageCompression(...args),
}));

vi.mock('@/shared/lib/heic2any-loader', () => ({
  loadHeic2Any: vi.fn(),
}));

describe('StoryComposerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNewStoryId.mockReturnValue('story_new_1');
    mockDeleteStoryFiles.mockResolvedValue(undefined);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-preview'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('rechaza formatos de video no permitidos antes de subir', () => {
    render(<StoryComposerModal isOpen onClose={vi.fn()} />);
    const fileInputs = document.querySelectorAll('input[type="file"]');
    const videoInput = fileInputs[1] as HTMLInputElement;
    const unsupportedVideo = new File(['abc'], 'clip.mkv', { type: 'video/x-matroska' });

    fireEvent.change(videoInput, { target: { files: [unsupportedVideo] } });

    expect(mockShowToast).toHaveBeenCalledWith(
      'Formato de video no compatible. Usa MP4, WebM o MOV.',
      'error',
    );
    expect(mockUploadStoryVideo).not.toHaveBeenCalled();
  });

  it('limpia archivos huérfanos en Storage si falla createStory y bloquea cerrar durante la subida', async () => {
    let rejectCreate!: (error: Error) => void;
    mockUploadStoryVideo.mockResolvedValue({
      url: 'https://cdn.example.com/story.mp4',
      path: 'stories/user_1/story_new_1/original/clip.mp4',
    });
    mockCreateStory.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectCreate = reject;
        }),
    );

    const onClose = vi.fn();
    render(<StoryComposerModal isOpen onClose={onClose} />);
    const fileInputs = document.querySelectorAll('input[type="file"]');
    const videoInput = fileInputs[1] as HTMLInputElement;
    const validVideo = new File(['abc'], 'clip.mp4', { type: 'video/mp4' });

    fireEvent.change(videoInput, { target: { files: [validVideo] } });
    fireEvent.click(screen.getByRole('button', { name: /Publicar historia/i }));

    await waitFor(() => {
      expect(mockCreateStory).toHaveBeenCalledTimes(1);
    });

    // While upload/publish is in-flight, Escape and Cerrar button must not dismiss the modal.
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).not.toHaveBeenCalled();

    const submittedInput = mockCreateStory.mock.calls[0]?.[0] as { ownerName: string | null };
    expect(submittedInput.ownerName?.length).toBeLessThanOrEqual(80);

    rejectCreate(new Error('firestore-failed'));

    await waitFor(() => {
      expect(mockDeleteStoryFiles).toHaveBeenCalledWith([
        'stories/user_1/story_new_1/original/clip.mp4',
      ]);
      expect(mockShowToast).toHaveBeenCalledWith('No se pudo publicar la historia.', 'error');
    });
  });
});
