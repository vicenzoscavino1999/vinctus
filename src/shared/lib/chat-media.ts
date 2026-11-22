import {
  STORAGE_CONTENT_TYPES as TYPES,
  STORAGE_MAX_BYTES as MAX,
} from './firestore/firestoreContract';

export const chatFileLimit = (type: string): number | null => {
  if (TYPES.image.includes(type)) return MAX.image;
  if (TYPES.video.includes(type)) return MAX.chatVideo;
  if (TYPES.chatAudio.includes(type)) return MAX.chatAudio;
  if (TYPES.chatFile.includes(type)) return MAX.file;
  return null;
};

export const validateChatFile = (file: Pick<File, 'type' | 'size'>) => {
  const raw = file.type.split(';')[0].trim().toLowerCase();
  const aliases: Record<string, string> = {
    'audio/x-m4a': 'audio/mp4',
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/mp3': 'audio/mpeg',
    'audio/x-aac': 'audio/aac',
    'image/jpg': 'image/jpeg',
    'video/x-m4v': 'video/mp4',
  };
  const type = aliases[raw] ?? raw;
  const limit = chatFileLimit(type);
  if (!limit || file.size <= 0)
    throw new Error('El archivo está vacío o su formato no es compatible.');
  if (file.size >= limit)
    throw new Error(`El archivo debe pesar menos de ${limit / 1024 / 1024} MB.`);
  return type;
};

export const safeChatURL = (value: string): string | null => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ||
      (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      ? url.href
      : null;
  } catch {
    return null;
  }
};

// Mono 16-bit PCM at 16 kHz: five minutes stay below the shared 10 MB audio limit.
// WAV avoids sending browser-specific voice codecs that the iPhone player cannot decode.
export const encodeVoiceWav = (
  audio: Pick<AudioBuffer, 'length' | 'sampleRate' | 'numberOfChannels' | 'getChannelData'>,
): ArrayBuffer => {
  const rate = 16000;
  const count = Math.min(rate * 300, Math.floor((audio.length * rate) / audio.sampleRate));
  if (!count) throw new Error('La nota de voz debe durar como máximo cinco minutos.');
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, count * 2, true);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
    audio.getChannelData(i),
  );
  for (let i = 0; i < count; i++) {
    // Average the source interval when downsampling, then mix channels to mono.
    const start = Math.floor((i * audio.sampleRate) / rate);
    const end = Math.min(
      audio.length,
      Math.max(start + 1, Math.floor(((i + 1) * audio.sampleRate) / rate)),
    );
    let sample = 0;
    for (const channel of channels) for (let j = start; j < end; j++) sample += channel[j];
    sample = Math.max(-1, Math.min(1, sample / ((end - start) * channels.length)));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return buffer;
};
