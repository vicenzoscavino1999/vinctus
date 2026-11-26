import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  acceptCollaborationRequest,
  getPendingCollaborationRequests,
  rejectCollaborationRequest,
} from '@/features/collaborations/api';
import {
  acceptGroupJoinRequest,
  getPendingGroupJoinRequests,
  rejectGroupJoinRequest,
} from '@/features/groups/api';
import {
  acceptFollowRequest,
  declineFollowRequest,
  getIncomingFollowRequests,
  getOrCreateDirectConversation,
} from '@/features/profile/api';
import { notifyNotificationsUpdated } from '@/features/notifications/api';
import type { BlockedUsers } from '@/features/notifications/hooks/blockedUsers';
import { AppError } from '@/shared/lib/errors';
import { useToast } from '@/shared/ui/Toast';

export type RequestKind = 'followers' | 'groups' | 'collaboration';

export const REQUEST_KINDS: RequestKind[] = ['followers', 'groups', 'collaboration'];

/** A pending follow, group or collaboration request, in one shape for one list. */
export type IncomingRequest = {
  key: string;
  kind: RequestKind;
  id: string;
  fromUid: string;
  toUid: string;
  name: string;
  username: string | null;
  photoURL: string | null;
  createdAt: Date;
  /** Group name or collaboration title. */
  target: string | null;
  message: string | null;
};

type KindState = { items: IncomingRequest[]; status: 'loading' | 'ready' | 'error' };

const initialState = (): Record<RequestKind, KindState> => ({
  followers: { items: [], status: 'loading' },
  groups: { items: [], status: 'loading' },
  collaboration: { items: [], status: 'loading' },
});

const fetchKind = async (kind: RequestKind, uid: string): Promise<IncomingRequest[]> => {
  if (kind === 'followers') {
    const page = await getIncomingFollowRequests(uid, 50);
    return page.items.map((request) => ({
      key: `followers:${request.id}`,
      kind,
      id: request.id,
      fromUid: request.fromUid,
      toUid: request.toUid,
      name: request.fromUser?.displayName || request.fromUser?.username || 'Usuario',
      username: request.fromUser?.username ?? null,
      photoURL: request.fromUser?.photoURL ?? null,
      createdAt: request.createdAt,
      target: null,
      message: null,
    }));
  }
  if (kind === 'groups') {
    const requests = await getPendingGroupJoinRequests(uid);
    return requests.map((request) => ({
      key: `groups:${request.id}`,
      kind,
      id: request.id,
      fromUid: request.fromUid,
      toUid: request.toUid,
      name: request.fromUserName || 'Usuario',
      username: null,
      photoURL: request.fromUserPhoto,
      createdAt: request.createdAt,
      target: request.groupName,
      message: request.message,
    }));
  }
  const requests = await getPendingCollaborationRequests(uid);
  return requests.map((request) => ({
    key: `collaboration:${request.id}`,
    kind,
    id: request.id,
    fromUid: request.fromUid,
    toUid: request.toUid,
    name: request.fromUserName || 'Usuario',
    username: null,
    photoURL: request.fromUserPhoto,
    createdAt: request.createdAt,
    target: request.collaborationTitle,
    message: request.message,
  }));
};

const isPermissionDenied = (error: unknown) =>
  error instanceof AppError && error.code === 'PERMISSION_DENIED';

export type IncomingRequests = ReturnType<typeof useIncomingRequests>;

/**
 * Pending follow, group and collaboration requests addressed to the signed-in person, without
 * blocked senders, with accept / reject. Each kind loads on its own, so one failing source
 * does not hide the others.
 */
