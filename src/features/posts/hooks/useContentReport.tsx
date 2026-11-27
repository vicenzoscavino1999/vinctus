import { useState } from 'react';
import { useAuth } from '@/context/auth';
import {
  createPostCommentReport,
  createPostReport,
  type PostCommentRead,
  type UserReportReason,
} from '@/features/posts/api';
import ContentReportModal from '@/features/posts/components/ContentReportModal';
import { useToast } from '@/shared/ui/Toast';

type ReportTarget =
  | { type: 'post'; postId: string; postAuthorId: string | null }
  | { type: 'comment'; postId: string; commentId: string; commentAuthorId: string | null };

/**
 * Reporting a post or one of its comments: what to report, the reason form and sending it.
 * Render `modal` once next to the buttons that call `reportPost` or `reportComment`.
 */
export function useContentReport() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [target, setTarget] = useState<ReportTarget | null>(null);
  const [reason, setReason] = useState<UserReportReason>('spam');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const open = (next: ReportTarget) => {
    if (!user) {
      showToast('Inicia sesion para reportar', 'info');
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
    setError(null);
    setDetails('');
    setReason('spam');
  };

  const submit = async () => {
    if (!user || !target) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmed = details.trim() ? details.trim() : null;
      if (target.type === 'post') {
        await createPostReport({
          reporterUid: user.uid,
          postId: target.postId,
          postAuthorId: target.postAuthorId,
          reason,
          details: trimmed,
        });
      } else {
        await createPostCommentReport({
          reporterUid: user.uid,
          postId: target.postId,
          commentId: target.commentId,
          commentAuthorId: target.commentAuthorId,
          reason,
          details: trimmed,
        });
      }
      showToast('Reporte enviado', 'success');
      setTarget(null);
      setReason('spam');
      setDetails('');
      setError(null);
    } catch (submitError) {
      console.error('Error creating content report:', submitError);
      setError('No se pudo enviar el reporte.');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    reportPost: (postId: string, authorId: string | null) =>
      open({ type: 'post', postId, postAuthorId: authorId || null }),
    reportComment: (postId: string, comment: PostCommentRead) =>
      open({
        type: 'comment',
        postId,
        commentId: comment.id,
        commentAuthorId: comment.authorId || null,
      }),
    modal: (
      <ContentReportModal
        open={!!target}
        targetLabel={target?.type === 'comment' ? 'comentario' : 'publicacion'}
        reason={reason}
        details={details}
        error={error}
        isSubmitting={submitting}
        onClose={close}
        onReasonChange={setReason}
        onDetailsChange={setDetails}
        onSubmit={() => {
          void submit();
        }}
      />
    ),
  };
}
