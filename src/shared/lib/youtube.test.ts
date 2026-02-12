import { describe, expect, it } from 'vitest';
import { getYouTubeThumbnailUrl, isYouTubeUrl, parseYouTubeUrl } from '@/shared/lib/youtube';

describe('youtube helpers', () => {
  it('parses youtube watch URL', () => {
    const meta = parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(meta?.videoId).toBe('dQw4w9WgXcQ');
    expect(meta?.embedUrl).toContain('/embed/dQw4w9WgXcQ');
  });

  it('parses youtu.be short URL', () => {
    const meta = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(meta?.videoId).toBe('dQw4w9WgXcQ');
  });

  it('parses shorts URL', () => {
    const meta = parseYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ');
    expect(meta?.videoId).toBe('dQw4w9WgXcQ');
  });

  it('supports raw video ID', () => {
    const meta = parseYouTubeUrl('dQw4w9WgXcQ');
    expect(meta?.watchUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('returns null for invalid URLs', () => {
    expect(parseYouTubeUrl('https://example.com/video.mp4')).toBeNull();
    expect(parseYouTubeUrl('not-a-url')).toBeNull();
  });

  it('detects YouTube URL and thumbnail', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(getYouTubeThumbnailUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toContain(
      '/dQw4w9WgXcQ/hqdefault.jpg',
    );
  });
});
