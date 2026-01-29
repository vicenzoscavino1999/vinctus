// AI Chat service - calls the secure proxy endpoint

interface GeminiMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

interface ChatResponse {
    response: string;
    history: GeminiMessage[];
}

/**
 * Send a message to the AI chat via secure proxy
 * The API key is never exposed to the client
 */
export async function sendChatMessage(
    message: string,
    history: GeminiMessage[] = []
): Promise<ChatResponse> {
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, history }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Error al comunicarse con el asistente');
    }

    return response.json();
}

export type { GeminiMessage, ChatResponse };
