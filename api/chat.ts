import type { VercelRequest, VercelResponse } from '@vercel/node';

// Gemini API configuration - Models in order of preference
const GEMINI_MODELS = [
    'gemini-3-flash-preview',  // Best quality, limited quota
    'gemini-flash-latest'       // Fallback, higher quota
];

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

interface ChatRequest {
    message: string;
    history?: GeminiMessage[];
}

async function callGeminiAPI(
    model: string,
    apiKey: string,
    contents: GeminiMessage[],
    systemInstruction: { parts: { text: string }[] }
): Promise<{ ok: boolean; data?: unknown; error?: string; isRateLimit?: boolean }> {
    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(url, {
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
            const errorText = await response.text();
            const isRateLimit = response.status === 429 ||
                errorText.includes('RESOURCE_EXHAUSTED') ||
                errorText.includes('quota') ||
                errorText.includes('rate limit');
            return { ok: false, error: errorText, isRateLimit };
        }

        const data = await response.json();
        return { ok: true, data };
    } catch (error) {
        return { ok: false, error: String(error), isRateLimit: false };
    }
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

        // Try models in order, fallback if rate limited
        let result: { ok: boolean; data?: unknown; error?: string } | null = null;
        let usedModel = '';

        for (const model of GEMINI_MODELS) {
            console.log(`Trying model: ${model}`);
            result = await callGeminiAPI(model, apiKey, contents, systemInstruction);
            usedModel = model;

            if (result.ok) {
                console.log(`Success with model: ${model}`);
                break;
            }

            if (result.isRateLimit) {
                console.log(`Rate limited on ${model}, trying next...`);
                continue;
            }

            // Non-rate-limit error, still try next model
            console.error(`Error with ${model}:`, result.error);
        }

        if (!result?.ok) {
            console.error('All models failed');
            return res.status(500).json({ error: 'Error communicating with AI service' });
        }

        const data = result.data as { candidates?: { content?: { parts?: { text?: string }[] } }[] };

        // Extract the response text
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Lo siento, no pude generar una respuesta.';

        return res.status(200).json({
            response: responseText,
            model: usedModel, // Include which model was used (for debugging)
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
