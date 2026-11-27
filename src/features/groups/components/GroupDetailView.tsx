import React, { useState } from 'react';
import {
  Check,
  ChevronLeft,
  Clock,
  Heart,
  Lock,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
} from 'lucide-react';
import { PostImage } from '@/features/posts/components/ProtectedPostMedia';

// ===== INTERFACES (EL CONTRATO) =====

export interface RecentPost {
  id: string;
  title: string;
  author: string;
  time: string;
  /** The first photo, shown as the row's thumbnail. */
  imageUrl?: string | null;
  hasVideo?: boolean;
  likeCount?: number;
  commentCount?: number;
}

export interface TopMember {
  id: string;
  name: string;
  photoURL?: string | null;
  role: string;
  posts: number;
}

export interface GroupData {
  id: string;
  categoryId?: string;
  name: string;
  description: string;
  members: number;
  postsPerWeek: number;
  iconUrl?: string | null;
  icon: string;
  recentPosts: RecentPost[];
  topMembers: TopMember[];
  isPrivate?: boolean;
}

export interface CategoryInfo {
  id: string;
  label: string;
}

export interface GroupDetailViewProps {
  // Estados
  isLoading: boolean;
  error: string | null;
  group: GroupData | null;
  category: CategoryInfo | null;
  isJoined: boolean;
  joinLabel: string;
  joinDisabled: boolean;
  canOpenChat: boolean;
  openingChat: boolean;
  isAuthenticated: boolean;
  canCreatePost: boolean;
  canEditGroup: boolean;
  canLeaveGroup: boolean;
  isPrivateLocked?: boolean;

  // Callbacks
  onJoinGroup: () => void;
  onGoBack: () => void;
  onNavigateToCategory: () => void;
  onOpenPost?: (postId: string) => void;
  onOpenMember?: (uid: string) => void;
  onOpenGroupChat: () => void;
  onOpenCreatePost: () => void;
  onEditGroup: () => void;
  onOpenMembers: () => void;
  onLeaveGroup: () => void;
}

// ===== PIEZAS =====

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString('es-ES')} ${count === 1 ? one : many}`;

const sectionTitle = 'font-display text-[1.375rem] leading-tight text-white md:text-2xl';

const buttonBase =
  'flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm transition-colors disabled:cursor-not-allowed';

/**
 * Join, request, pending or joined, from the container's label: gold while there is something
 * to do, quiet once you are in.
 */
function JoinButton({
  label,
  isJoined,
  disabled,
  onClick,
}: {
  label: string;
  isJoined: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  if (isJoined) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`${buttonBase} flex-1 border border-neutral-700 text-white sm:flex-none`}
      >
        <Check size={16} />
        {label}
      </button>
    );
  }
  if (label === 'Pendiente') {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`${buttonBase} flex-1 border border-amber-500/50 text-amber-400 sm:flex-none`}
      >
        <Clock size={16} />
        {label}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${buttonBase} flex-1 bg-brand-gold font-medium text-black hover:opacity-90 disabled:opacity-50 sm:flex-none`}
    >
      {label}
    </button>
  );
}

