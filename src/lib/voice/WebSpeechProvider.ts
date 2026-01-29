// WebSpeech Provider - Uses native browser APIs for STT and TTS
// Can be swapped with GeminiLiveProvider in the future

import {
    VoiceProvider,
    VoiceEvents,
    VoiceState,
    VoiceConfig,
    DEFAULT_VOICE_CONFIG
} from './types';

// Type definitions for Web Speech API (not fully typed in TS)
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message?: string;
}

type SpeechRecognitionType = {
    new(): SpeechRecognitionInstance;
};

interface SpeechRecognitionInstance extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
}

// Get SpeechRecognition constructor (webkit prefix for Safari)
const getSpeechRecognition = (): SpeechRecognitionType | null => {
    if (typeof window === 'undefined') return null;
    return (
        (window as unknown as { SpeechRecognition?: SpeechRecognitionType }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionType }).webkitSpeechRecognition ||
        null
    );
};

export class WebSpeechProvider implements VoiceProvider {
    private recognition: SpeechRecognitionInstance | null = null;
    private synthesis: SpeechSynthesis | null = null;
    private _currentUtterance: SpeechSynthesisUtterance | null = null;
    private state: VoiceState = 'idle';
    private events: VoiceEvents;
    private config: VoiceConfig;
    private supported: boolean = false;

    // Public getter to check if currently speaking (used for state tracking)
    get isSpeakingUtterance(): boolean {
        return this._currentUtterance !== null;
    }

    constructor(events: VoiceEvents = {}, config: Partial<VoiceConfig> = {}) {
        this.events = events;
        this.config = { ...DEFAULT_VOICE_CONFIG, ...config };
        this.initializeAPIs();
    }

    private initializeAPIs(): void {
        // Check browser support
        if (typeof window === 'undefined') {
            this.supported = false;
            this.setState('unsupported');
            return;
        }

        // Initialize SpeechRecognition
        const SpeechRecognitionClass = getSpeechRecognition();
        if (SpeechRecognitionClass) {
            this.recognition = new SpeechRecognitionClass();
            this.recognition.continuous = this.config.continuous ?? false;
            this.recognition.interimResults = this.config.interimResults ?? true;
            this.recognition.lang = this.config.lang ?? 'es-PE';
            this.setupRecognitionHandlers();
        }

        // Initialize SpeechSynthesis
        if ('speechSynthesis' in window) {
            this.synthesis = window.speechSynthesis;
        }

        this.supported = !!(this.recognition && this.synthesis);

        if (!this.supported) {
            this.setState('unsupported');
        }
    }

    private setupRecognitionHandlers(): void {
        if (!this.recognition) return;

        this.recognition.onstart = () => {
            this.setState('listening');
        };

        this.recognition.onresult = (event: SpeechRecognitionEvent) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // Emit partial results (interim)
            if (interimTranscript && this.events.onPartial) {
                this.events.onPartial(interimTranscript);
            }

            // Emit final results
            if (finalTranscript && this.events.onFinal) {
                this.events.onFinal(finalTranscript);
            }
        };

        this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            if (event.error === 'not-allowed' || event.error === 'permission-denied') {
                this.setState('denied');
                this.events.onError?.('Permiso de micrófono denegado. Actívalo en la configuración del navegador.');
            } else if (event.error === 'no-speech') {
                // Not really an error, just no speech detected
                this.events.onError?.('No se detectó voz. Intenta de nuevo.');
            } else if (event.error !== 'aborted') {
                this.events.onError?.(`Error de reconocimiento: ${event.error}`);
            }
        };

        this.recognition.onend = () => {
            if (this.state === 'listening') {
                this.setState('idle');
            }
        };
    }

    private setState(newState: VoiceState): void {
        if (this.state !== newState) {
            this.state = newState;
            this.events.onStateChange?.(newState);
        }
    }

    // ============ VoiceProvider Implementation ============

    startListening(): void {
        if (!this.recognition) {
            this.events.onError?.('Reconocimiento de voz no disponible en este navegador.');
            return;
        }

        if (this.state === 'listening') {
            return; // Already listening
        }

        // Stop any ongoing speech
        this.stopSpeaking();

        try {
            this.recognition.start();
        } catch (error) {
            // Already started, ignore
            console.warn('Recognition already started');
        }
    }

    stopListening(): void {
        if (this.recognition && this.state === 'listening') {
            try {
                this.recognition.stop();
            } catch {
                // Ignore errors when stopping
            }
            this.setState('idle');
        }
    }

    speak(text: string): void {
        if (!this.synthesis) {
            this.events.onError?.('Síntesis de voz no disponible en este navegador.');
            return;
        }

        // Stop any ongoing speech
        this.stopSpeaking();

        // Split long text into chunks (prevents browser TTS hanging)
        const chunks = this.splitTextIntoChunks(text);
        this.speakChunks(chunks);
    }

    private splitTextIntoChunks(text: string): string[] {
        // Split by sentences (. ! ?) but keep punctuation
        const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];

        // If a sentence is still too long, split by commas
        const chunks: string[] = [];
        for (const sentence of sentences) {
            if (sentence.length > 150) {
                const subChunks = sentence.split(/,\s*/);
                chunks.push(...subChunks.filter(s => s.trim()));
            } else {
                chunks.push(sentence.trim());
            }
        }

        return chunks.filter(c => c.length > 0);
    }

    private speakChunks(chunks: string[]): void {
        if (chunks.length === 0) {
            this.setState('idle');
            return;
        }

        const [current, ...remaining] = chunks;

        const utterance = new SpeechSynthesisUtterance(current);
        utterance.lang = this.config.lang ?? 'es-PE';
        utterance.rate = this.config.ttsRate ?? 1.0;
        utterance.pitch = this.config.ttsPitch ?? 1.0;

        // Try to find a Spanish voice
        const voices = this.synthesis?.getVoices() || [];
        const spanishVoice = voices.find(v =>
            v.lang.startsWith('es-PE') ||
            v.lang.startsWith('es-ES') ||
            v.lang.startsWith('es')
        );
        if (spanishVoice) {
            utterance.voice = spanishVoice;
        }

        this._currentUtterance = utterance;

        utterance.onstart = () => {
            this.setState('speaking');
        };

        utterance.onend = () => {
            if (remaining.length > 0) {
                this.speakChunks(remaining);
            } else {
                this.setState('idle');
                this._currentUtterance = null;
            }
        };

        utterance.onerror = () => {
            this.setState('idle');
            this._currentUtterance = null;
        };

        this.synthesis?.speak(utterance);
    }

    stopSpeaking(): void {
        if (this.synthesis) {
            this.synthesis.cancel();
            this._currentUtterance = null;
            if (this.state === 'speaking') {
                this.setState('idle');
            }
        }
    }

    getState(): VoiceState {
        return this.state;
    }

    isSupported(): boolean {
        return this.supported;
    }

    destroy(): void {
        this.stopListening();
        this.stopSpeaking();
        this.recognition = null;
        this.synthesis = null;
    }
}
