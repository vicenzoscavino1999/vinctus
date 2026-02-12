import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';

export type AIConsentSource = 'settings' | 'ai_chat' | 'arena' | 'migration';

export interface ServerAIConsentRead {
  granted: boolean;
  recorded: boolean;
  source: AIConsentSource | null;
  updatedAt: Date | null;
}

interface UserDocSettingsAI {
  consentGranted?: unknown;
  consentSource?: unknown;
  consentUpdatedAt?: unknown;
}

interface UserDocShape {
  settings?: {
    ai?: UserDocSettingsAI;
  };
}

export const DEFAULT_SERVER_AI_CONSENT: ServerAIConsentRead = {
  granted: false,
  recorded: false,
  source: null,
  updatedAt: null,
};

const toDateOrNull = (value: unknown): Date | null => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
};

const normalizeSource = (value: unknown): AIConsentSource | null => {
  if (value === 'settings') return 'settings';
  if (value === 'ai_chat') return 'ai_chat';
  if (value === 'arena') return 'arena';
  if (value === 'migration') return 'migration';
  return null;
};

export const getServerAIConsent = async (uid: string): Promise<ServerAIConsentRead> => {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    return DEFAULT_SERVER_AI_CONSENT;
  }

  const data = snap.data() as UserDocShape;
  const aiSettings = data.settings?.ai;
  const recorded = typeof aiSettings?.consentGranted === 'boolean';

  return {
    granted: recorded ? aiSettings?.consentGranted === true : false,
    recorded,
    source: normalizeSource(aiSettings?.consentSource),
    updatedAt: toDateOrNull(aiSettings?.consentUpdatedAt),
  };
};

export const setServerAIConsent = async (
  uid: string,
  input: { granted: boolean; source: AIConsentSource },
): Promise<void> => {
  await setDoc(
    doc(db, 'users', uid),
    {
      settings: {
        ai: {
          consentGranted: input.granted,
          consentSource: input.source,
          consentUpdatedAt: serverTimestamp(),
        },
      },
      updatedAt: serverTimestamp(),
    },
    {
      mergeFields: [
        'settings.ai.consentGranted',
        'settings.ai.consentSource',
        'settings.ai.consentUpdatedAt',
        'updatedAt',
      ],
    },
  );
};
