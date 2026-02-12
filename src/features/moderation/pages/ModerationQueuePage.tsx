import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import {
  getModerationQueue,
  isCurrentUserAppAdmin,
  updateModerationQueueStatus,
  type ModerationQueueItemRead,
  type ModerationQueueStatus,
  type PaginatedResultModel,
} from '@/features/moderation/api';
import { formatRelativeTime } from '@/shared/lib/formatUtils';

const statusLabel: Record<ModerationQueueStatus, string> = {
  pending: 'Pendiente',
  in_review: 'En revision',
  resolved: 'Resuelto',
  dismissed: 'Descartado',
};

const priorityClass: Record<string, string> = {
  high: 'border-red-500/50 text-red-200',
  medium: 'border-amber-500/40 text-amber-200',
  low: 'border-sky-500/40 text-sky-200',
};

const statusClass: Record<ModerationQueueStatus, string> = {
  pending: 'border-neutral-600 text-neutral-300',
  in_review: 'border-amber-500/40 text-amber-200',
  resolved: 'border-emerald-500/40 text-emerald-200',
  dismissed: 'border-neutral-700 text-neutral-400',
};

const ModerationQueuePage = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [hasAccess, setHasAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ModerationQueueItemRead[]>([]);
  const [cursor, setCursor] =
    useState<PaginatedResultModel<ModerationQueueItemRead>['lastDoc']>(null);
  const [hasMore, setHasMore] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

  const loadQueue = useCallback(
    async (
      loadMore = false,
      nextCursor?: PaginatedResultModel<ModerationQueueItemRead>['lastDoc'],
    ) => {
      if (!hasAccess) return;
      try {
        setError(null);
        if (loadMore) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }
        const result = await getModerationQueue(
          25,
          loadMore ? (nextCursor ?? undefined) : undefined,
        );
        setItems((prev) => (loadMore ? [...prev, ...result.items] : result.items));
        setCursor(result.lastDoc);
        setHasMore(result.hasMore);
      } catch (loadError) {
        console.error('Error loading moderation queue:', loadError);
        setError('No se pudo cargar la cola de moderacion.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [hasAccess],
  );

  useEffect(() => {
    let active = true;

    const checkAccess = async () => {
      if (!user) {
        setHasAccess(false);
        setCheckingAccess(false);
        return;
      }
      try {
        const access = await isCurrentUserAppAdmin(user.uid);
        if (!active) return;
        setHasAccess(access);
      } catch (accessError) {
        console.error('Error checking moderation access:', accessError);
        if (!active) return;
        setHasAccess(false);
      } finally {
        if (active) setCheckingAccess(false);
      }
    };

    void checkAccess();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!hasAccess) return;
    void loadQueue(false);
  }, [hasAccess, loadQueue]);

  const pendingCount = useMemo(
    () => items.filter((item) => item.status === 'pending' || item.status === 'in_review').length,
    [items],
  );

  const handleReviewAction = async (
    item: ModerationQueueItemRead,
    status: ModerationQueueStatus,
    reviewAction: string,
  ) => {
    if (!user) return;
    setUpdatingItemId(item.id);
    try {
      const note = reviewNotes[item.id]?.trim() || null;
      await updateModerationQueueStatus({
        itemId: item.id,
        status,
        reviewAction,
        reviewNote: note,
        reviewedBy: user.uid,
      });

      setItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status,
                reviewAction,
                reviewNote: note,
                reviewedBy: user.uid,
                reviewedAt: new Date(),
                updatedAt: new Date(),
              }
            : entry,
        ),
      );
      showToast('Cola de moderacion actualizada.', 'success');
    } catch (updateError) {
      console.error('Error updating moderation queue item:', updateError);
      showToast('No se pudo actualizar el estado.', 'error');
    } finally {
      setUpdatingItemId(null);
    }
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto pt-10 text-center text-neutral-500">
        Inicia sesion para acceder al panel de moderacion.
      </div>
    );
  }

  if (checkingAccess) {
    return (
      <div className="max-w-4xl mx-auto pt-10 text-center">
        <Loader2 size={28} className="animate-spin text-amber-500 mx-auto" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="max-w-4xl mx-auto pt-10">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-red-200">
          Este panel solo esta disponible para administradores de Trust & Safety.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-20 pt-4 md:pt-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif text-white">Moderacion UGC</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Cola activa: {pendingCount} caso{pendingCount === 1 ? '' : 's'} pendientes
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadQueue(false)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors"
        >
          <RefreshCw size={14} />
          Actualizar
        </button>
      </header>

      {loading ? (
        <div className="text-center py-12">
          <Loader2 size={28} className="animate-spin text-amber-500 mx-auto" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 text-red-300 p-5">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-8 text-neutral-500 text-center">
          No hay reportes pendientes en la cola.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const createdAtLabel = item.createdAt
              ? formatRelativeTime(item.createdAt)
              : 'sin fecha';
            const isUpdating = updatingItemId === item.id;
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs uppercase tracking-wider ${priorityClass[item.priority] ?? priorityClass.low}`}
                  >
                    Prioridad {item.priority}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs uppercase tracking-wider ${statusClass[item.status]}`}
                  >
                    {statusLabel[item.status]}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wider text-neutral-400">
                    <ShieldCheck size={12} />
                    {item.targetType}
                  </span>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-white">
                    Motivo: <span className="text-neutral-200">{item.reason}</span>
                  </p>
                  <p className="text-xs text-neutral-500">
                    Reportado {createdAtLabel} · reportId: {item.reportId}
                  </p>
                  {item.details && <p className="text-sm text-neutral-300">{item.details}</p>}
                </div>

                <textarea
                  value={reviewNotes[item.id] ?? item.reviewNote ?? ''}
                  onChange={(event) =>
                    setReviewNotes((prev) => ({
                      ...prev,
                      [item.id]: event.target.value,
                    }))
                  }
                  maxLength={2000}
                  rows={3}
                  placeholder="Nota interna de revision (opcional)"
                  className="w-full bg-neutral-900/70 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleReviewAction(item, 'in_review', 'triage_started')}
                    disabled={isUpdating}
                    className="px-3 py-1.5 rounded-full text-xs uppercase tracking-widest border border-amber-500/50 text-amber-200 hover:text-white hover:border-amber-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    En revision
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleReviewAction(item, 'resolved', 'content_action_applied')
                    }
                    disabled={isUpdating}
                    className="px-3 py-1.5 rounded-full text-xs uppercase tracking-widest border border-emerald-500/50 text-emerald-200 hover:text-white hover:border-emerald-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Resolver
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReviewAction(item, 'dismissed', 'no_violation')}
                    disabled={isUpdating}
                    className="px-3 py-1.5 rounded-full text-xs uppercase tracking-widest border border-neutral-700 text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Descartar
                  </button>
                  {isUpdating && (
                    <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
                      <Loader2 size={12} className="animate-spin" />
                      Guardando...
                    </span>
                  )}
                </div>

                {item.status === 'pending' && (
                  <div className="inline-flex items-center gap-2 text-xs text-amber-300">
                    <AlertTriangle size={12} />
                    Caso requiere accion
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadQueue(true, cursor ?? undefined)}
            disabled={loadingMore}
            className="px-5 py-2 rounded-full text-xs uppercase tracking-widest border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loadingMore ? 'Cargando...' : 'Cargar mas'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ModerationQueuePage;
