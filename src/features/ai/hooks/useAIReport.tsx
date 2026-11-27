import { useState } from 'react';
import { useAuth } from '@/context/auth';
import { reportAIResponse, type UserReportReason } from '@/features/ai/api';
import ContentReportModal from '@/features/posts/components/ContentReportModal';
import { useToast } from '@/shared/ui/Toast';

type Target = { contextId: string; excerpt: string };

/**
 * "Reportar" on an AI reply: the reason form and sending it to moderation, like the native app's
 * "Denunciar respuesta". Render `modal` once next to the buttons that call `report`.
 */
export function useAIReport() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState<UserReportReason>('spam');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const report = (next: Target) => {
    if (!user) {
      showToast('Inicia sesión para reportar', 'info');
      return;
    }
    setTarget(next);
    setReason('spam');
    setDetails('');
    setError(null);
  };

  const close = () => {
    if (submitting) return;
    setTarget(null);
  };

  const submit = async () => {
    if (!user || !target) return;
    setSubmitting(true);
    setError(null);
    try {
      await reportAIResponse({
        reporterUid: user.uid,
        contextId: target.contextId,
        excerpt: target.excerpt,
        reason,
        details: details.trim() || null,
      });
      showToast('Reporte enviado', 'success');
      setTarget(null);
    } catch (problem) {
      console.error('Error reporting an AI reply:', problem);
      setError('No se pudo enviar el reporte.');
    } finally {
      setSubmitting(false);
    }
  };

  const modal = (
    <ContentReportModal
      open={!!target}
      targetLabel="respuesta de IA"
      reason={reason}
      details={details}
      error={error}
      isSubmitting={submitting}
      onClose={close}
      onReasonChange={setReason}
      onDetailsChange={setDetails}
      onSubmit={() => void submit()}
    />
  );

  return { report, modal };
}
