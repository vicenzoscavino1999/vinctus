// React hook for using the voice system
// Handles lifecycle, debouncing, and state management

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { WebSpeechProvider } from './WebSpeechProvider';
import type { VoiceState, VoiceConfig } from './types';

interface UseVoiceOptions extends Partial<VoiceConfig> {
  debounceMs?: number; // Debounce for interim results
}

interface UseVoiceReturn {
  // State
  state: VoiceState;
  isListening: boolean;
  isSpeaking: boolean;
  isSupported: boolean;

  // Interim text (while speaking)
  interimText: string;

  // Actions
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;

  // Error handling
  error: string | null;
  clearError: () => void;
}

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const { debounceMs = 100, lang, continuous, interimResults, ttsRate, ttsPitch } = options;

  const config = useMemo<VoiceConfig>(
    () => ({
      lang,
      continuous,
      interimResults,
      ttsRate,
      ttsPitch,
    }),
    [continuous, interimResults, lang, ttsPitch, ttsRate],
  );

  const [state, setState] = useState<VoiceState>('idle');
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const providerRef = useRef<WebSpeechProvider | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize provider
  useEffect(() => {
    const provider = new WebSpeechProvider(
      {
        onPartial: (text) => {
          // Debounce interim results to prevent excessive re-renders
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
          }
          debounceRef.current = setTimeout(() => {
            setInterimText(text);
          }, debounceMs);
        },
        onFinal: (text) => {
          // Clear debounce and set final text immediately
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
          }
          setInterimText(text);
        },
        onError: (err) => {
          setError(err);
        },
        onStateChange: (newState) => {
          setState(newState);
          // Clear interim text when no longer listening
          if (newState !== 'listening') {
            // Keep the text for a moment so user can see it
          }
        },
      },
      config,
    );

    providerRef.current = provider;
    setIsSupported(provider.isSupported());

    // Cleanup on unmount
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      provider.destroy();
      providerRef.current = null;
    };
  }, [config, debounceMs]);

  const startListening = useCallback(() => {
    setInterimText('');
    setError(null);
    providerRef.current?.startListening();
  }, []);

  const stopListening = useCallback(() => {
    providerRef.current?.stopListening();
  }, []);

  const speak = useCallback((text: string) => {
    setError(null);
    providerRef.current?.speak(text);
  }, []);

  const stopSpeaking = useCallback(() => {
    providerRef.current?.stopSpeaking();
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    state,
    isListening: state === 'listening',
    isSpeaking: state === 'speaking',
    isSupported,
    interimText,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    error,
    clearError,
  };
}
