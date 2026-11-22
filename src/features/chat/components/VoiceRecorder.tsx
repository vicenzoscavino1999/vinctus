import { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { encodeVoiceWav } from '@/shared/lib/chat-media';

type Props = { disabled: boolean; onFile: (file: File) => void; onBusy: (busy: boolean) => void };
export default function VoiceRecorder({ disabled, onFile, onBusy }: Props) {
  const [phase, setPhase] = useState<'idle' | 'permission' | 'recording' | 'processing'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef({ value: 0 });
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  const stopTimers = () => {
    timers.current.forEach(clearInterval);
    timers.current = [];
  };
  const stopTracks = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };
  useEffect(() => {
    const lifetime = generation.current;
    const finish = () => {
      if (document.hidden && recorder.current?.state === 'recording') recorder.current.stop();
    };
    document.addEventListener('visibilitychange', finish);
    return () => {
      lifetime.value++;
      stopTimers();
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stopTracks();
      document.removeEventListener('visibilitychange', finish);
    };
  }, []);
  const cancel = () => {
    generation.current.value++;
    stopTimers();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stopTracks();
    setPhase('idle');
    onBusy(false);
  };
  const start = async () => {
    if (disabled || phase !== 'idle') return;
    const token = ++generation.current.value;
    setError(null);
    setPhase('permission');
    onBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error(
          'Este navegador no permite grabar audio. Puedes adjuntar un archivo de audio.',
        );
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation.current.value !== token) {
        input.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = input;
      const type = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ].find((value) => MediaRecorder.isTypeSupported(value));
      const recording = new MediaRecorder(input, type ? { mimeType: type } : undefined);
      recorder.current = recording;
      const chunks: Blob[] = [];
      let size = 0;
      recording.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
          size += event.data.size;
          if (size > 10 * 1024 * 1024 && recording.state === 'recording') recording.stop();
        }
      };
      recording.onerror = () => {
        if (generation.current.value === token) {
          cancel();
          setError('No se pudo grabar el audio. Inténtalo de nuevo.');
        }
      };
      recording.onstop = () => {
        input.getTracks().forEach((track) => track.stop());
        if (stream.current === input) stream.current = null;
        if (generation.current.value !== token) return;
        stopTimers();
        setPhase('processing');
        void (async () => {
          let context: AudioContext | undefined;
          try {
            context = new AudioContext();
            const decoded = await context.decodeAudioData(
              await new Blob(chunks, { type: recording.mimeType }).arrayBuffer(),
            );
            const wav = encodeVoiceWav(decoded);
            if (generation.current.value === token)
              onFile(new File([wav], 'Nota de voz.wav', { type: 'audio/wav' }));
          } catch {
            if (generation.current.value === token)
              setError('No se pudo preparar la nota de voz. Inténtalo de nuevo.');
          } finally {
            await context?.close().catch(() => {});
            if (generation.current.value === token) {
              setPhase('idle');
              onBusy(false);
            }
          }
        })();
      };
      recording.start(1000);
      setSeconds(0);
      setPhase('recording');
      const began = Date.now();
      timers.current.push(
        setInterval(() => {
          const elapsed = Math.floor((Date.now() - began) / 1000);
          setSeconds(Math.min(300, elapsed));
          if (elapsed >= 300 && recording.state === 'recording') recording.stop();
        }, 250),
      );
    } catch (problem) {
      if (generation.current.value !== token) return;
      stopTracks();
      stopTimers();
      setPhase('idle');
      onBusy(false);
      setError(
        problem instanceof DOMException && problem.name === 'NotAllowedError'
          ? 'Activa el permiso de micrófono del navegador para grabar.'
          : problem instanceof Error
            ? problem.message
            : 'No se pudo iniciar la grabación.',
      );
    }
  };
  return (
    <div className="space-y-1">
      {phase === 'idle' ? (
        <button
          type="button"
          aria-label="Grabar nota de voz"
          disabled={disabled}
          onClick={() => {
            void start();
          }}
          className="p-3 rounded-full bg-neutral-800 disabled:opacity-40"
        >
          <Mic size={20} />
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span role="status">
            {phase === 'permission'
              ? 'Esperando permiso…'
              : phase === 'processing'
                ? 'Preparando audio…'
                : `Grabando ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} / 5:00`}
          </span>
          <button type="button" onClick={cancel}>
            Cancelar grabación
          </button>
          {phase === 'recording' && (
            <button type="button" onClick={() => recorder.current?.stop()}>
              Terminar grabación
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
