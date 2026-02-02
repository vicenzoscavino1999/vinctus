import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { sendCollaborationRequest, type CollaborationRead } from '@/shared/lib/firestore';
import { useToast } from '@/shared/ui/Toast';

interface CollaborationRequestModalProps {
  isOpen: boolean;
  collaboration: CollaborationRead | null;
  onClose: () => void;
  onSent: (collaborationId: string) => void;
}

const CollaborationRequestModal = ({
  isOpen,
  collaboration,
  onClose,
  onSent,
}: CollaborationRequestModalProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setMessage('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!collaboration) return;

    if (!user) {
      setError('Debes iniciar sesion para enviar solicitudes.');
      return;
    }

    if (user.uid === collaboration.authorId) {
      setError('No puedes solicitar tu propio proyecto.');
      return;
    }

    setIsSubmitting(true);

    try {
      await sendCollaborationRequest({
        collaborationId: collaboration.id,
        collaborationTitle: collaboration.title,
        fromUid: user.uid,
        toUid: collaboration.authorId,
        message: message.trim() ? message.trim() : null,
        fromUserName: user.displayName || 'Usuario',
        fromUserPhoto: user.photoURL || null,
      });
      showToast('Solicitud enviada', 'success');
      onSent(collaboration.id);
    } catch (submitError) {
      console.error('Error sending collaboration request:', submitError);
      setError(
        submitError instanceof Error ? submitError.message : 'No se pudo enviar la solicitud.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !collaboration) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h2 className="text-xl font-serif text-white">Enviar solicitud</h2>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <p className="text-xs uppercase tracking-widest text-neutral-500">
              {collaboration.context}
            </p>
            <h3 className="text-lg text-white font-serif font-light mt-2">{collaboration.title}</h3>
            <p className="text-sm text-neutral-500 mt-1">
              Por{' '}
              <span className="text-amber-200/80">{collaboration.authorSnapshot.displayName}</span>
            </p>
          </div>

          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
              Mensaje (opcional)
            </label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={1000}
              rows={5}
              className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
              placeholder="Cuenta un poco sobre ti o por que te interesa colaborar..."
            />
            <div className="text-right text-xs text-neutral-500 mt-2">{message.length}/1000</div>
            <p className="text-xs text-neutral-500 mt-2">
              Tu solicitud llegara como notificacion. La conversacion se habilita si el autor
              acepta.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-neutral-300 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-medium rounded-lg hover:from-amber-600 hover:to-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar solicitud'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CollaborationRequestModal;
