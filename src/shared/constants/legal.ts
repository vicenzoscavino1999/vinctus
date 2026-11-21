const normalizeValue = (value: string | undefined, fallback: string): string => {
  const raw = (value ?? '').trim();
  return raw.length > 0 ? raw : fallback;
};

export const LEGAL_LINKS = {
  privacyPolicyPublicUrl: normalizeValue(import.meta.env.VITE_PRIVACY_POLICY_URL, '/privacy.html'),
  termsOfServicePublicUrl: normalizeValue(import.meta.env.VITE_TERMS_OF_SERVICE_URL, '/terms.html'),
  communityGuidelinesPublicUrl: normalizeValue(
    import.meta.env.VITE_COMMUNITY_GUIDELINES_URL,
    '/community-guidelines.html',
  ),
  supportPublicUrl: normalizeValue(import.meta.env.VITE_SUPPORT_URL, '/support.html'),
  supportEmail: normalizeValue(import.meta.env.VITE_SUPPORT_EMAIL, 'support@vinctus.app'),
  securityEmail: normalizeValue(import.meta.env.VITE_SECURITY_EMAIL, 'security@vinctus.app'),
} as const;

export const LEGAL_COPY = {
  aiDisclosure:
    'Las funciones de IA usan proveedores externos (Google Gemini, NVIDIA y, si lo seleccionas en el chat, OpenAI). Los mensajes que escribes en IA se envían para generar respuestas.',
  aiConsent:
    'Debes aceptar el envío de mensajes a proveedores externos de IA antes de usar AI Chat o Arena IA.',
  moderationSla: 'Moderación: prioridad alta (riesgo de seguridad) <= 24h; prioridad media <= 72h.',
  moderationNotice:
    'Los reportes y bloqueos se evalúan según las Normas de la comunidad y podemos retirar contenido o limitar cuentas.',
  lastUpdated: '2026-11-21',
} as const;
