import { Check, Clock, Lock, MessageCircle, UserCheck, UserPlus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PersonResult } from '@/features/discover/hooks/usePeopleSearch';

type Actions = {
  follow: (person: PersonResult) => unknown;
  acceptRequest: (person: PersonResult) => unknown;
  declineRequest: (person: PersonResult) => unknown;
  cancelRequest: (person: PersonResult) => unknown;
  unfollow: (person: PersonResult) => unknown;
  message: (person: PersonResult) => unknown;
};

const isSafeHttpUrl = (value: string | null | undefined): value is string =>
  typeof value === 'string' && /^https?:\/\//i.test(value.trim());

const spinner = (
  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" />
);

const quietButton =
  'inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 px-3.5 text-sm text-neutral-200 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50';

/** One person: photo, name, what matters about them, and the follow action that fits. */
export default function PersonRow({
  person,
  busy,
  actions,
}: {
  person: PersonResult;
  busy: boolean;
  actions: Actions;
}) {
  const navigate = useNavigate();
  const name = person.displayName ?? 'Usuario sin nombre';
  const meta =
    person.followStatus === 'pending_received'
      ? 'Quiere seguirte'
      : person.isMutual
        ? 'Se siguen'
        : person.accountVisibility === 'private'
          ? 'Cuenta privada'
          : null;

  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-white/[0.06] bg-surface-overlay px-4 py-3 transition-colors hover:border-white/[0.12]">
      <button
        type="button"
        onClick={() => navigate(`/user/${person.uid}`)}
        className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-800 text-base font-medium text-neutral-300">
          {isSafeHttpUrl(person.photoURL) ? (
            <img
              src={person.photoURL}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            (person.displayName?.charAt(0) ?? '?').toUpperCase()
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-white">{name}</span>
          {meta && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
              {person.accountVisibility === 'private' && meta === 'Cuenta privada' && (
                <Lock size={11} />
              )}
              {meta}
            </span>
          )}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-2">{action(person, busy, actions)}</div>
    </div>
  );
}

function action(person: PersonResult, busy: boolean, actions: Actions) {
  const messageButton = person.isMutual ? (
    <button
      type="button"
      onClick={() => actions.message(person)}
      disabled={busy}
      aria-label="Enviar mensaje"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-neutral-200 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
    >
      <MessageCircle size={17} />
    </button>
  ) : null;

  switch (person.followStatus) {
    case 'following':
      return (
        <>
          {messageButton}
          <button
            type="button"
            onClick={() => actions.unfollow(person)}
            disabled={busy}
            className={quietButton}
          >
            {busy ? (
              spinner
            ) : (
              <>
                <UserCheck size={15} />
                Siguiendo
              </>
            )}
          </button>
        </>
      );
    case 'pending_sent':
      return (
        <button
          type="button"
          onClick={() => actions.cancelRequest(person)}
          disabled={busy}
          className={quietButton}
        >
          {busy ? (
            spinner
          ) : (
            <>
              <Clock size={15} />
              Pendiente
            </>
          )}
        </button>
      );
    case 'pending_received':
      return (
        <>
          <button
            type="button"
            onClick={() => actions.acceptRequest(person)}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1 rounded-full bg-brand-gold px-3.5 text-sm font-semibold text-black transition-colors hover:bg-brand-gold-light disabled:opacity-50"
          >
            <Check size={15} />
            Aceptar
          </button>
          <button
            type="button"
            onClick={() => actions.declineRequest(person)}
            disabled={busy}
            aria-label="Rechazar solicitud"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-neutral-400 transition-colors hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
          >
            <X size={15} />
          </button>
        </>
      );
    default:
      return (
        <button
          type="button"
          onClick={() => actions.follow(person)}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-gold px-4 text-sm font-semibold text-black transition-colors hover:bg-brand-gold-light disabled:opacity-50"
        >
          {busy ? (
            spinner
          ) : (
            <>
              <UserPlus size={15} />
              Seguir
            </>
          )}
        </button>
      );
  }
}
