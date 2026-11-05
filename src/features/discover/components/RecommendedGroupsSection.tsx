import { Users } from 'lucide-react';
import type { FirestoreGroup } from '@/features/groups/api';

type RecommendedGroupsSectionProps = {
  groups: FirestoreGroup[];
  loading: boolean;
  error: string | null;
  /** Id of the group whose join action is running. */
  actionLoadingId: string | null;
  getActionLabel: (group: FirestoreGroup) => string;
  onAction: (group: FirestoreGroup) => void;
  onOpenGroup: (groupId: string) => void;
};

const RecommendedGroupCard = ({
  group,
  joinLabel,
  isLoading,
  onAction,
  onOpen,
}: {
  group: FirestoreGroup;
  joinLabel: string;
  isLoading: boolean;
  onAction: (group: FirestoreGroup) => void;
  onOpen: (groupId: string) => void;
}) => {
  const members = group.memberCount ?? 0;
  const postsWeek = 0;
  const actionLabel = isLoading ? 'Procesando...' : joinLabel;
  const isJoined = joinLabel === 'Unido' || joinLabel === 'Tu grupo';
  const isPending = joinLabel === 'Pendiente';
  const visibilityLabel = (group.visibility ?? 'public') === 'public' ? 'Publico' : 'Privado';

  return (
    <div
      role="button"
      tabIndex={0}
      className="bg-surface-1 border border-neutral-800/50 rounded-lg p-5 cursor-pointer hover:border-neutral-700 transition-colors"
      onClick={() => onOpen(group.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(group.id);
        }
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center overflow-hidden">
            {group.iconUrl ? (
              <img src={group.iconUrl} alt={group.name} className="w-full h-full object-cover" />
            ) : (
              <Users size={20} className="text-neutral-500" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-white font-medium text-lg truncate">{group.name}</h3>
            <p className="text-neutral-500 text-sm mt-1 line-clamp-2">
              {group.description || 'Sin descripcion.'}
            </p>
          </div>
        </div>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onAction(group);
          }}
          disabled={isLoading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all btn-premium press-scale ${
            isJoined
              ? 'bg-brand-gold text-black'
              : isPending
                ? 'bg-neutral-800 text-neutral-500'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
          } ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {actionLabel}
        </button>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-neutral-800/50 mt-4">
        <div className="text-neutral-500 text-xs">
          {members.toLocaleString('es-ES')} miembros - {postsWeek} posts/semana
        </div>
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">
          {visibilityLabel}
        </span>
      </div>
    </div>
  );
};

/** "Grupos recomendados". */
const RecommendedGroupsSection = ({
  groups,
  loading,
  error,
  actionLoadingId,
  getActionLabel,
  onAction,
  onOpenGroup,
}: RecommendedGroupsSectionProps) => (
  <section className="mb-12">
    <h2 className="text-lg font-light text-white mb-6">
      <span className="text-neutral-400">Grupos</span> recomendados
    </h2>

    {loading ? (
      <div className="text-center text-neutral-500 py-6">Cargando grupos...</div>
    ) : error ? (
      <div className="text-center text-red-400 py-6">{error}</div>
    ) : groups.length === 0 ? (
      <div className="text-center text-neutral-500 py-6">Aun no hay grupos disponibles.</div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((group) => (
          <RecommendedGroupCard
            key={group.id}
            group={group}
            joinLabel={getActionLabel(group)}
            isLoading={actionLoadingId === group.id}
            onAction={onAction}
            onOpen={onOpenGroup}
          />
        ))}
      </div>
    )}
  </section>
);

export default RecommendedGroupsSection;
