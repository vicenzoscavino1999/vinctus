import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  chatFileLimit,
  encodeVoiceWav,
  safeChatURL,
  validateChatFile,
} from '@/shared/lib/chat-media';
import { messageAttachmentSchema } from '@/features/chat/api/types';
import { directParticipants } from './conversationIds';

const fixture = JSON.parse(
  readFileSync('ios-native/VinctusNative/Tests/Fixtures/chat-interop.json', 'utf8'),
);
describe('web/native chat contract', () => {
  it('normalizes common browser MIME aliases before sending to the shared Storage rules', () => {
    expect(validateChatFile({ type: 'audio/x-m4a', size: 100 })).toBe('audio/mp4');
    expect(validateChatFile({ type: 'audio/webm;codecs=opus', size: 100 })).toBe('audio/webm');
    expect(validateChatFile({ type: 'audio/x-wav', size: 100 })).toBe('audio/wav');
  });
  it('accepts the exact native and web attachment payloads without changing kind=file media', () => {
    for (const message of [fixture.nativeMessage, fixture.webMessage]) {
      for (const attachment of message.attachments) {
        expect(messageAttachmentSchema.parse(attachment)).toMatchObject(attachment);
        expect(safeChatURL(attachment.url)).not.toBeNull();
      }
    }
  });
  it('encodes the exact PCM WAV fixture that is decoded by the native AVPlayer test', () => {
    const pcm = new Float32Array(16000);
    const wav = encodeVoiceWav({
      length: pcm.length,
      sampleRate: 16000,
      numberOfChannels: 1,
      getChannelData: () => pcm,
    });
    expect(Buffer.from(wav).toString('base64')).toBe(fixture.webVoiceWavBase64);
  });
  it('resamples stereo to mono and clips PCM values without overflowing', () => {
    const channel = new Float32Array([2, 2, -2, -2]);
    const wav = encodeVoiceWav({
      length: 4,
      sampleRate: 32000,
      numberOfChannels: 2,
      getChannelData: () => channel,
    });
    const view = new DataView(wav);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });
  it.each(['image/jpeg', 'video/mp4', 'audio/mp4', 'audio/wav'])(
    'rejects %s at its exact Storage limit',
    (type) => {
      const limit = chatFileLimit(type)!;
      expect(() => validateChatFile({ type, size: limit - 1 })).not.toThrow();
      expect(() => validateChatFile({ type, size: limit })).toThrow();
      expect(() => validateChatFile({ type, size: 0 })).toThrow();
    },
  );
  it('blocks executable/local attachment links but allows emulator downloads', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hello',
      'file:///private/test',
      'http://evil.example/x',
    ])
      expect(safeChatURL(url)).toBeNull();
    expect(safeChatURL('http://127.0.0.1:9199/v0/b/test')).not.toBeNull();
  });
  it.each([
    ['dm_user_a_user_b', 'user_a', 'user_b'],
    ['dm_user_a_user_b', 'user_b', 'user_a'],
    ['dm_a_b_c', 'a', 'b_c'],
    ['dm_a_b_c', 'b_c', 'a'],
  ])('preserves UID delimiters in %s', (id, uid, other) => {
    expect(directParticipants(id, uid)).toEqual([uid, other].sort());
  });
});
