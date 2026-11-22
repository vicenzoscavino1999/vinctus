import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
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

const INITIAL_STATUS: AccountDeletionStatusResponse = {
  status: 'not_requested',
  jobId: null,
  updatedAt: null,
  completedAt: null,
  lastError: null,
};

const isSessionEndedDeletionError = (error: unknown): boolean => {
  const code = String((error as { code?: unknown })?.code ?? '').toLowerCase();
  return (
    code.includes('unauthenticated') ||
    code.includes('user-token-expired') ||
    code.includes('user-not-found') ||
    code.includes('user-disabled')
  );
};

const DeleteAccountModal = ({ isOpen, onClose }: DeleteAccountModalProps) => {
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [statusInfo, setStatusInfo] = useState<AccountDeletionStatusResponse>(INITIAL_STATUS);
  const [statusError, setStatusError] = useState<string | null>(null);

  const requestSeqRef = useRef(0);
  const statusRef = useRef<AccountDeletionStatus>('not_requested');
  statusRef.current = statusInfo.status;

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
    requestSeqRef.current += 1;
    setLoading(false);
    setLoadingStatus(false);
    setConfirmText('');
    setStatusInfo(INITIAL_STATUS);
    setStatusError(null);
  }, []);

  const fetchDeletionStatus = useCallback(async (silent = false) => {
    const seq = ++requestSeqRef.current;
    try {
      if (!silent) {
        setLoadingStatus(true);
      }
      setStatusError(null);
      const data = await getAccountDeletionStatus();
      if (seq !== requestSeqRef.current) return;
      setStatusInfo(data);
    } catch (error) {
      if (seq !== requestSeqRef.current) return;
      const wasActiveDeletion =
        statusRef.current === 'queued' || statusRef.current === 'processing';
      if (wasActiveDeletion && isSessionEndedDeletionError(error)) {
        // Once the server finishes deleting the Auth user, polling returns unauthenticated.
        setStatusInfo((prev) => ({
          ...prev,
          status: 'completed',
          completedAt: new Date().toISOString(),
          lastError: null,
        }));
        setStatusError(null);
        return;
      }
      console.error('Error fetching deletion status:', error);
      if (!silent) {
        setStatusError('No se pudo cargar el estado de eliminación.');
      }
    } finally {
      if (!silent && seq === requestSeqRef.current) {
        setLoadingStatus(false);
      }
    }
  }, []);

  // Reset modal state on close or account switch.
  useEffect(() => {
    if (!isOpen) {
      resetLocalState();
      return;
    }
    setConfirmText('');
    setStatusInfo(INITIAL_STATUS);
    setStatusError(null);
    void fetchDeletionStatus(false);
  }, [isOpen, user?.uid, fetchDeletionStatus, resetLocalState]);

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

  const handleClose = useCallback(() => {
    if (loading) return;
    resetLocalState();
    onClose();
  }, [loading, resetLocalState, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, loading, handleClose]);

  const handleSignOutNow = async () => {
    try {
      await signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out after deletion request:', error);
      showToast('No se pudo cerrar sesión.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!canSubmitRequest || !isDeleteConfirmationValid || loading) return;

    const seq = ++requestSeqRef.current;
    setLoading(true);
    setStatusError(null);
    try {
      const result = await startAccountDeletion();
      if (seq !== requestSeqRef.current) return;
      const nextStatus = result.status;
      const nowIso = new Date().toISOString();
      setStatusInfo((prev) => ({
        ...prev,
        status: nextStatus,
        jobId: result.jobId,
        updatedAt: nowIso,
        lastError: null,
      }));
      setConfirmText('');

      if (result.mode === 'legacy') {
        showToast('Eliminación iniciada en modo legacy. Cerraremos tu sesión.', 'success');
        await handleSignOutNow();
        return;
      }

      if (nextStatus === 'completed') {
        showToast('Cuenta eliminada correctamente.', 'success');
      } else {
        showToast('Solicitud enviada. Puedes revisar el estado en esta pantalla.', 'success');
      }
    } catch (error) {
      if (seq !== requestSeqRef.current) return;
      console.error('Error deleting account:', error);
      showToast('Error al eliminar la cuenta. Inténtalo más tarde.', 'error');
      setStatusError('No se pudo iniciar la eliminación de cuenta.');
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center safe-area-inset bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
    >
      <div className="w-full max-w-md bg-[#1A1A1A] border border-red-500/20 rounded-2xl p-6 shadow-2xl space-y-6">
        <div className="flex items-center gap-4 text-red-500">
          <div className="p-3 bg-red-500/10 rounded-full">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h3 id="delete-account-title" className="text-xl font-bold">
              Eliminar cuenta
            </h3>
            <p className="text-sm text-red-400/80">Esta acción no se puede deshacer.</p>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-700 bg-black/30 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wider text-neutral-500">Estado</p>
            <div className="flex items-center gap-2">
              {loadingStatus ? (
                <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
                  <Loader2 size={12} className="animate-spin" />
                  Cargando...
                </span>
              ) : (
                <span className="text-xs text-neutral-300">{statusTitle}</span>
              )}
              <button
                type="button"
                onClick={() => void fetchDeletionStatus(false)}
                disabled={loadingStatus || loading}
                aria-label="Actualizar estado"
                className="p-1 text-neutral-400 hover:text-white transition-colors disabled:opacity-40"
              >
                <RefreshCw size={12} className={loadingStatus ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {statusInfo.status === 'queued' || statusInfo.status === 'processing' ? (
            <div className="inline-flex items-center gap-2 text-xs text-amber-300">
              <Loader2 size={12} className="animate-spin" />
              Tu solicitud está en proceso. Te recomendamos cerrar sesión.
            </div>
          ) : null}

          {statusInfo.status === 'completed' ? (
            <div className="inline-flex items-center gap-2 text-xs text-emerald-300">
              <CheckCircle2 size={12} />
              Borrado completado. Puedes cerrar sesión ahora.
            </div>
          ) : null}

          {statusInfo.status === 'failed' ? (
            <div className="inline-flex items-center gap-2 text-xs text-red-300">
              <AlertCircle size={12} />
              {statusInfo.lastError || 'La eliminación falló. Intenta solicitarla otra vez.'}
            </div>
          ) : null}

          {statusError && (
            <div className="flex items-center justify-between gap-2 text-xs text-red-300">
              <span className="inline-flex items-center gap-2">
                <AlertCircle size={12} />
                {statusError}
              </span>
              <button
                type="button"
                onClick={() => void fetchDeletionStatus(false)}
                disabled={loadingStatus}
                className="underline hover:text-red-100 shrink-0"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4 text-neutral-300 text-sm">
          <p>Al eliminar tu cuenta, perderás permanentemente:</p>
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
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-xl font-medium text-neutral-400 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          {(statusInfo.status === 'queued' ||
            statusInfo.status === 'processing' ||
            statusInfo.status === 'completed') && (
            <button
              type="button"
              onClick={() => void handleSignOutNow()}
              disabled={loading}
              className="flex-1 py-3 px-4 rounded-xl font-medium border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-50"
            >
              Cerrar sesión
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={!isDeleteConfirmationValid || loading || !canSubmitRequest}
            className="flex-1 py-3 px-4 rounded-xl font-bold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Procesando...
              </>
            ) : (
              'Solicitar eliminación'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteAccountModal;
