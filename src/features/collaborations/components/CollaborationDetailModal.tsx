import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import {
  deleteCollaboration,
  sendCollaborationRequest,
  type CollaborationRead,
} from '@/shared/lib/firestore';
import { useToast } from '@/shared/ui/Toast';

interface CollaborationDetailModalProps {
  isOpen: boolean;
  collaboration: CollaborationRead | null;
  isRequested: boolean;
  onClose: () => void;
  onRequestSent: (collaborationId: string) => void;
  onDeleted: () => void;
  onEdit?: (collaboration: CollaborationRead) => void;
}

const formatLevel = (level: CollaborationRead['level']): string => {
  if (level === 'experto') return 'Experto';
  if (level === 'intermedio') return 'Intermedio';
  return 'Principiante';
};

const formatMode = (mode: CollaborationRead['mode']): string => {
  return mode === 'presencial' ? 'Presencial' : 'Virtual';
};

const CollaborationDetailModal = ({
  isOpen,
  collaboration,
  isRequested,
  onClose,
  onRequestSent,
  onDeleted,
  onEdit,
}: CollaborationDetailModalProps) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setMessage('');
      setError(null);
      setIsSubmitting(false);
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }, [isOpen]);

  if (!isOpen || !collaboration) return null;

  const isOwner = user?.uid === collaboration.authorId;
  const canSend = !!user && !isOwner && !isRequested && !isSubmitting;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!user) {
      setError('Debes iniciar sesion para enviar solicitudes.');
      return;
    }

    if (isOwner) {
      setError('No puedes solicitar tu propio proyecto.');
      return;
    }

    if (isRequested) {
      setError('Ya enviaste una solicitud para este proyecto.');
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
      onRequestSent(collaboration.id);
    } catch (submitError) {
      console.error('Error sending collaboration request:', submitError);
      setError(
        submitError instanceof Error ? submitError.message : 'No se pudo enviar la solicitud.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !isOwner) return;
    setError(null);
    setIsDeleting(true);

    try {
      await deleteCollaboration(user.uid, collaboration.id);
      showToast('Proyecto eliminado', 'success');
      onDeleted();
    } catch (deleteError) {
      console.error('Error deleting collaboration:', deleteError);
      setError('No se pudo eliminar el proyecto.');
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleEdit = () => {
    if (!onEdit) return;
    onEdit(collaboration);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-4 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h2 className="text-xl font-serif text-white">Detalle de colaboracion</h2>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <p className="text-xs uppercase tracking-widest text-neutral-500">
              {collaboration.context}
            </p>
            <h3 className="text-2xl text-white font-serif font-light mt-2">
              {collaboration.title}
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              Por{' '}
              <span className="text-amber-200/80">{collaboration.authorSnapshot.displayName}</span>
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 text-sm text-neutral-400">
            <div>
              <span className="text-neutral-500 uppercase tracking-widest text-xs block mb-1">
                Que busca
              </span>
              <span className="text-white">{collaboration.seekingRole}</span>
            </div>
            <div>
              <span className="text-neutral-500 uppercase tracking-widest text-xs block mb-1">
                Modalidad
              </span>
              <span className="text-white">{formatMode(collaboration.mode)}</span>
            </div>
            {collaboration.location && (
              <div>
                <span className="text-neutral-500 uppercase tracking-widest text-xs block mb-1">
                  Ubicacion
                </span>
                <span className="text-white">{collaboration.location}</span>
              </div>
            )}
            <div>
              <span className="text-neutral-500 uppercase tracking-widest text-xs block mb-1">
                Nivel
              </span>
              <span className="text-white">{formatLevel(collaboration.level)}</span>
            </div>
            {collaboration.topic && (
              <div className="md:col-span-2">
                <span className="text-neutral-500 uppercase tracking-widest text-xs block mb-1">
                  Tema especifico
                </span>
                <span className="text-white">{collaboration.topic}</span>
              </div>
            )}
          </div>

          {collaboration.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {collaboration.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] text-neutral-400 bg-neutral-800/70 px-2 py-1 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {!isOwner && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="text-xs text-neutral-500 uppercase tracking-wider block">
                Mensaje (opcional)
              </label>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={1000}
                rows={5}
                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                placeholder="Cuenta un poco sobre ti o por que te interesa colaborar..."
                disabled={isRequested}
              />
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>
                  {isRequested
                    ? 'Solicitud enviada'
                    : 'Envias un solo mensaje junto a la solicitud.'}
                </span>
                <span>{message.length}/1000</span>
              </div>
              <button
                type="submit"
                disabled={!canSend}
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
            </form>
          )}

          {isOwner && (
            <div className="border-t border-neutral-800 pt-4">
              {confirmDelete ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-neutral-400">
                    Confirmas eliminar este proyecto?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-3 py-1.5 text-xs uppercase tracking-widest rounded-full border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
                      disabled={isDeleting}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="px-3 py-1.5 text-xs uppercase tracking-widest rounded-full border border-red-500/60 text-red-300 hover:text-white hover:border-red-300 transition-colors flex items-center gap-2"
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                      Eliminar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  {onEdit && (
                    <button
                      type="button"
                      onClick={handleEdit}
                      className="text-xs uppercase tracking-widest px-3 py-1.5 rounded-full border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors"
                    >
                      Editar proyecto
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="text-xs uppercase tracking-widest px-3 py-1.5 rounded-full border border-red-500/50 text-red-300 hover:text-white hover:border-red-300 transition-colors flex items-center gap-2"
                  >
                    <Trash2 size={14} />
                    Eliminar proyecto
                  </button>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CollaborationDetailModal;
