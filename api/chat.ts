import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuth } from './lib/firebaseAdmin.js';
import { createGroupAction, type CreateGroupArgs } from './lib/aiActions.js';

// Gemini API configuration - Models in order of preference
const GEMINI_MODELS = [
    'gemini-2.0-flash',         // Primary (function calling, better quotas)
    'gemini-flash-latest'       // Fallback
];

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

interface GeminiFunctionCall {
    name: string;
    args?: Record<string, unknown>;
}

interface ChatRequest {
    message: string;
    history?: GeminiMessage[];
    idToken?: string;
}

const GEMINI_TOOLS = [
    {
        functionDeclarations: [
            {
                name: 'createGroup',
                description: 'Crea un grupo en Vinctus para el usuario autenticado.',
                parameters: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Nombre del grupo' },
                        description: { type: 'string', description: 'Descripcion del grupo' },
                        visibility: { type: 'string', enum: ['public', 'private'] }
                    },
                    required: ['name']
                }
            }
        ]
    }
];

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
                tools: GEMINI_TOOLS,
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

async function readRawBody(req: VercelRequest): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => {
            data += chunk;
        });
        req.on('end', () => resolve(data));
        req.on('error', (err) => reject(err));
    });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get API key from environment (server-side only, never exposed to client)
    const apiKeyRaw = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    const apiKey = apiKeyRaw ? apiKeyRaw.trim().replace(/^['"]|['"]$/g, '') : undefined;
    if (!apiKey) {
        console.error('GEMINI_API_KEY not configured');
        return res.status(500).json({ error: 'AI service not configured' });
    }

    try {
        let body: Partial<ChatRequest> = {};
        let rawBody: string | undefined;

        try {
            if (req.body && typeof req.body === 'object') {
                body = req.body as ChatRequest;
            } else if (typeof req.body === 'string') {
                rawBody = req.body;
            }
        } catch {
            return res.status(400).json({ error: 'Invalid JSON body' });
        }

        if (!rawBody && !Object.keys(body).length) {
            rawBody = await readRawBody(req);
        }

        if (rawBody) {
            try {
                body = JSON.parse(rawBody) as ChatRequest;
            } catch {
                return res.status(400).json({ error: 'Invalid JSON body' });
            }
        }

        const message = body.message;
        const history = Array.isArray(body.history) ? body.history : [];
        const idToken = typeof body.idToken === 'string' ? body.idToken : undefined;

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
Si el usuario pide crear un grupo, utiliza la herramienta createGroup con los datos solicitados.
Responde siempre en español a menos que el usuario escriba en otro idioma.`
            }]
        };

        // Try models in order, fallback if rate limited
        let result: { ok: boolean; data?: unknown; error?: string; isRateLimit?: boolean } | null = null;
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
            return res.status(502).json({
                error: 'Error communicating with AI service',
                details: result?.error ?? null
            });
        }

        const data = result.data as {
            candidates?: { content?: { parts?: Array<{ text?: string; functionCall?: GeminiFunctionCall }> } }[]
        };

        const parts = data.candidates?.[0]?.content?.parts ?? [];
        const functionCall = parts.find((part) => part.functionCall)?.functionCall;

        if (functionCall?.name === 'createGroup') {
            let uid: string | null = null;
            let authErrorCode: string | null = null;
            const authHeader = req.headers.authorization;
            const tokenFromHeader = authHeader?.startsWith('Bearer ')
                ? authHeader.slice('Bearer '.length)
                : authHeader;
            const token = (tokenFromHeader ?? idToken)?.trim();

            if (token) {
                try {
                    const auth = getAuth();
                    const decoded = await auth.verifyIdToken(token);
                    uid = decoded.uid;
                } catch (authError) {
                    authErrorCode = (authError as { code?: string }).code ?? null;
                    console.error('Invalid auth token for function call', authError);
                }
            }

            if (!uid) {
                const noAuthResponse = 'Necesitas iniciar sesión para crear un grupo.';
                return res.status(401).json({
                    response: noAuthResponse,
                    model: usedModel,
                    authError: authErrorCode,
                    history: [
                        ...contents,
                        { role: 'model', parts: [{ text: noAuthResponse }] }
                    ]
                });
            }

            const rawArgs = (functionCall.args ?? {}) as Record<string, unknown>;
            const args: CreateGroupArgs = {
                name: typeof rawArgs.name === 'string' ? rawArgs.name : '',
                description: typeof rawArgs.description === 'string' ? rawArgs.description : null,
                visibility: rawArgs.visibility === 'private' ? 'private' : 'public'
            };
            try {
                const result = await createGroupAction(uid, args);
                const confirmation = `Listo. Creé el grupo "${result.name}" (${result.visibility}). Puedes verlo en /group/${result.groupId}.`;
                return res.status(200).json({
                    response: confirmation,
                    model: usedModel,
                    history: [
                        ...contents,
                        { role: 'model', parts: [{ text: confirmation }] }
                    ],
                    action: { type: 'createGroup', groupId: result.groupId }
                });
            } catch (actionError) {
                console.error('createGroup action failed', actionError);
                const failText = 'No pude crear el grupo. Intenta con otro nombre o descripcion.';
                return res.status(500).json({
                    response: failText,
                    model: usedModel,
                    history: [
                        ...contents,
                        { role: 'model', parts: [{ text: failText }] }
                    ]
                });
            }
        }

        // Extract the response text
        const responseText = parts.find((part) => part.text)?.text || 'Lo siento, no pude generar una respuesta.';

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

export const config = {
    runtime: 'nodejs',
    api: {
        bodyParser: false
    }
};
