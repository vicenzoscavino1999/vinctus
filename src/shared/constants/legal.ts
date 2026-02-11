const normalizeValue = (value: string | undefined, fallback: string): string => {
  const raw = (value ?? '').trim();
  return raw.length > 0 ? raw : fallback;
};

export const LEGAL_LINKS = {
  privacyPolicyPublicUrl: normalizeValue(
    import.meta.env.VITE_PRIVACY_POLICY_URL,
    'https://vinctus.app/privacy',
  ),
  termsOfServicePublicUrl: normalizeValue(
    import.meta.env.VITE_TERMS_OF_SERVICE_URL,
    'https://vinctus.app/terms',
  ),
  communityGuidelinesPublicUrl: normalizeValue(
    import.meta.env.VITE_COMMUNITY_GUIDELINES_URL,
    'https://vinctus.app/community-guidelines',
  ),
  supportPublicUrl: normalizeValue(import.meta.env.VITE_SUPPORT_URL, 'https://vinctus.app/support'),
  supportEmail: normalizeValue(import.meta.env.VITE_SUPPORT_EMAIL, 'support@vinctus.app'),
  securityEmail: normalizeValue(import.meta.env.VITE_SECURITY_EMAIL, 'security@vinctus.app'),
} as const;

export const LEGAL_COPY = {
  aiDisclosure:
    'Las funciones de IA usan proveedores externos (Google Gemini / NVIDIA). Los mensajes que escribes en IA se envian para generar respuestas.',
  aiConsent:
    'Debes aceptar el envio de mensajes a proveedores externos de IA antes de usar AI Chat o Arena IA.',
  moderationSla: 'Moderacion: prioridad alta (riesgo de seguridad) <= 24h; prioridad media <= 72h.',
  moderationNotice:
    'Los reportes y bloqueos se evaluan segun las Community Guidelines y podemos retirar contenido o limitar cuentas.',
  lastUpdated: '2026-02-11',
} as const;
