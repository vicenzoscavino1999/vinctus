import { useCallback, useEffect, useRef, useState } from 'react';
import { getAIConsent, setAIConsent } from '@/shared/lib/aiConsent';
import { getServerAIConsent, updateServerAIConsent } from '@/features/settings/api/aiConsent';

/**
 * Whether the person agreed to send their messages to the AI providers, shared by Chat con IA
 * and Arena. The server's record wins; a consent saved only on this device is migrated to it.
 */
export function useAIConsent(userId: string | null, source: 'ai_chat' | 'arena') {
  const [granted, setGranted] = useState(() => (userId ? getAIConsent(userId).granted : false));
  /** Checking the server's record. */
  const [checking, setChecking] = useState(Boolean(userId));
  /** Saving "Aceptar y continuar". */
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const check = useCallback(async () => {
    if (!userId) {
      setGranted(false);
      setChecking(false);
      setError(null);
      return;
    }
    const local = getAIConsent(userId);
    setError(null);
    setChecking(true);
    try {
      const server = await getServerAIConsent(userId);
      if (!mounted.current) return;
      if (server.recorded) {
        setAIConsent(server.granted, userId);
        setGranted(server.granted);
        return;
      }
      if (local.granted) {
        await updateServerAIConsent(userId, true, 'migration');
        if (!mounted.current) return;
        setGranted(true);
      } else {
        setGranted(false);
      }
    } catch (problem) {
      console.error('Error syncing AI consent:', problem);
      if (mounted.current) {
        setError('No se pudo verificar tu consentimiento de IA. Intenta de nuevo.');
      }
    } finally {
      if (mounted.current) setChecking(false);
    }
  }, [userId]);

  useEffect(() => {
    void check();
  }, [check]);

  const accept = useCallback(async () => {
    setError(null);
    setSaving(true);
    try {
      if (!userId) throw new Error('Debes iniciar sesión para guardar el consentimiento.');
      await updateServerAIConsent(userId, true, source);
      if (!mounted.current) return;
      setAIConsent(true, userId);
      setGranted(true);
    } catch (problem) {
      console.error('Error accepting AI consent:', problem);
      if (!mounted.current) return;
      setGranted(false);
      setError('No se pudo guardar tu consentimiento de IA. Intenta de nuevo.');
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [userId, source]);

  return {
    granted,
    checking,
    saving,
    /** Checking or saving: the AI cannot be used yet. */
    busy: checking || saving,
    error,
    retry: check,
    accept,
  };
}
