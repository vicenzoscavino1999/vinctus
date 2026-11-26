import { useMemo, useState } from 'react';
import { CheckCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/auth';
import ActivityPanel from '@/features/notifications/components/ActivityPanel';
import RequestsPanel from '@/features/notifications/components/RequestsPanel';
import { useBlockedUsers } from '@/features/notifications/hooks/blockedUsers';
import { useActivityFeed } from '@/features/notifications/hooks/useActivityFeed';
import { useIncomingRequests } from '@/features/notifications/hooks/useIncomingRequests';
import { groupActivity } from '@/features/notifications/model/activityFeed';

type Tab = 'activity' | 'requests';

/**
 * Notifications: "Actividad" (likes, comments and follows, grouped and by period) and
 * "Solicitudes" (follow, group and collaboration requests in one list). Both load at once, so
 * the tab badges are right from the start; the blocked list is asked once for both.
 */
function NotificationsSession({ uid }: { uid: string }) {
  const [tab, setTab] = useState<Tab>('activity');
  const blocked = useBlockedUsers(uid);
  const feed = useActivityFeed(uid, blocked);
  const requests = useIncomingRequests(uid, blocked);
  // Rows with something unread: repeated notifications count once, as they are shown.
  const unreadRows = useMemo(
    () =>
      groupActivity(feed.items.filter((item) => !item.read)).reduce(
        (total, section) => total + section.groups.length,
        0,
      ),
    [feed.items],
  );
  const refreshing = feed.status === 'loading' || requests.loading;

  const refresh = () => {
    void feed.reload();
    void requests.reload();
  };

  return (
    <div className="page-notifications mx-auto max-w-3xl pb-28 pt-2 md:pt-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-neutral-500">
            Bandeja
          </p>
          <h1 className="mt-2 font-display text-[2rem] leading-[1.1] text-white md:text-[2.5rem]">
            Notificaciones
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
          {tab === 'activity' && unreadRows > 0 && (
            <button
              type="button"
              onClick={() => void feed.markAllRead()}
              disabled={feed.markingAll}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-brand-gold transition-colors hover:bg-brand-gold/10 disabled:opacity-60"
            >
              <CheckCheck size={16} />
              <span className="sr-only sm:not-sr-only">
                {feed.markingAll ? 'Marcando…' : 'Marcar todo como leído'}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Actualizar"
            title="Actualizar"
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Tipo de notificaciones"
        className="mt-6 inline-flex rounded-full border border-white/[0.08] bg-white/[0.03] p-1"
      >
        <TabButton
          selected={tab === 'activity'}
          count={unreadRows}
          onClick={() => setTab('activity')}
        >
          Actividad
        </TabButton>
        <TabButton
          selected={tab === 'requests'}
          count={requests.total}
          onClick={() => setTab('requests')}
        >
          Solicitudes
        </TabButton>
      </div>

      <div className="mt-6">
        {tab === 'activity' ? (
          <ActivityPanel
            feed={feed}
            requests={requests}
            onOpenRequests={() => setTab('requests')}
          />
        ) : (
          <RequestsPanel requests={requests} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  selected,
  count,
  onClick,
  children,
}: {
  selected: boolean;
  count: number;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${
        selected ? 'bg-white/[0.1] text-white' : 'text-neutral-400 hover:text-white'
      }`}
    >
      <span>{children}</span>
      {count > 0 && (
        <span className="min-w-[20px] rounded-full bg-brand-gold px-1.5 text-center text-[11px] font-bold leading-5 text-black">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

const NotificationsPage = () => {
  const { user } = useAuth();
  if (!user) {
    return (
      <p className="py-16 text-center text-sm text-neutral-500">
        Inicia sesión para ver tus notificaciones.
      </p>
    );
  }
  // A new account starts from a clean page: no data of the previous one survives.
  return <NotificationsSession key={user.uid} uid={user.uid} />;
};

export default NotificationsPage;
