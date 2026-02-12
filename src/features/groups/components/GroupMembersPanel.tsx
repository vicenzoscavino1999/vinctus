import { X, Crown, Shield, UserMinus, Users } from 'lucide-react';

type MemberRole = 'member' | 'moderator' | 'admin';

export type GroupMemberItem = {
  uid: string;
  name: string;
  photoURL: string | null;
  role: MemberRole;
};

interface GroupMembersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  members: GroupMemberItem[];
  isOwner: boolean;
  ownerId?: string | null;
  currentUid?: string | null;
  isLoading: boolean;
  error?: string | null;
  busyUid?: string | null;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onChangeRole: (uid: string, role: MemberRole) => void;
  onRemoveMember: (uid: string) => void;
}

const roleLabel = (role: MemberRole): string => {
  if (role === 'admin') return 'Admin';
  if (role === 'moderator') return 'Mod';
  return 'Miembro';
};

const roleIcon = (role: MemberRole) => {
  if (role === 'admin') return <Crown size={14} className="text-amber-400" />;
  if (role === 'moderator') return <Shield size={14} className="text-sky-300" />;
  return <Users size={14} className="text-neutral-400" />;
};

const GroupMembersPanel = ({
  isOpen,
  onClose,
  members,
  isOwner,
  ownerId,
  currentUid,
  isLoading,
  error,
  busyUid,
  searchQuery,
  onSearchChange,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onChangeRole,
  onRemoveMember,
}: GroupMembersPanelProps) => {
  if (!isOpen) return null;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleMembers = normalizedQuery
    ? members.filter((member) => (member.name || '').toLowerCase().includes(normalizedQuery))
    : members;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end safe-area-inset">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative h-full w-full max-w-md bg-neutral-900 border-l border-neutral-800 shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h3 className="text-lg font-medium text-white">Miembros del grupo</h3>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-neutral-800"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 pt-4">
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar miembro..."
            className="w-full bg-neutral-800/60 border border-neutral-700 rounded-lg px-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/60 transition-colors"
          />
          <p className="text-xs text-neutral-500 mt-2">{members.length} miembro(s)</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="text-center text-neutral-500 py-6">Cargando miembros...</div>
          ) : error ? (
            <div className="text-center text-red-400 py-6">{error}</div>
          ) : visibleMembers.length === 0 ? (
            <div className="text-center text-neutral-500 py-6">No hay miembros aún.</div>
          ) : (
            visibleMembers.map((member) => {
              const isGroupOwner = !!ownerId && member.uid === ownerId;
              const isSelf = !!currentUid && member.uid === currentUid;
              const canManage = isOwner && !isGroupOwner && !isSelf;

              return (
                <div
                  key={member.uid}
                  className="flex items-center gap-3 bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-3"
                >
                  <div className="w-10 h-10 rounded-full bg-neutral-800 overflow-hidden flex-shrink-0">
                    {member.photoURL ? (
                      <img
                        src={member.photoURL}
                        alt={member.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-400 text-sm">
                        {(member.name || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{member.name}</p>
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      {roleIcon(member.role)}
                      <span>{isGroupOwner ? 'Propietario' : roleLabel(member.role)}</span>
                    </div>
                  </div>

                  {canManage ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={member.role}
                        onChange={(event) =>
                          onChangeRole(member.uid, event.target.value as MemberRole)
                        }
                        disabled={busyUid === member.uid}
                        className="bg-neutral-800 border border-neutral-700 text-white text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-amber-500/60"
                      >
                        <option value="member">Miembro</option>
                        <option value="moderator">Mod</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        onClick={() => onRemoveMember(member.uid)}
                        disabled={busyUid === member.uid}
                        className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        title="Expulsar"
                      >
                        <UserMinus size={16} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-500">{isGroupOwner ? 'Owner' : ''}</span>
                  )}
                </div>
              );
            })
          )}

          {hasMore && !isLoading && (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="w-full py-2.5 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors disabled:opacity-50"
            >
              {isLoadingMore ? 'Cargando...' : 'Cargar mas'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupMembersPanel;
