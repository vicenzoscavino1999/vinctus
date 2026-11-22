const LEGACY_AI_CONSENT_KEY = 'vinctus:ai-consent:v1';
const USER_AI_CONSENT_PREFIX = 'vinctus:ai-consent:v2:';

type AIConsentStorageShape = {
  granted: boolean;
  updatedAt: string | null;
};

const defaultConsent = (): AIConsentStorageShape => ({
  granted: false,
  updatedAt: null,
});

const canUseStorage = (): boolean => typeof window !== 'undefined' && !!window.localStorage;

const resolveKey = (uid?: string | null): string => {
  const normalized = typeof uid === 'string' ? uid.trim() : '';
  return normalized ? `${USER_AI_CONSENT_PREFIX}${normalized}` : LEGACY_AI_CONSENT_KEY;
};

export const getAIConsent = (uid?: string | null): AIConsentStorageShape => {
  if (!canUseStorage()) return defaultConsent();

  try {
    const raw = window.localStorage.getItem(resolveKey(uid));
    if (!raw) return defaultConsent();
    const parsed = JSON.parse(raw) as Partial<AIConsentStorageShape> | null;
    if (!parsed || typeof parsed.granted !== 'boolean') {
      return defaultConsent();
    }
    return {
      granted: parsed.granted,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch {
    return defaultConsent();
  }
};

export const setAIConsent = (granted: boolean, uid?: string | null): AIConsentStorageShape => {
  const next: AIConsentStorageShape = {
    granted,
    updatedAt: new Date().toISOString(),
  };

  if (!canUseStorage()) {
    return next;
  }

  window.localStorage.setItem(resolveKey(uid), JSON.stringify(next));
  return next;
};

export const hasAIConsent = (uid?: string | null): boolean => getAIConsent(uid).granted;
