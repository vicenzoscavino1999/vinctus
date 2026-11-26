import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Inbox, UserPlus, Users } from 'lucide-react';
import type {
  IncomingRequest,
  IncomingRequests,
  RequestKind,
} from '@/features/notifications/hooks/useIncomingRequests';
import { formatNotificationTime } from '@/features/notifications/model/activityFeed';
import { ActorStack } from '@/features/notifications/components/NotificationAvatar';

type Filter = 'all' | RequestKind;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'followers', label: 'Seguidores' },
  { id: 'groups', label: 'Grupos' },
  { id: 'collaboration', label: 'Colaboración' },
];

const KIND_BADGE: Record<RequestKind, { className: string; icon: ReactNode }> = {
  followers: {
    className: 'bg-brand-gold text-black',
    icon: <UserPlus size={10} strokeWidth={2.6} />,
  },
  groups: { className: 'bg-violet-500 text-white', icon: <Users size={10} strokeWidth={2.6} /> },
  collaboration: {
    className: 'bg-emerald-500 text-black',
    icon: <Briefcase size={10} strokeWidth={2.6} />,
  },
};

/** "Solicitudes": every pending request in one list, newest first, with accept / reject. */
export default function RequestsPanel({ requests }: { requests: IncomingRequests }) {
  const [filter, setFilter] = useState<Filter>('all');
  const visible =
    filter === 'all'
      ? requests.requests
      : requests.requests.filter((request) => request.kind === filter);

  return (
    <div>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide md:mx-0 md:px-0">
        {FILTERS.map((option) => {
          const count = option.id === 'all' ? requests.total : requests.counts[option.id];
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              aria-pressed={filter === option.id}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
                filter === option.id
                  ? 'bg-white text-black'
                  : 'bg-white/[0.05] text-neutral-400 hover:bg-white/[0.09] hover:text-white'
              }`}
            >
              {option.label}
              {count > 0 && (
                <span
                  className={`tabular-nums ${filter === option.id ? 'text-black/60' : 'text-neutral-500'}`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {requests.failedKinds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-surface-overlay px-4 py-3">
          <p className="text-sm text-neutral-400">No se pudieron cargar algunas solicitudes.</p>
          <button
            type="button"
            onClick={() => void requests.retryFailed()}
            className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-white/30 hover:text-white"
          >
            Reintentar
          </button>
        </div>
      )}

      {visible.length > 0 ? (
        <ul className="space-y-3">
          {visible.map((request) => (
            <li key={request.key}>
              <RequestRow
                request={request}
                busy={requests.busyKeys.has(request.key)}
                onAccept={() => void requests.accept(request)}
                onReject={() => void requests.reject(request)}
              />
            </li>
          ))}
        </ul>
      ) : requests.loading ? (
        <div aria-hidden className="space-y-3">
          {[0, 1].map((index) => (
            <div key={index} className="skeleton h-[84px] rounded-2xl" />
          ))}
        </div>
      ) : requests.failedKinds.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 text-neutral-500">
            <Inbox size={22} strokeWidth={1.6} />
          </span>
          <p className="text-sm text-neutral-400">
            {filter === 'all'
              ? 'No tienes solicitudes pendientes.'
              : 'No hay solicitudes de este tipo.'}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function RequestRow({
  request,
  busy,
  onAccept,
  onReject,
}: {
  request: IncomingRequest;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const navigate = useNavigate();
  const openProfile = () => navigate(`/user/${request.fromUid}`);
  const badge = KIND_BADGE[request.kind];
  const verb =
    request.kind === 'followers'
      ? 'quiere seguirte'
      : request.kind === 'groups'
        ? 'quiere unirse a'
        : 'quiere colaborar en';

  return (
    <article
      aria-label={`Solicitud de ${request.name}`}
      className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-surface-overlay p-4 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <button
          type="button"
          onClick={openProfile}
          aria-label={`Ver perfil de ${request.name}`}
          className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-gold/60"
        >
          <ActorStack
            actors={[{ name: request.name, photoURL: request.photoURL }]}
            badge={
              <span
                className={`flex h-full w-full items-center justify-center rounded-full ${badge.className}`}
              >
                {badge.icon}
              </span>
            }
          />
        </button>
        <div className="min-w-0 pt-0.5">
          <p className="text-[15px] leading-snug text-neutral-300">
            <button
              type="button"
              onClick={openProfile}
              className="font-semibold text-white hover:underline"
            >
              {request.name}
            </button>{' '}
            {verb}
            {request.target && <span className="font-medium text-white"> {request.target}</span>}
            <span className="ml-1.5 whitespace-nowrap text-neutral-500">
              {formatNotificationTime(request.createdAt)}
            </span>
          </p>
          {request.username && <p className="text-sm text-neutral-500">@{request.username}</p>}
          {request.message && (
            <p className="mt-2 rounded-xl bg-white/[0.04] px-3 py-2 text-sm leading-snug text-neutral-300">
              “{request.message}”
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2 pl-14 sm:pl-0">
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="h-9 rounded-full bg-brand-gold px-4 text-sm font-semibold text-black transition-colors hover:bg-brand-gold-light disabled:opacity-60"
        >
          Aceptar
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="h-9 rounded-full bg-white/[0.07] px-4 text-sm font-semibold text-neutral-200 transition-colors hover:bg-white/[0.13] hover:text-white disabled:opacity-60"
        >
          Rechazar
        </button>
      </div>
    </article>
  );
}
