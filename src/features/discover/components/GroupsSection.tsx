import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Lock, Users } from 'lucide-react';
import { useAuth } from '@/context/auth';
import {
  getGroupJoinStatus,
  getGroups,
  joinPublicGroup,
  sendGroupJoinRequest,
  type FirestoreGroup,
  type GroupJoinStatus,
} from '@/features/groups/api';
import { useSessionResource } from '@/shared/hooks/useSessionResource';
import { CATEGORIES } from '@/shared/constants';
import { AppError } from '@/shared/lib/errors';
import { useToast } from '@/shared/ui/Toast';
import {
  countLabel,
  selectGroups,
  type DiscoverFilters,
} from '@/features/discover/model/discoverCatalog';
import DiscoverSection, {
  SectionEmpty,
  SectionError,
} from '@/features/discover/components/DiscoverSection';

type Props = {
  query: string;
  filters: DiscoverFilters;
};

type GroupAction = 'own' | 'member' | 'pending' | 'join' | 'request';

const ACTION_LABEL: Record<GroupAction, string> = {
  own: 'Tu grupo',
  member: 'Unido',
  pending: 'Pendiente',
  join: 'Unirme',
  request: 'Solicitar',
};

/** "Grupos para ti": the most active groups, or the ones that match the search. */
export default function GroupsSection({ query, filters }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const groupsResource = useSessionResource('discover:groups', getGroups);
  const [statuses, setStatuses] = useState<Record<string, GroupJoinStatus>>({});
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const requested = useRef(new Set<string>());

  const groups = useMemo(
    () => selectGroups(groupsResource.data ?? [], CATEGORIES, { query, filters }),
    [groupsResource.data, query, filters],
  );

  // Membership of the visible groups, asked once per group; a failure just shows the join button.
  useEffect(() => {
    if (!user) return;
    const pending = groups.filter((group) => !requested.current.has(group.id));
    if (pending.length === 0) return;
    pending.forEach((group) => requested.current.add(group.id));
    let active = true;
    void Promise.allSettled(
      pending.map(async (group) => [group.id, await getGroupJoinStatus(group.id, user.uid)]),
    ).then((results) => {
      const updates: Record<string, GroupJoinStatus> = {};
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const [groupId, status] = result.value as [string, GroupJoinStatus];
          updates[groupId] = status;
        } else {
          requested.current.delete(pending[index].id);
          console.error('Error loading group status:', result.reason);
        }
      });
      if (active && Object.keys(updates).length > 0) {
        setStatuses((previous) => ({ ...previous, ...updates }));
      }
    });
    return () => {
      active = false;
    };
  }, [groups, user]);

  const actionFor = (group: FirestoreGroup): GroupAction => {
    if (user && group.ownerId === user.uid) return 'own';
    const isPublic = (group.visibility ?? 'public') === 'public';
    const status = statuses[group.id] ?? 'none';
    if (status === 'member') return 'member';
    if (status === 'pending' && !isPublic) return 'pending';
    return isPublic ? 'join' : 'request';
  };

  const runAction = async (group: FirestoreGroup) => {
    if (!user) {
      showToast('Inicia sesión para unirte a grupos', 'info');
      return;
    }
    const action = actionFor(group);
    if (action === 'own' || action === 'member') {
      navigate(`/group/${group.id}`);
      return;
    }
    if (action === 'pending') {
      showToast('Tu solicitud está pendiente', 'info');
      return;
    }
    setBusyGroupId(group.id);
    try {
      if (action === 'join') {
        await joinPublicGroup(group.id, user.uid);
        setStatuses((previous) => ({ ...previous, [group.id]: 'member' }));
        showToast('Te uniste al grupo', 'success');
      } else {
        if (!group.ownerId) throw new Error('Grupo privado sin dueño');
        await sendGroupJoinRequest({
          groupId: group.id,
          groupName: group.name,
          fromUid: user.uid,
          toUid: group.ownerId,
          message: null,
          fromUserName: user.displayName || 'Usuario',
          fromUserPhoto: user.photoURL || null,
        });
        setStatuses((previous) => ({ ...previous, [group.id]: 'pending' }));
        showToast('Solicitud enviada', 'success');
      }
    } catch (error) {
      console.error('Error joining group:', error);
      showToast(
        error instanceof AppError && error.code === 'PERMISSION_DENIED'
          ? 'No puedes unirte directamente a este grupo.'
          : 'No se pudo procesar la solicitud',
        'error',
      );
    } finally {
      setBusyGroupId(null);
    }
  };

  const searching = Boolean(query.trim() || filters.category);

  return (
    <DiscoverSection title="Grupos para ti">
      {groupsResource.error && !groupsResource.data ? (
        <SectionError message="No se pudieron cargar grupos." onRetry={groupsResource.reload} />
      ) : !groupsResource.data ? (
        <div aria-hidden className="grid gap-3 md:grid-cols-2 md:gap-4">
          {[0, 1].map((index) => (
            <div key={index} className="skeleton h-[104px] rounded-2xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <SectionEmpty>
          {searching
            ? 'Ningún grupo coincide con tu búsqueda.'
            : 'Aún no hay grupos. Crea el primero desde tu perfil.'}
        </SectionEmpty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          {groups.map((group) => {
            const action = actionFor(group);
            const busy = busyGroupId === group.id;
            const isPrivate = (group.visibility ?? 'public') !== 'public';
            const primary = action === 'join' || action === 'request';
            return (
              <article
                key={group.id}
                className="relative flex items-start gap-3.5 rounded-2xl border border-white/[0.06] bg-surface-overlay p-4 transition-colors duration-300 hover:border-white/[0.14]"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-neutral-900">
                  {group.iconUrl ? (
                    <img
                      src={group.iconUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Users size={20} className="text-neutral-500" strokeWidth={1.6} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-semibold text-white">
                    <button
                      type="button"
                      onClick={() => navigate(`/group/${group.id}`)}
                      className="text-left after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-brand-gold/60"
                    >
                      {group.name}
                    </button>
                  </h3>
                  <p className="mt-0.5 line-clamp-2 text-sm text-neutral-500">
                    {group.description || 'Sin descripción.'}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-500">
                    {countLabel(group.memberCount ?? 0, 'miembro', 'miembros')}
                    <span aria-hidden>·</span>
                    {isPrivate ? (
                      <>
                        <Lock size={11} /> Privado
                      </>
                    ) : (
                      'Público'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void runAction(group)}
                  disabled={busy}
                  aria-busy={busy}
                  className={`relative z-10 inline-flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                    primary
                      ? 'bg-brand-gold text-black hover:bg-brand-gold-light'
                      : 'border border-white/15 text-neutral-300 hover:border-white/30 hover:text-white'
                  }`}
                >
                  {action === 'member' && <Check size={12} />}
                  {busy ? 'Procesando…' : ACTION_LABEL[action]}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </DiscoverSection>
  );
}
