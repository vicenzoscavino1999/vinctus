import { useState, type ReactNode } from 'react';
import {
  Ban,
  Check,
  Clock,
  Flag,
  Loader2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import type { FollowStatus } from '@/features/profile/api';

type Props = {
  displayName: string;
  photoURL: string | null;
  role: string | null;
  location: string | null;
  bio: string | null;
  /** The buttons under the name; empty on your own profile seen from outside. */
  actions?: ReactNode;
  /** A request from this person to follow you, above the buttons. */
  request?: ReactNode;
};

/**
 * The top of someone else's profile, with the same look as your own: the photo with a thin gold
 * ring, the name, role and place on one line, the bio, then the buttons.
 */
export default function UserProfileHeader({
  displayName,
  photoURL,
  role,
  location,
  bio,
  actions,
  request,
}: Props) {
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';
  return (
    <header className="border-b border-neutral-900 pb-8">
      <div className="flex min-w-0 items-center gap-4 sm:gap-6">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-500/30 bg-gradient-to-br from-amber-500/20 to-amber-600/20 font-serif text-3xl text-amber-500 shadow-[0_0_0_4px_rgba(212,175,55,0.06)] sm:h-24 sm:w-24">
          {photoURL ? (
            <img
              src={photoURL}
              alt={displayName}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            initial
          )}
        </div>
        <div className="min-w-0">
          <h1 className="mb-1.5 break-words font-serif text-3xl font-light leading-tight text-white sm:text-4xl">
            {displayName}
          </h1>
          {(role || location) && (
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-neutral-400">
              {role && <span>{role}</span>}
              {role && location && <span className="text-neutral-700">·</span>}
              {location && (
                <span className="flex items-center text-neutral-500">
                  <MapPin size={12} className="mr-1 shrink-0" />
                  {location}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {bio && (
        <p className="mt-6 max-w-2xl whitespace-pre-line font-light leading-relaxed text-neutral-300">
          {bio}
        </p>
      )}

      {request && <div className="mt-6">{request}</div>}
      {actions && <div className="mt-6">{actions}</div>}
    </header>
  );
}

const buttonBase =
  'flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm transition-colors disabled:opacity-50';

/** Seguir (gold), Siguiendo or Pendiente; the same three states as before. */
export function FollowButton({
  status,
  busy,
  onFollow,
  onUnfollow,
  onCancelRequest,
}: {
  status: FollowStatus;
  busy: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  onCancelRequest: () => void;
}) {
  if (status === 'following') {
    return (
      <button
        type="button"
        onClick={onUnfollow}
        disabled={busy}
        className={`${buttonBase} flex-1 border border-neutral-700 text-white hover:bg-neutral-900 sm:flex-none`}
      >
        {busy ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <>
            <UserCheck size={16} />
            Siguiendo
          </>
        )}
      </button>
    );
  }
  if (status === 'pending_sent') {
    return (
      <button
        type="button"
        onClick={onCancelRequest}
        disabled={busy}
        className={`${buttonBase} flex-1 border border-amber-500/50 text-amber-400 hover:bg-amber-500/10 sm:flex-none`}
      >
        {busy ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <>
            <Clock size={16} />
            Pendiente
          </>
        )}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onFollow}
      disabled={busy}
      className={`${buttonBase} flex-1 bg-brand-gold font-medium text-black hover:opacity-90 sm:flex-none`}
    >
      {busy ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <>
          <UserPlus size={16} />
          Seguir
        </>
      )}
    </button>
  );
}

export function MessageButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`${buttonBase} flex-1 border border-neutral-700 text-white hover:bg-neutral-900 sm:flex-none`}
    >
      <MessageCircle size={16} />
      Mensaje
    </button>
  );
}

/** "⋯": block and report live here, out of the main buttons. */
export function ProfileOptionsMenu({
  busy,
  onBlock,
  onReport,
}: {
  busy: boolean;
  /** Missing when the person is already blocked. */
  onBlock?: () => void;
  onReport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const item =
    'flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-white/[0.06] disabled:opacity-50';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Opciones del perfil"
        aria-expanded={open}
        className="flex h-[42px] w-[42px] items-center justify-center rounded-lg border border-neutral-700 text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-xl">
            {onBlock && (
              <button
                type="button"
                disabled={busy}
                aria-label="Bloquear usuario"
                onClick={() => {
                  setOpen(false);
                  onBlock();
                }}
                className={`${item} text-red-300`}
              >
                <Ban size={16} />
                Bloquear
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              aria-label="Reportar usuario"
              onClick={() => {
                setOpen(false);
                onReport();
              }}
              className={`${item} text-neutral-200`}
            >
              <Flag size={16} />
              Reportar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** "<nombre> quiere seguirte", with Aceptar solicitud and Rechazar. */
export function IncomingRequestNotice({
  name,
  busy,
  onAccept,
  onDecline,
}: {
  name: string;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
      <p className="text-sm text-neutral-300">
        <span className="font-medium text-white">{name}</span> quiere seguirte
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDecline}
          disabled={busy}
          className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-white/30 hover:text-white disabled:opacity-50"
        >
          Rechazar
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          aria-label="Aceptar solicitud"
          className="flex items-center gap-1.5 rounded-full bg-brand-gold px-3.5 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Aceptar
        </button>
      </div>
    </div>
  );
}
