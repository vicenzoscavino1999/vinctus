import type { VercelRequest, VercelResponse } from '@vercel/node';

// Gemini API configuration
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

interface GeminiMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

interface ChatRequest {
    message: string;
    history?: GeminiMessage[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get API key from environment (server-side only, never exposed to client)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('GEMINI_API_KEY not configured');
        return res.status(500).json({ error: 'AI service not configured' });
    }

    try {
        const { message, history = [] } = req.body as ChatRequest;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Build conversation with history
        const contents: GeminiMessage[] = [
            ...history,
            { role: 'user', parts: [{ text: message }] }
        ];

        // System instruction for the assistant
        const systemInstruction = {
            parts: [{
                text: `Eres un asistente inteligente y amable integrado en Vinctus, una plataforma social de comunidades de conocimiento. 
Ayudas a los usuarios con cualquier pregunta que tengan.
Responde de forma clara, concisa y útil.
Si te preguntan sobre Vinctus, explica que es una red social enfocada en compartir conocimiento y conectar personas con intereses similares.
Responde siempre en español a menos que el usuario escriba en otro idioma.`
            }]
        };

        // Call Gemini API
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents,
                systemInstruction,
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                }
            }),
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('Gemini API error:', errorData);
            return res.status(500).json({ error: 'Error communicating with AI service' });
        }

        const data = await response.json();

        // Extract the response text
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Lo siento, no pude generar una respuesta.';

        return res.status(200).json({
            response: responseText,
            // Return updated history for context
            history: [
                ...contents,
                { role: 'model', parts: [{ text: responseText }] }
            ]
        });

    } catch (error) {
        console.error('Chat API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