/** "⋯": edit the group (owner) and leave it (members). */
function GroupOptionsMenu({
  canEdit,
  canLeave,
  onEdit,
  onLeave,
}: {
  canEdit: boolean;
  canLeave: boolean;
  onEdit: () => void;
  onLeave: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!canEdit && !canLeave) return null;
  const item =
    'flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-white/[0.06]';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Opciones del grupo"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-700 text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-xl">
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
                className={`${item} text-neutral-200`}
              >
                <Pencil size={16} />
                Editar grupo
              </button>
            )}
            {canLeave && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onLeave();
                }}
                className={`${item} text-red-300`}
              >
                <LogOut size={16} />
                Salir
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** A post of the group: thumbnail, title, author, age and counters; opens the post page. */
function GroupPostRow({ post, onOpen }: { post: RecentPost; onOpen?: () => void }) {
  return (
    <div
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!onOpen) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `Abrir publicacion: ${post.title}` : undefined}
      className={`flex items-center gap-4 rounded-2xl px-2 py-3 transition-colors ${
        onOpen ? 'cursor-pointer hover:bg-white/[0.04]' : ''
      }`}
    >
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03]">
        {post.imageUrl ? (
          <PostImage src={post.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : post.hasVideo ? (
          <Play size={18} className="text-neutral-400" />
        ) : (
          <span className="font-display text-2xl text-brand-gold/70">“</span>
        )}
        {post.imageUrl && post.hasVideo && (
          <Play
            size={14}
            className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-display text-lg leading-snug text-white">{post.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-neutral-500">
          <span>
            {post.author} · {post.time}
          </span>
          {(post.likeCount ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <Heart size={12} />
              {post.likeCount}
            </span>
          )}
          {(post.commentCount ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <MessageCircle size={12} />
              {post.commentCount}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

/** A member as a small row: photo, name and role. */
function MemberRow({ member, onOpen }: { member: TopMember; onOpen?: () => void }) {
  return (
    <div
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!onOpen) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `Abrir perfil de ${member.name}` : undefined}
      className={`flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors ${
        onOpen ? 'cursor-pointer hover:bg-white/[0.04]' : ''
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-sm font-semibold text-black">
        {member.photoURL ? (
          <img src={member.photoURL} alt={member.name} className="h-full w-full object-cover" />
        ) : (
          member.name.charAt(0).toUpperCase()
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{member.name}</p>
        <p className="text-xs text-neutral-500">{member.role}</p>
      </div>
    </div>
  );
}

function Notice({ children }: { children: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-white/[0.08] px-4 py-6 text-center text-sm text-neutral-500">
      {children}
    </p>
  );
}

// ===== COMPONENTE VIEW (SOLO UI) =====

/**
 * A group's page: who it is (icon, name, members, activity, category), what you can do (join or
 * request, chat, and edit or leave in "⋯"), its latest posts and its members.
 */
export const GroupDetailView: React.FC<GroupDetailViewProps> = ({
  isLoading,
  error,
  group,
  category,
  isJoined,
  joinLabel,
  joinDisabled,
  canOpenChat,
  openingChat,
  isAuthenticated,
  canCreatePost,
  canEditGroup,
  canLeaveGroup,
  isPrivateLocked = false,
  onJoinGroup,
  onGoBack,
  onNavigateToCategory,
  onOpenPost,
  onOpenMember,
  onOpenGroupChat,
  onOpenCreatePost,
  onEditGroup,
  onOpenMembers,
  onLeaveGroup,
}) => {
  if (isLoading) {
    return (
      <div className="page-category pb-32" role="status" aria-label="Cargando grupo">
        <div className="animate-pulse" aria-hidden="true">
          <div className="mb-6 mt-4 h-6 w-20 rounded bg-neutral-800" />
          <div className="mb-4 flex items-center gap-4">
            <div className="h-20 w-20 rounded-2xl bg-neutral-800" />
            <div className="flex-1 space-y-2">
              <div className="h-8 w-48 rounded bg-neutral-800" />
              <div className="h-4 w-32 rounded bg-neutral-800" />
            </div>
          </div>
          <div className="mb-6 h-16 rounded bg-neutral-800" />
          <div className="h-11 w-64 rounded-lg bg-neutral-800" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-category pb-32 pt-20 text-center">
        <p className="mb-4 text-red-400">{error}</p>
        <button onClick={onGoBack} className="text-brand-gold hover:underline">
          Volver
        </button>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="page-category pb-32 pt-20 text-center">
        <p className="mb-4 text-neutral-500">Grupo no encontrado</p>
        <button onClick={onGoBack} className="text-brand-gold hover:underline">
          Volver a Descubrir
        </button>
      </div>
    );
  }

  return (
    <div className="page-category mx-auto max-w-3xl pb-32">
      <button
        onClick={onGoBack}
        className="mb-6 mt-4 flex items-center gap-1.5 text-neutral-400 transition-colors hover:text-white"
      >
        <ChevronLeft size={20} />
        <span className="text-sm">Volver</span>
      </button>

      <header className="mb-10 border-b border-neutral-900 pb-8">
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-neutral-800 to-neutral-900 shadow-[0_0_0_4px_rgba(212,175,55,0.05)]">
            {group.iconUrl ? (
              <img src={group.iconUrl} alt={group.name} className="h-full w-full object-cover" />
            ) : (
              <span className="font-display text-3xl text-brand-gold/80">{group.icon}</span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="mb-1.5 break-words font-display text-3xl leading-tight text-white sm:text-4xl">
              {group.name}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-400">
              <span>{plural(group.members, 'miembro', 'miembros')}</span>
              <span className="text-neutral-700">·</span>
              <span>
                {group.postsPerWeek === 1
                  ? '1 publicación esta semana'
                  : `${group.postsPerWeek} publicaciones esta semana`}
              </span>
              {group.isPrivate && (
                <>
                  <span className="text-neutral-700">·</span>
                  <span className="flex items-center gap-1">
                    <Lock size={12} />
                    Privado
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {category && (
          <button
            type="button"
            onClick={onNavigateToCategory}
            className="mt-5 rounded-full border border-white/10 px-3.5 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-white/25 hover:text-white"
          >
            {category.label}
          </button>
        )}

        {group.description && (
          <p className="mt-5 max-w-2xl whitespace-pre-line font-light leading-relaxed text-neutral-300">
            {group.description}
          </p>
        )}

        <div className="mt-6 flex items-center gap-3">
          <JoinButton
            label={joinLabel}
            isJoined={isJoined}
            disabled={joinDisabled}
            onClick={onJoinGroup}
          />
          <button
            onClick={onOpenGroupChat}
            disabled={openingChat || !isAuthenticated || !canOpenChat}
            className={`${buttonBase} flex-1 border border-neutral-700 text-white hover:bg-neutral-900 disabled:opacity-50 sm:flex-none`}
            title={
              !isAuthenticated
                ? 'Debes iniciar sesion para chatear'
                : !canOpenChat
                  ? 'Unete al grupo para chatear'
                  : ''
            }
          >
            <MessageCircle size={16} />
            {openingChat ? 'Abriendo...' : 'Chat'}
          </button>
          <GroupOptionsMenu
            canEdit={canEditGroup}
            canLeave={canLeaveGroup}
            onEdit={onEditGroup}
            onLeave={onLeaveGroup}
          />
        </div>
      </header>

      <section className="mb-12">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className={sectionTitle}>Publicaciones</h2>
          {canCreatePost && (
            <button
              onClick={onOpenCreatePost}
              className="inline-flex items-center gap-1.5 rounded-button bg-brand-gold px-3.5 py-1.5 text-xs font-medium uppercase tracking-wider text-black transition-opacity hover:opacity-90"
            >
              <Plus size={14} />
              Publicar
            </button>
          )}
        </div>
        {isPrivateLocked ? (
          <Notice>Este grupo es privado. Solicita acceso para ver las publicaciones.</Notice>
        ) : group.recentPosts.length === 0 ? (
          <Notice>Aún no hay publicaciones en este grupo.</Notice>
        ) : (
          <div className="-mx-2 divide-y divide-white/[0.04]">
            {group.recentPosts.map((post) => (
              <GroupPostRow
                key={post.id}
                post={post}
                onOpen={onOpenPost ? () => onOpenPost(post.id) : undefined}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className={sectionTitle}>Miembros</h2>
          {!isPrivateLocked && (
            <button
              onClick={onOpenMembers}
              className="rounded-full px-2 py-1 text-sm font-semibold text-brand-gold transition-colors hover:text-brand-gold-light"
            >
              Ver miembros
            </button>
          )}
        </div>
        {isPrivateLocked ? (
          <Notice>Solo los miembros pueden ver la lista de participantes.</Notice>
        ) : group.topMembers.length === 0 ? (
          <Notice>No hay miembros destacados por ahora.</Notice>
        ) : (
          <div className="-mx-2 grid grid-cols-1 sm:grid-cols-2">
            {group.topMembers.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                onOpen={onOpenMember ? () => onOpenMember(member.id) : undefined}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default GroupDetailView;
