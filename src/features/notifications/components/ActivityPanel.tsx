import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  ChevronRight,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type { ActivityFeed } from '@/features/notifications/hooks/useActivityFeed';
import type { IncomingRequests } from '@/features/notifications/hooks/useIncomingRequests';
import {
  activitySentence,
  describeActivity,
  formatNotificationTime,
  groupActivity,
  matchesFilter,
  type ActivityFilter,
  type ActivityGroup,
} from '@/features/notifications/model/activityFeed';
import { ActorStack } from '@/features/notifications/components/NotificationAvatar';

const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'unread', label: 'No leídas' },
  { id: 'post_like', label: 'Me gusta' },
  { id: 'post_comment', label: 'Comentarios' },
  { id: 'follow', label: 'Seguidores' },
];

type Props = {
  feed: ActivityFeed;
  requests: IncomingRequests;
  onOpenRequests: () => void;
};

/** "Actividad": pending requests at the top, then likes, comments and follows by period. */
export default function ActivityPanel({ feed, requests, onOpenRequests }: Props) {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const sections = useMemo(
    () => groupActivity(feed.items.filter((item) => matchesFilter(item, filter))),
    [feed.items, filter],
  );

  return (
    <div>
      {requests.total > 0 && <RequestsSummary requests={requests} onOpen={onOpenRequests} />}

      <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide md:mx-0 md:px-0">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFilter(option.id)}
            aria-pressed={filter === option.id}
            className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
              filter === option.id
                ? 'bg-white text-black'
                : 'bg-white/[0.05] text-neutral-400 hover:bg-white/[0.09] hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {feed.status === 'loading' && feed.items.length === 0 ? (
        <ActivitySkeleton />
      ) : feed.status === 'error' && feed.items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-neutral-400">No se pudieron cargar las notificaciones.</p>
          <button
            type="button"
            onClick={() => void feed.reload()}
            className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-neutral-200 transition-colors hover:border-white/30 hover:text-white"
          >
            Reintentar
          </button>
        </div>
      ) : sections.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 text-neutral-500">
            <Bell size={22} strokeWidth={1.6} />
          </span>
          <p className="text-sm text-neutral-400">
            {filter === 'all'
              ? 'No hay actividad todavía.'
              : 'No hay actividad que coincida con tu filtro.'}
          </p>
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.id} aria-label={section.title} className="mt-5">
            <h2 className="mb-1 px-3 text-sm font-semibold text-white">{section.title}</h2>
            <ul className="space-y-0.5">
              {section.groups.map((group) => (
                <li key={group.key}>
                  <ActivityRow
                    group={group}
                    busy={feed.pendingKeys.has(group.key)}
                    onMarkRead={(silent) => void feed.markRead(group, silent)}
                    onRemove={() => void feed.remove(group)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {feed.hasMore && sections.length > 0 && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => void feed.loadMore()}
            disabled={feed.loadingMore}
            className="rounded-full border border-white/15 px-5 py-2 text-sm text-neutral-300 transition-colors hover:border-white/30 hover:text-white disabled:opacity-60"
          >
            {feed.loadingMore ? 'Cargando…' : 'Cargar más'}
          </button>
        </div>
      )}
    </div>
  );
}

const BADGES: Record<ActivityGroup['type'], { className: string; icon: ReactNode }> = {
  post_like: {
    className: 'bg-rose-500 text-white',
    icon: <Heart size={10} fill="currentColor" strokeWidth={0} />,
  },
  post_comment: {
    className: 'bg-sky-500 text-white',
    icon: <MessageCircle size={10} fill="currentColor" strokeWidth={0} />,
  },
  follow: {
    className: 'bg-brand-gold text-black',
    icon: <UserPlus size={10} strokeWidth={2.6} />,
  },
};

