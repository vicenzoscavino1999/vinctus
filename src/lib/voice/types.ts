// Voice types and interfaces for Vinctus AI Chat
// Designed to be swappable between WebSpeech API and Gemini Live API

export type VoiceState = 'idle' | 'listening' | 'speaking' | 'denied' | 'unsupported';

export interface VoiceEvents {
    onPartial?: (text: string) => void;      // Interim text while speaking
    onFinal?: (text: string) => void;        // Final transcription
    onError?: (error: string) => void;       // Error messages
    onStateChange?: (state: VoiceState) => void;  // State changes
}

export interface VoiceProvider {
    // Speech-to-Text
    startListening(): void;
    stopListening(): void;

    // Text-to-Speech  
    speak(text: string): void;
    stopSpeaking(): void;

    // State
    getState(): VoiceState;
    isSupported(): boolean;

    // Cleanup
    destroy(): void;
}

export interface VoiceConfig {
    lang?: string;           // e.g., 'es-PE', 'es-ES'
    continuous?: boolean;    // Keep listening after final result
    interimResults?: boolean; // Show partial results
    ttsRate?: number;        // Speech rate (0.1 - 10)
    ttsPitch?: number;       // Voice pitch (0 - 2)
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
    lang: 'es-PE',
    continuous: false,
    interimResults: true,
    ttsRate: 1.0,
    ttsPitch: 1.0,
};
