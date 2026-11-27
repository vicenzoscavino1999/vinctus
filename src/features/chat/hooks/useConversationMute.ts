import { useCallback, useEffect, useState } from 'react';
import {
  clearConversationMute,
  getConversationMember,
  setConversationMute,
} from '@/features/chat/api';
import { muteStatusText } from '@/features/chat/model/chatDetails';
import { useToast } from '@/shared/ui/Toast';

type MuteState = { key: string; muted: boolean; mutedUntil: Date | null };

/**
 * Whether the person silenced this conversation, and the ways to change it. A mute whose time has
 * passed is cleared when the screen opens.
 */
export function useConversationMute(conversationId: string | null, uid: string | null) {
  const { showToast } = useToast();
  const key = JSON.stringify([conversationId, uid]);
  const [state, setState] = useState<MuteState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!conversationId || !uid) return;
    let active = true;
    void (async () => {
      try {
        const member = await getConversationMember(conversationId, uid);
        if (!active || !member) return;
        if (member.muted && member.mutedUntil && member.mutedUntil < new Date()) {
          await clearConversationMute(conversationId, uid);
          if (active) setState({ key, muted: false, mutedUntil: null });
          return;
        }
        setState({ key, muted: !!member.muted, mutedUntil: member.mutedUntil ?? null });
      } catch (error) {
        console.error('Error loading the conversation mute:', error);
      }
    })();
    return () => {
      active = false;
    };
  }, [conversationId, uid, key]);

  const current = state?.key === key ? state : null;

  const mute = useCallback(
    async (hours: number | null) => {
      if (!conversationId || !uid) return false;
      setBusy(true);
      try {
        const mutedUntil = hours ? new Date(Date.now() + hours * 3_600_000) : null;
        await setConversationMute(conversationId, uid, mutedUntil);
        setState({ key, muted: true, mutedUntil });
        showToast('Conversación silenciada', 'success');
        return true;
      } catch (error) {
        console.error('Error muting the conversation:', error);
        showToast('No se pudo silenciar', 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [conversationId, uid, key, showToast],
  );

  const unmute = useCallback(async () => {
    if (!conversationId || !uid) return;
    setBusy(true);
    try {
      await clearConversationMute(conversationId, uid);
      setState({ key, muted: false, mutedUntil: null });
      showToast('Silencio desactivado', 'success');
    } catch (error) {
      console.error('Error unmuting the conversation:', error);
      showToast('No se pudo quitar el silencio', 'error');
    } finally {
      setBusy(false);
    }
  }, [conversationId, uid, key, showToast]);

  const muted = !!current?.muted;
  return {
    /** Known once the member document loaded. */
    loaded: !!current,
    muted,
    statusText: muteStatusText(muted, current?.mutedUntil ?? null),
    busy,
    mute,
    unmute,
  };
}
