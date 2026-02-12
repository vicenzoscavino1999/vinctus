import { beforeEach, describe, expect, it } from 'vitest';
import { getAIConsent, hasAIConsent, setAIConsent } from '@/shared/lib/aiConsent';

const AI_CONSENT_KEY = 'vinctus:ai-consent:v1';

describe('aiConsent', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns default consent when no value exists', () => {
    expect(getAIConsent()).toEqual({
      granted: false,
      updatedAt: null,
    });
    expect(hasAIConsent()).toBe(false);
  });

  it('persists granted consent', () => {
    const result = setAIConsent(true);
    expect(result.granted).toBe(true);
    expect(typeof result.updatedAt).toBe('string');

    const stored = window.localStorage.getItem(AI_CONSENT_KEY);
    expect(stored).toBeTruthy();
    expect(getAIConsent().granted).toBe(true);
    expect(hasAIConsent()).toBe(true);
  });

  it('handles malformed storage safely', () => {
    window.localStorage.setItem(AI_CONSENT_KEY, '{invalid_json}');
    expect(getAIConsent()).toEqual({
      granted: false,
      updatedAt: null,
    });
  });
});
