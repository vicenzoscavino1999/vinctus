import React from 'react';
import { ChevronLeft, Users, MessageCircle, ArrowRight, Check } from 'lucide-react';

// ===== INTERFACES (EL CONTRATO) =====

export interface RecentPost {
    id: string;
    title: string;
    author: string;
    time: string;
}

export interface TopMember {
    id: string;
    name: string;
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

    // Callbacks
    onJoinGroup: () => void;
    onGoBack: () => void;
    onNavigateToCategory: () => void;
    onOpenPost?: (postId: string) => void;
    onOpenGroupChat: () => void;
    onOpenCreatePost: () => void;
    onEditGroup: () => void;
    onOpenMembers: () => void;
    onLeaveGroup: () => void;
}

// ===== COMPONENTE VIEW (SOLO UI) =====

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
    onJoinGroup,
    onGoBack,
    onNavigateToCategory,
    onOpenPost,
    onOpenGroupChat,
    onOpenCreatePost,
    onEditGroup,
    onOpenMembers,
    onLeaveGroup,
}) => {
    // Loading state
    if (isLoading) {
        return (
            <div className="page-category pb-32">
                <div className="animate-pulse">
                    <div className="h-8 w-24 bg-neutral-800 rounded mb-6 mt-4" />
                    <div className="flex items-start gap-4 mb-4">
                        <div className="w-16 h-16 bg-neutral-800 rounded" />
                        <div className="flex-1">
                            <div className="h-8 w-48 bg-neutral-800 rounded mb-2" />
                            <div className="h-4 w-32 bg-neutral-800 rounded" />
                        </div>
                    </div>
                    <div className="h-20 bg-neutral-800 rounded mb-6" />
                    <div className="h-12 bg-neutral-800 rounded" />
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="page-category pb-32 text-center pt-20">
                <p className="text-red-400 mb-4">{error}</p>
                <button
                    onClick={onGoBack}
                    className="text-brand-gold hover:underline"
                >
                    Volver
                </button>
            </div>
        );
    }

    // Not found state
    if (!group) {
        return (
            <div className="page-category pb-32 text-center pt-20">
                <p className="text-neutral-500 mb-4">Grupo no encontrado</p>
                <button
                    onClick={onGoBack}
                    className="text-brand-gold hover:underline"
                >
                    Volver a Descubrir
                </button>
            </div>
        );
    }

    // Success state - render group details
    return (
        <div className="page-category pb-32">
            {/* Back button */}
            <button
                onClick={onGoBack}
                className="flex items-center gap-2 text-neutral-500 hover:text-white transition-colors mb-6 mt-4"
            >
                <ChevronLeft size={20} />
                <span className="text-sm">Volver</span>
            </button>

            {/* Header */}
            <header className="mb-8">
                <div className="flex items-start gap-4 mb-4">
                    <div className="w-16 h-16 rounded-2xl bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden">
                        {group.iconUrl ? (
                            <img src={group.iconUrl} alt={group.name} className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-2xl text-neutral-200">{group.icon}</span>
                        )}
                    </div>
                    <div className="flex-1">
                        <h1 className="text-display-sm font-display text-white mb-2">{group.name}</h1>
                        <div className="flex items-center gap-3 text-neutral-500 text-sm">
                            <span className="flex items-center gap-1">
                                <Users size={14} />
                                {group.members.toLocaleString()} miembros
                            </span>
                            <span className="flex items-center gap-1">
                                <MessageCircle size={14} />
                                {group.postsPerWeek} posts/semana
                            </span>
                        </div>
                    </div>
                </div>

                <p className="text-neutral-400 text-body-md mb-6">{group.description}</p>

                <div className="flex items-center gap-3">
                    <button
                        onClick={onJoinGroup}
                        disabled={joinDisabled}
                        className={`flex-1 py-3 rounded-button font-medium text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all btn-premium ${isJoined
                            ? 'bg-brand-gold text-black'
                            : joinDisabled
                                ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                : 'bg-neutral-800 text-white hover:bg-neutral-700'
                            }`}
                    >
                        {isJoined ? <><Check size={18} /> {joinLabel}</> : joinLabel}
                    </button>
                    <button
                        onClick={onOpenGroupChat}
                        disabled={openingChat || !isAuthenticated || !canOpenChat}
                        className="px-5 py-3 rounded-button bg-neutral-800 border border-neutral-700 text-white hover:bg-neutral-700 transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={
                            !isAuthenticated
                                ? 'Debes iniciar sesion para chatear'
                                : !canOpenChat
                                    ? 'Unete al grupo para chatear'
                                    : ''
                        }
                    >
                        <MessageCircle size={18} />
                        {openingChat ? 'Abriendo...' : 'Chat'}
                    </button>
                    {canLeaveGroup && (
                        <button
                            onClick={onLeaveGroup}
                            className="px-4 py-3 rounded-button bg-red-500/10 border border-red-500/30 text-red-300 text-sm hover:bg-red-500/20 transition-colors"
                        >
                            Salir
                        </button>
                    )}
                    {canEditGroup && (
                        <button
                            onClick={onEditGroup}
                            className="px-4 py-3 rounded-button bg-neutral-800 border border-neutral-700 text-neutral-200 text-sm hover:bg-neutral-700 transition-colors"
                        >
                            Editar grupo
                        </button>
                    )}
                    {category && (
                        <button
                            onClick={onNavigateToCategory}
                            className="px-4 py-3 rounded-button bg-surface-overlay border border-neutral-800 text-neutral-400 text-sm hover:border-neutral-700 transition-colors"
                        >
                            Ver {category.label}
                        </button>
                    )}
                </div>
            </header>

            {/* Recent posts */}
            <section className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-heading-lg font-display text-white">Publicaciones recientes</h2>
                    {canCreatePost && (
                        <button
                            onClick={onOpenCreatePost}
                            className="px-4 py-2 rounded-button bg-brand-gold text-black text-xs uppercase tracking-wider font-medium hover:opacity-90 transition-opacity"
                        >
                            Publicar
                        </button>
                    )}
                </div>
                <div className="space-y-3 stagger-premium">
                    {group.recentPosts.length === 0 ? (
                        <div className="text-center text-neutral-500 py-6">
                            Aun no hay publicaciones en este grupo.
                        </div>
                    ) : (
                        group.recentPosts.map(post => (
                            <div
                                key={post.id}
                                onClick={() => onOpenPost?.(post.id)}
                                onKeyDown={(event) => {
                                    if (!onOpenPost) return;
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        onOpenPost(post.id);
                                    }
                                }}
                                role={onOpenPost ? 'button' : undefined}
                                tabIndex={onOpenPost ? 0 : undefined}
                                aria-label={onOpenPost ? `Abrir publicacion: ${post.title}` : undefined}
                                className={`bg-surface-overlay border border-neutral-800/50 rounded-card p-4 flex items-center justify-between card-premium ${onOpenPost ? 'cursor-pointer' : ''}`}
                            >
                                <div>
                                    <p className="text-white font-medium mb-1">{post.title}</p>
                                    <p className="text-neutral-500 text-sm">{post.author} - {post.time}</p>
                                </div>
                                <ArrowRight size={16} className="text-neutral-600" />
                            </div>
                        ))
                    )}
                </div>
            </section>

            {/* Top members */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-heading-lg font-display text-white">Miembros destacados</h2>
                    <button
                        onClick={onOpenMembers}
                        className="text-xs uppercase tracking-wider text-amber-400 hover:text-amber-300 transition-colors"
                    >
                        Ver miembros
                    </button>
                </div>
                {group.topMembers.length === 0 ? (
                    <div className="text-center text-neutral-500 py-6">
                        No hay miembros destacados por ahora.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {group.topMembers.map(member => (
                            <div
                                key={member.id}
                                className="bg-surface-overlay border border-neutral-800/50 rounded-card p-4 text-center"
                            >
                                <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mx-auto mb-3">
                                    <span className="text-lg">{member.name.charAt(0)}</span>
                                </div>
                                <p className="text-white font-medium">{member.name}</p>
                                <p className="text-brand-gold text-xs uppercase tracking-wider">{member.role}</p>
                                <p className="text-neutral-500 text-xs mt-1">{member.posts} posts</p>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

export default GroupDetailView;
