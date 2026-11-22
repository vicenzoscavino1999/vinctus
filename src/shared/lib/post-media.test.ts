import { describe, expect, it } from 'vitest';
import { validatePostFile } from './post-media';
import { STORAGE_MAX_BYTES as MAX } from './firestore/firestoreContract';

describe('post media validation', () => {
  it('normalizes missing Office/MOV MIME types and permits post-sized videos', () => {
    expect(validatePostFile({ name: 'Notas.docx', type: '', size: 20 }, 'file')).toContain(
      'wordprocessingml',
    );
    expect(
      validatePostFile(
        { name: 'clip.mov', type: 'application/octet-stream', size: 30 * 1024 * 1024 },
        'video',
      ),
    ).toBe('video/quicktime');
  });
  it('rejects mismatched types, zero-byte files, audio and exact size limits', () => {
    expect(() => validatePostFile({ name: 'x.pdf', type: 'text/plain', size: 20 }, 'file')).toThrow(
      'formato',
    );
    expect(() =>
      validatePostFile({ name: 'x.pdf', type: 'application/pdf', size: 0 }, 'file'),
    ).toThrow('vacío');
    expect(() => validatePostFile({ name: 'x.wav', type: 'audio/wav', size: 20 }, 'file')).toThrow(
      'formato',
    );
    expect(() =>
      validatePostFile({ name: 'x.mp4', type: 'video/mp4', size: MAX.video }, 'video'),
    ).toThrow('menos');
  });
});