export function useIncomingRequests(uid: string, blocked: BlockedUsers) {
  const { showToast } = useToast();
  const toast = useRef(showToast);
  useEffect(() => {
    toast.current = showToast;
  });
  const [state, setState] = useState(initialState);
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());

  const loadKinds = useCallback(
    async (kinds: RequestKind[], refreshBlocked = false) => {
      setState((previous) => {
        const next = { ...previous };
        kinds.forEach((kind) => {
          next[kind] = { ...previous[kind], status: 'loading' };
        });
        return next;
      });
      const blockedSet = await (refreshBlocked ? blocked.refresh() : blocked.get());
      await Promise.all(
        kinds.map(async (kind) => {
          try {
            const items = (await fetchKind(kind, uid)).filter(
              (request) => !blockedSet.has(request.fromUid),
            );
            setState((previous) => ({ ...previous, [kind]: { items, status: 'ready' } }));
          } catch (error) {
            console.error(`Error loading ${kind} requests:`, error);
            setState((previous) => ({
              ...previous,
              [kind]: { ...previous[kind], status: 'error' },
            }));
          }
        }),
      );
    },
    [uid, blocked],
  );

  useEffect(() => {
    void loadKinds(REQUEST_KINDS);
  }, [loadKinds]);

  const requests = useMemo(
    () =>
      REQUEST_KINDS.flatMap((kind) => state[kind].items).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      ),
    [state],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(REQUEST_KINDS.map((kind) => [kind, state[kind].items.length])) as Record<
        RequestKind,
        number
      >,
    [state],
  );
  const failedKinds = REQUEST_KINDS.filter((kind) => state[kind].status === 'error');
  const loading = REQUEST_KINDS.some((kind) => state[kind].status === 'loading');

  const drop = (request: IncomingRequest) =>
    setState((previous) => ({
      ...previous,
      [request.kind]: {
        ...previous[request.kind],
        items: previous[request.kind].items.filter((item) => item.id !== request.id),
      },
    }));

  const withBusy = async (request: IncomingRequest, action: () => Promise<void>) => {
    if (busyKeys.has(request.key)) return;
    setBusyKeys((previous) => new Set(previous).add(request.key));
    try {
      await action();
    } finally {
      setBusyKeys((previous) => {
        const next = new Set(previous);
        next.delete(request.key);
        return next;
      });
    }
  };

  const accept = (request: IncomingRequest) =>
    withBusy(request, async () => {
      try {
        if (request.kind === 'followers') {
          await acceptFollowRequest(request.fromUid, request.toUid);
          drop(request);
          notifyNotificationsUpdated();
          toast.current('Solicitud de seguimiento aceptada.', 'success');
        } else if (request.kind === 'groups') {
          await acceptGroupJoinRequest(request.id);
          drop(request);
          notifyNotificationsUpdated();
          toast.current('Solicitud de grupo aceptada.', 'success');
        } else {
          await acceptCollaborationRequest(request.id);
          drop(request);
          notifyNotificationsUpdated();
          try {
            await getOrCreateDirectConversation(uid, request.fromUid);
            toast.current('Solicitud aceptada. Conversación habilitada.', 'success');
          } catch (conversationError) {
            console.warn('Accepted collaboration without direct conversation:', conversationError);
            toast.current(
              'Solicitud aceptada. Abre su perfil o síguelo para iniciar la conversación.',
              'success',
            );
          }
        }
      } catch (error) {
        console.error(`Error accepting ${request.kind} request:`, error);
        if (
          request.kind === 'groups' &&
          error instanceof Error &&
          error.message.includes('Grupo no encontrado')
        ) {
          toast.current('Este grupo ya no existe.', 'info');
          void loadKinds([request.kind]);
        } else if (isPermissionDenied(error)) {
          toast.current(
            'No se pudo aceptar: la solicitud ya no está vigente o existe un bloqueo.',
            'error',
          );
          void loadKinds([request.kind]);
        } else {
          toast.current('No se pudo aceptar la solicitud.', 'error');
        }
      }
    });

  const reject = (request: IncomingRequest) =>
    withBusy(request, async () => {
      try {
        if (request.kind === 'followers') {
          await declineFollowRequest(request.fromUid, request.toUid);
        } else if (request.kind === 'groups') {
          await rejectGroupJoinRequest(request.id);
        } else {
          await rejectCollaborationRequest(request.id);
        }
        drop(request);
        notifyNotificationsUpdated();
        toast.current('Solicitud rechazada.', 'info');
      } catch (error) {
        console.error(`Error rejecting ${request.kind} request:`, error);
        toast.current('No se pudo rechazar la solicitud.', 'error');
      }
    });

  return {
    requests,
    counts,
    total: requests.length,
    loading,
    failedKinds,
    busyKeys,
    reload: (refreshBlocked = true) => loadKinds(REQUEST_KINDS, refreshBlocked),
    retryFailed: () => loadKinds(failedKinds),
    accept,
    reject,
  };
}
