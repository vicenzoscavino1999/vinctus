import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  getAccountDeletionStatus,
  startAccountDeletion,
  type AccountDeletionStatus,
  type AccountDeletionStatusResponse,
} from '@/features/settings/api';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DeleteAccountModal = ({ isOpen, onClose }: DeleteAccountModalProps) => {
  const { signOut } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [statusInfo, setStatusInfo] = useState<AccountDeletionStatusResponse>({
    status: 'not_requested',
    jobId: null,
    updatedAt: null,
    completedAt: null,
    lastError: null,
  });
  const [statusError, setStatusError] = useState<string | null>(null);
  const normalizedConfirmText = confirmText.trim().toUpperCase();
  const isDeleteConfirmationValid = normalizedConfirmText === 'ELIMINAR';

  const isQueuedOrProcessing = statusInfo.status === 'queued' || statusInfo.status === 'processing';
  const canSubmitRequest = !isQueuedOrProcessing && statusInfo.status !== 'completed';

  const statusTitle = useMemo(() => {
    const statusLabels: Record<AccountDeletionStatus, string> = {
      not_requested: 'Sin solicitud',
      queued: 'Solicitud en cola',
      processing: 'Borrando cuenta',
      completed: 'Cuenta eliminada',
      failed: 'Solicitud fallida',
    };
    return statusLabels[statusInfo.status];
  }, [statusInfo.status]);

  const resetLocalState = useCallback(() => {
    setLoading(false);
    setLoadingStatus(false);
    setConfirmText('');
    setStatusError(null);
  }, []);

  const fetchDeletionStatus = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoadingStatus(true);
      }
      setStatusError(null);
      const data = await getAccountDeletionStatus();
      setStatusInfo(data);
    } catch (error) {
      console.error('Error fetching deletion status:', error);
      if (!silent) {
        setStatusError('No se pudo cargar el estado de eliminacion.');
      }
    } finally {
      if (!silent) {
        setLoadingStatus(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void fetchDeletionStatus(false);
  }, [isOpen, fetchDeletionStatus]);

  useEffect(() => {
    if (!isOpen) return;
    if (!isQueuedOrProcessing) return;

    const intervalId = window.setInterval(() => {
      void fetchDeletionStatus(true);
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchDeletionStatus, isOpen, isQueuedOrProcessing]);

  const handleClose = () => {
    resetLocalState();
    onClose();
  };

  const handleSignOutNow = async () => {
    try {
      await signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out after deletion request:', error);
      showToast('No se pudo cerrar sesion.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!canSubmitRequest) return;
    if (!isDeleteConfirmationValid) return;

    setLoading(true);
    setStatusError(null);
    try {
      const result = await startAccountDeletion();
      const nextStatus = result.status;
      const nowIso = new Date().toISOString();
      setStatusInfo((prev) => ({
        ...prev,
        status: nextStatus,
        jobId: result.jobId,
        updatedAt: nowIso,
      }));
      setConfirmText('');

      if (result.mode === 'legacy') {
        showToast('Eliminacion iniciada en modo legacy. Cerraremos tu sesion.', 'success');
        await handleSignOutNow();
        return;
      }

      if (nextStatus === 'completed') {
        showToast('Cuenta eliminada correctamente.', 'success');
      } else {
        showToast('Solicitud enviada. Puedes revisar el estado en esta pantalla.', 'success');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      showToast('Error al eliminar la cuenta. Intentalo mas tarde.', 'error');
      setStatusError('No se pudo iniciar la eliminacion de cuenta.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center safe-area-inset bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#1A1A1A] border border-red-500/20 rounded-2xl p-6 shadow-2xl space-y-6">
        <div className="flex items-center gap-4 text-red-500">
          <div className="p-3 bg-red-500/10 rounded-full">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h3 className="text-xl font-bold">Eliminar cuenta</h3>
            <p className="text-sm text-red-400/80">Esta accion no se puede deshacer.</p>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-700 bg-black/30 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-neutral-500">Estado</p>
            {loadingStatus ? (
              <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
                <Loader2 size={12} className="animate-spin" />
                Cargando...
              </span>
            ) : (
              <span className="text-xs text-neutral-300">{statusTitle}</span>
            )}
          </div>

          {statusInfo.status === 'queued' || statusInfo.status === 'processing' ? (
            <div className="inline-flex items-center gap-2 text-xs text-amber-300">
              <Loader2 size={12} className="animate-spin" />
              Tu solicitud esta en proceso. Te recomendamos cerrar sesion.
            </div>
          ) : null}

          {statusInfo.status === 'completed' ? (
            <div className="inline-flex items-center gap-2 text-xs text-emerald-300">
              <CheckCircle2 size={12} />
              Borrado completado. Puedes cerrar sesion ahora.
            </div>
          ) : null}

          {statusInfo.status === 'failed' ? (
            <div className="inline-flex items-center gap-2 text-xs text-red-300">
              <AlertCircle size={12} />
              {statusInfo.lastError || 'La eliminacion fallo. Intenta solicitarla otra vez.'}
            </div>
          ) : null}

          {statusError && (
            <div className="inline-flex items-center gap-2 text-xs text-red-300">
              <AlertCircle size={12} />
              {statusError}
            </div>
          )}
        </div>

        <div className="space-y-4 text-neutral-300 text-sm">
          <p>Al eliminar tu cuenta, perderas permanentemente:</p>
          <ul className="list-disc pl-5 space-y-1 text-neutral-400">
            <li>Tu perfil, amigos y seguidores</li>
            <li>Todas tus publicaciones e historias</li>
            <li>Tus mensajes y grupos de chat</li>
            <li>Tus configuraciones y preferencias</li>
          </ul>
          <p className="font-medium text-white">
            Escribe <span className="text-red-400 font-bold">ELIMINAR</span> para confirmar.
          </p>
          <p className="text-xs text-neutral-500">
            El proceso puede tardar unos minutos si tu cuenta tiene mucho contenido.
          </p>
        </div>

        <input
          type="text"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          placeholder="Escribe ELIMINAR"
          disabled={!canSubmitRequest || loading}
          className="w-full bg-black/40 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-red-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          autoFocus
        />

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleClose}
            disabled={loading || loadingStatus}
            className="flex-1 py-3 px-4 rounded-xl font-medium text-neutral-400 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          {(statusInfo.status === 'queued' ||
            statusInfo.status === 'processing' ||
            statusInfo.status === 'completed') && (
            <button
              onClick={() => void handleSignOutNow()}
              disabled={loading}
              className="flex-1 py-3 px-4 rounded-xl font-medium border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-50"
            >
              Cerrar sesion
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={!isDeleteConfirmationValid || loading || !canSubmitRequest}
            className="flex-1 py-3 px-4 rounded-xl font-bold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Procesando...
              </>
            ) : (
              'Solicitar eliminacion'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteAccountModal;
