const AI_CONSENT_KEY = 'vinctus:ai-consent:v1';

type AIConsentStorageShape = {
  granted: boolean;
  updatedAt: string | null;
};

const defaultConsent = (): AIConsentStorageShape => ({
  granted: false,
  updatedAt: null,
});

const canUseStorage = (): boolean => typeof window !== 'undefined' && !!window.localStorage;

export const getAIConsent = (): AIConsentStorageShape => {
  if (!canUseStorage()) return defaultConsent();

  try {
    const raw = window.localStorage.getItem(AI_CONSENT_KEY);
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

export const setAIConsent = (granted: boolean): AIConsentStorageShape => {
  const next: AIConsentStorageShape = {
    granted,
    updatedAt: new Date().toISOString(),
  };

  if (!canUseStorage()) {
    return next;
  }

  window.localStorage.setItem(AI_CONSENT_KEY, JSON.stringify(next));
  return next;
};

export const hasAIConsent = (): boolean => getAIConsent().granted;
