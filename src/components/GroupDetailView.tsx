import React from 'react';
import { ChevronLeft, Users, MessageCircle, ArrowRight, Check } from 'lucide-react';

// ===== INTERFACES (EL CONTRATO) =====

export interface RecentPost {
    id: number;
    title: string;
    author: string;
    time: string;
}

export interface TopMember {
    id: number;
    name: string;
    role: string;
    posts: number;
}

export interface GroupData {
    id: number;
    name: string;
    description: string;
    members: number;
    postsPerWeek: number;
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

    // Callbacks
    onJoinGroup: () => void;
    onGoBack: () => void;
    onNavigateToCategory: () => void;
}

// ===== COMPONENTE VIEW (SOLO UI) =====

export const GroupDetailView: React.FC<GroupDetailViewProps> = ({
    isLoading,
    error,
    group,
    category,
    isJoined,
    onJoinGroup,
    onGoBack,
    onNavigateToCategory,
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
                    <span className="text-5xl">{group.icon}</span>
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
                        className={`flex-1 py-3 rounded-button font-medium text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all btn-premium ${isJoined ? 'bg-brand-gold text-black' : 'bg-neutral-800 text-white hover:bg-neutral-700'
                            }`}
                    >
                        {isJoined ? <><Check size={18} /> Unido</> : 'Unirme al grupo'}
                    </button>
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
                <h2 className="text-heading-lg font-display text-white mb-4">Publicaciones recientes</h2>
                <div className="space-y-3 stagger-premium">
                    {group.recentPosts.map(post => (
                        <div
                            key={post.id}
                            className="bg-surface-overlay border border-neutral-800/50 rounded-card p-4 flex items-center justify-between card-premium cursor-pointer"
                        >
                            <div>
                                <p className="text-white font-medium mb-1">{post.title}</p>
                                <p className="text-neutral-500 text-sm">{post.author} · {post.time}</p>
                            </div>
                            <ArrowRight size={16} className="text-neutral-600" />
                        </div>
                    ))}
                </div>
            </section>

            {/* Top members */}
            <section>
                <h2 className="text-heading-lg font-display text-white mb-4">Miembros destacados</h2>
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
            </section>
        </div>
    );
};

export default GroupDetailView;