function ActivityRow({
  group,
  busy,
  onMarkRead,
  onRemove,
}: {
  group: ActivityGroup;
  busy: boolean;
  onMarkRead: (silent: boolean) => void;
  onRemove: () => void;
}) {
  const navigate = useNavigate();
  const { names, others, action } = describeActivity(group);
  const latest = group.latest;
  const target =
    group.type === 'follow'
      ? `/user/${latest.fromUid}`
      : latest.postId
        ? `/post/${latest.postId}`
        : null;
  const detail =
    group.type === 'post_comment'
      ? latest.commentText
      : group.type === 'post_like'
        ? latest.postSnippet
        : null;
  const badge = BADGES[group.type];

  const open = () => {
    if (!target) return;
    if (!group.read) onMarkRead(true);
    navigate(target);
  };

  const sentence = (
    <>
      <strong className="font-semibold text-white">{names[0]}</strong>
      {names[1] && (
        <>
          {' y '}
          <strong className="font-semibold text-white">{names[1]}</strong>
        </>
      )}
      {others > 0 && ` y ${others} ${others === 1 ? 'persona más' : 'personas más'}`} {action}
    </>
  );

  return (
    <article
      aria-label={activitySentence(group)}
      className={`group relative flex items-start gap-3 rounded-2xl py-3 pl-4 pr-2 transition-colors hover:bg-white/[0.035] ${
        group.read ? '' : 'bg-brand-gold/[0.045]'
      }`}
    >
      {!group.read && (
        <span
          aria-label="No leída"
          className="absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-brand-gold"
        />
      )}
      <ActorStack
        actors={group.actors}
        badge={
          <span
            className={`flex h-full w-full items-center justify-center rounded-full ${badge.className}`}
          >
            {badge.icon}
          </span>
        }
      />

      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[15px] leading-snug text-neutral-300">
          {target ? (
            <button
              type="button"
              onClick={open}
              className="text-left after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-brand-gold/60"
            >
              {sentence}
            </button>
          ) : (
            sentence
          )}{' '}
          <span className="whitespace-nowrap text-neutral-500">
            {formatNotificationTime(latest.createdAt)}
          </span>
        </p>
        {detail && (
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-neutral-500">
            {group.type === 'post_comment' ? `“${detail}”` : detail}
          </p>
        )}
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-0.5 self-center">
        {group.type === 'follow' && (
          <button
            type="button"
            onClick={open}
            className="mr-1 hidden h-8 items-center rounded-full bg-white/[0.07] px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.13] sm:inline-flex"
          >
            Ver perfil
          </button>
        )}
        {/* Wide screens: quiet icons that appear on hover. Phones: one "⋯" menu, so the text keeps its width. */}
        <span className="hidden items-center gap-0.5 transition-opacity md:flex md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          {!group.read && (
            <button
              type="button"
              onClick={() => onMarkRead(false)}
              disabled={busy}
              aria-label="Marcar como leída"
              title="Marcar como leída"
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-50"
            >
              <Check size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label="Eliminar notificación"
            title="Eliminar notificación"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-white/[0.07] hover:text-red-300 disabled:opacity-50"
          >
            <Trash2 size={15} />
          </button>
        </span>
        <RowMenu
          read={group.read}
          busy={busy}
          onMarkRead={() => onMarkRead(false)}
          onRemove={onRemove}
        />
      </div>
    </article>
  );
}

/** The row's actions on phones, where there is no hover. */
function RowMenu({
  read,
  busy,
  onMarkRead,
  onRemove,
}: {
  read: boolean;
  busy: boolean;
  onMarkRead: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !container.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const itemClass =
    'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-neutral-200 transition-colors hover:bg-white/[0.06] disabled:opacity-50';

  return (
    <div ref={container} className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Más opciones"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-white/[0.07] hover:text-white"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-52 overflow-hidden rounded-xl border border-white/10 bg-neutral-900 py-1 shadow-2xl"
        >
          {!read && (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={run(onMarkRead)}
              className={itemClass}
            >
              <Check size={16} className="text-neutral-400" />
              Marcar como leída
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={run(onRemove)}
            className={`${itemClass} text-red-300`}
          >
            <Trash2 size={15} />
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}

/** "Solicitudes": who is waiting for an answer; opens the requests tab. */
function RequestsSummary({ requests, onOpen }: { requests: IncomingRequests; onOpen: () => void }) {
  const [first, second] = requests.requests;
  const others = requests.total - 1;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-white/[0.07] bg-surface-overlay px-4 py-3.5 text-left transition-colors hover:border-white/[0.14]"
    >
      <ActorStack
        actors={[first, second].filter(Boolean).map((request) => ({
          name: request.name,
          photoURL: request.photoURL,
        }))}
        badge={
          <span className="flex h-full w-full items-center justify-center rounded-full bg-brand-gold text-[10px] font-bold text-black">
            {Math.min(requests.total, 99)}
          </span>
        }
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-white">Solicitudes pendientes</span>
        <span className="block truncate text-sm text-neutral-400">
          {first?.name}
          {others > 0 ? ` y ${others} más` : ''}{' '}
          {requests.total === 1 ? 'espera tu respuesta' : 'esperan tu respuesta'}
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-neutral-500" aria-hidden />
    </button>
  );
}

function ActivitySkeleton() {
  return (
    <div aria-hidden className="mt-5 space-y-2">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <div className="skeleton h-11 w-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-3/4" />
            <div className="skeleton h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
