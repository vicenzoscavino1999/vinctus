import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, BookOpen, ArrowRight, Filter, Users } from 'lucide-react';
import { SearchFilters } from '../components';
import StoriesWidget from '../components/StoriesWidget';
import { useAppState } from '../context';
import { useAuth } from '../context/AuthContext';
import { CATEGORIES, PUBLICATIONS } from '../data';
import { useToast } from '../components/Toast';
import {
    getGroupJoinStatus,
    getGroupMemberCount,
    getGroupPostsWeekCount,
    getGroups,
    joinPublicGroup,
    sendGroupJoinRequest,
    type FirestoreGroup,
    type GroupJoinStatus
} from '../lib/firestore';

type SearchFiltersState = {
    category: string | null;
    sortBy: string;
};

const DiscoverPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const searchQuery = searchParams.get('q') || '';

    // Load user interests from onboarding for personalization
    const userInterests = useMemo(() => {
        try {
            const stored = localStorage.getItem('vinctus_interests');
            const parsed = stored ? JSON.parse(stored) : [];
            // Ensure it's always an array to prevent .length/.includes errors
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }, []);

    // Use global state from context
    const {
        toggleSaveCategory,
        isCategorySaved,
        toggleLikePost,
        isPostLiked,
        toggleSavePost,
        isPostSaved
    } = useAppState();
    const { user } = useAuth();
    const { showToast } = useToast();

    // Search filters state (local, not persisted)
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState<SearchFiltersState>({ category: null, sortBy: 'relevance' });
    const [groups, setGroups] = useState<FirestoreGroup[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [groupsError, setGroupsError] = useState<string | null>(null);
    const [groupStats, setGroupStats] = useState<Record<string, { members: number; postsWeek: number }>>({});
    const [groupJoinStatusMap, setGroupJoinStatusMap] = useState<Record<string, GroupJoinStatus>>({});
    const [groupActionLoading, setGroupActionLoading] = useState<string | null>(null);

    const filteredCategories = useMemo(() => {
        let result = [...CATEGORIES];

        // Sort: user interests first (personalization from onboarding)
        if (userInterests.length > 0 && filters.sortBy === 'relevance') {
            result.sort((a, b) => {
                const aIsInterest = userInterests.includes(a.id);
                const bIsInterest = userInterests.includes(b.id);
                if (aIsInterest && !bIsInterest) return -1;
                if (!aIsInterest && bIsInterest) return 1;
                return 0;
            });
        }
        if (filters.category) {
            result = result.filter(cat => cat.id === filters.category);
        }

        // Apply search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(cat =>
                cat.label.toLowerCase().includes(query) ||
                cat.description.toLowerCase().includes(query) ||
                cat.subgroups.some(sub => sub.name.toLowerCase().includes(query))
            );
        }

        // Apply sorting
        if (filters.sortBy === 'alphabetical') {
            result = [...result].sort((a, b) => a.label.localeCompare(b.label));
        } else if (filters.sortBy === 'popular') {
            // Sort by number of subgroups as proxy for popularity
            result = [...result].sort((a, b) => b.subgroups.length - a.subgroups.length);
        } else if (filters.sortBy === 'recent') {
            // For now, reverse the default order to simulate "recent" 
            // In production, this would sort by a real timestamp
            result = [...result].reverse();
        }

        return result;
    }, [searchQuery, filters, userInterests]);

    useEffect(() => {
        let isActive = true;

        const loadGroups = async () => {
            setGroupsLoading(true);
            setGroupsError(null);
            try {
                const data = await getGroups();
                const sorted = [...data].sort((a, b) => {
                    const aMembers = a.memberCount ?? 0;
                    const bMembers = b.memberCount ?? 0;
                    if (aMembers !== bMembers) return bMembers - aMembers;
                    const aTime = a.createdAt ? a.createdAt.getTime() : 0;
                    const bTime = b.createdAt ? b.createdAt.getTime() : 0;
                    return bTime - aTime;
                });
                if (isActive) {
                    setGroups(sorted.slice(0, 4));
                }
            } catch (loadError) {
                console.error('Error loading groups:', loadError);
                if (isActive) {
                    setGroupsError('No se pudieron cargar grupos.');
                }
            } finally {
                if (isActive) {
                    setGroupsLoading(false);
                }
            }
        };

        loadGroups();

        return () => {
            isActive = false;
        };
    }, []);

    useEffect(() => {
        if (groups.length === 0) return;
        let isActive = true;
        const pending = groups.filter((group) => groupStats[group.id] === undefined);
        if (pending.length === 0) return;

        const loadStats = async () => {
            try {
                const updates: Record<string, { members: number; postsWeek: number }> = {};
                await Promise.all(
                    pending.map(async (group) => {
                        const [members, postsWeek] = await Promise.all([
                            getGroupMemberCount(group.id),
                            getGroupPostsWeekCount(group.id)
                        ]);
                        updates[group.id] = { members, postsWeek };
                    })
                );
                if (isActive) {
                    setGroupStats((prev) => ({ ...prev, ...updates }));
                }
            } catch (statsError) {
                console.error('Error loading group stats:', statsError);
            }
        };

        loadStats();

        return () => {
            isActive = false;
        };
    }, [groups, groupStats]);

    useEffect(() => {
        if (!user || groups.length === 0) {
            if (!user) setGroupJoinStatusMap({});
            return;
        }
        let isActive = true;
        const pending = groups.filter((group) => groupJoinStatusMap[group.id] === undefined);
        if (pending.length === 0) return;

        const loadStatuses = async () => {
            try {
                const updates: Record<string, GroupJoinStatus> = {};
                await Promise.all(
                    pending.map(async (group) => {
                        const status = await getGroupJoinStatus(group.id, user.uid);
                        updates[group.id] = status;
                    })
                );
                if (isActive) {
                    setGroupJoinStatusMap((prev) => ({ ...prev, ...updates }));
                }
            } catch (statusError) {
                console.error('Error loading group status:', statusError);
            }
        };

        loadStatuses();

        return () => {
            isActive = false;
        };
    }, [groups, user, groupJoinStatusMap]);

    const handleGroupAction = async (group: FirestoreGroup) => {
        if (!user) {
            showToast('Inicia sesion para unirte a grupos', 'info');
            return;
        }

        const status = groupJoinStatusMap[group.id] ?? 'none';
        const isOwner = group.ownerId && group.ownerId === user.uid;
        if (isOwner || status === 'member') {
            navigate(`/group/${group.id}`);
            return;
        }
        if (status === 'pending') {
            showToast('Solicitud pendiente', 'info');
            return;
        }

        setGroupActionLoading(group.id);
        try {
            const visibility = group.visibility ?? 'public';
            if (visibility === 'public') {
                await joinPublicGroup(group.id, user.uid);
                setGroupJoinStatusMap((prev) => ({ ...prev, [group.id]: 'member' }));
                showToast('Te uniste al grupo', 'success');
            } else {
                if (!group.ownerId) {
                    throw new Error('Grupo privado sin owner');
                }
                await sendGroupJoinRequest({
                    groupId: group.id,
                    groupName: group.name,
                    fromUid: user.uid,
                    toUid: group.ownerId,
                    message: null,
                    fromUserName: user.displayName || 'Usuario',
                    fromUserPhoto: user.photoURL || null
                });
                setGroupJoinStatusMap((prev) => ({ ...prev, [group.id]: 'pending' }));
                showToast('Solicitud enviada', 'success');
            }
        } catch (actionError) {
            console.error('Error joining group:', actionError);
            showToast('No se pudo procesar la solicitud', 'error');
        } finally {
            setGroupActionLoading(null);
        }
    };

    const getGroupActionLabel = (group: FirestoreGroup): string => {
        if (user && group.ownerId === user.uid) return 'Tu grupo';
        const status = groupJoinStatusMap[group.id] ?? 'none';
        if (status === 'member') return 'Unido';
        if (status === 'pending') return 'Pendiente';
        return (group.visibility ?? 'public') === 'public' ? 'Unirme' : 'Solicitar';
    };

    const getGroupStats = (group: FirestoreGroup): { members: number; postsWeek: number } => {
        const cached = groupStats[group.id];
        return {
            members: cached?.members ?? group.memberCount ?? 0,
            postsWeek: cached?.postsWeek ?? 0
        };
    };

    const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchParams(value ? { q: value } : {}, { replace: true });
    };

    return (
        <div className="page-discover pb-32">
            {/* Header */}
            <header className="mb-12 pt-6 md:pt-10 flex flex-col items-center text-center">
                <div className="w-full max-w-4xl mb-8">
                    <StoriesWidget />
                </div>
                <span className="text-caption font-medium tracking-[0.3em] text-neutral-500 uppercase mb-4">DESCUBRIR</span>
                <h1 className="text-display-sm md:text-display-md font-display font-normal text-white mb-8 tracking-tight">
                    Curadur{'\u00ED'}a de <span className="text-brand-gold italic">Intereses</span>
                </h1>

                {/* Barra de búsqueda */}
                <div className="w-full max-w-lg mt-4">
                    <div className="relative bg-neutral-900/50 border border-neutral-800 rounded-full px-6 py-3 flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setShowFilters(true)}
                            aria-label="Abrir filtros"
                            className={`p-1 rounded transition-colors ${filters.category || filters.sortBy !== 'relevance' ? 'text-brand-gold' : 'text-neutral-600 hover:text-white'}`}
                        >
                            <Filter size={18} />
                        </button>
                        <input
                            type="text"
                            aria-label="Buscar intereses o grupos"
                            placeholder="Buscar intereses o grupos..."
                            value={searchQuery}
                            onChange={handleSearch}
                            className="flex-1 bg-transparent text-white text-center focus:outline-none placeholder:text-neutral-600 font-light text-sm"
                        />
                        <Search className="text-neutral-600" size={18} />
                    </div>
                </div>
            </header>

            {/* Search Filters Overlay */}
            <SearchFilters
                isOpen={showFilters}
                onClose={() => setShowFilters(false)}
                filters={filters}
                onApply={setFilters}
            />

            {/* Tendencias esta semana */}
            <section className="mb-12">
                <h2 className="text-heading-lg font-display font-normal text-white mb-6">
                    <span className="text-brand-gold">Tendencias</span> esta semana
                </h2>

                <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
                    {filteredCategories.map(cat => (
                        <div
                            key={cat.id}
                            role="button"
                            tabIndex={0}
                            className="flex-shrink-0 w-[280px] bg-surface-overlay border border-neutral-800/50 rounded-card p-5 cursor-pointer card-premium"
                            onClick={() => navigate(`/category/${cat.id}`)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigate(`/category/${cat.id}`);
                                }
                            }}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`${cat.color} opacity-70`}>
                                        <cat.icon size={28} strokeWidth={1} />
                                    </div>
                                    <div>
                                        <h3 className="text-white font-medium text-base">{cat.label}</h3>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleSaveCategory(cat.id); }}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] uppercase tracking-wide transition-colors ${isCategorySaved(cat.id)
                                        ? 'bg-amber-200/20 text-amber-200'
                                        : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                                        }`}
                                >
                                    <BookOpen size={10} />
                                    {isCategorySaved(cat.id) ? 'Guardado' : 'Guardar'}
                                </button>
                            </div>

                            <p className="text-neutral-500 text-sm mb-4 line-clamp-2">{cat.description}</p>

                            <div className="flex flex-wrap gap-2 pt-3 border-t border-neutral-800/50">
                                {cat.subgroups.slice(0, 2).map(sub => (
                                    <span key={sub.id} className="text-[10px] uppercase tracking-wider text-neutral-500 bg-neutral-800/50 px-2 py-1 rounded">
                                        {sub.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Grupos recomendados */}
            <section className="mb-12">
                <h2 className="text-lg font-light text-white mb-6">
                    <span className="text-neutral-400">Grupos</span> recomendados
                </h2>

                {groupsLoading ? (
                    <div className="text-center text-neutral-500 py-6">Cargando grupos...</div>
                ) : groupsError ? (
                    <div className="text-center text-red-400 py-6">{groupsError}</div>
                ) : groups.length === 0 ? (
                    <div className="text-center text-neutral-500 py-6">Aun no hay grupos disponibles.</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {groups.map((group) => {
                            const stats = getGroupStats(group);
                            const joinLabel = getGroupActionLabel(group);
                            const isLoading = groupActionLoading === group.id;
                            const actionLabel = isLoading ? 'Procesando...' : joinLabel;
                            const isJoined = joinLabel === 'Unido' || joinLabel === 'Tu grupo';
                            const isPending = joinLabel === 'Pendiente';
                            const visibilityLabel = (group.visibility ?? 'public') === 'public' ? 'Publico' : 'Privado';

                            return (
                                <div
                                    key={group.id}
                                    role="button"
                                    tabIndex={0}
                                    className="bg-surface-1 border border-neutral-800/50 rounded-lg p-5 cursor-pointer hover:border-neutral-700 transition-colors"
                                    onClick={() => navigate(`/group/${group.id}`)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            navigate(`/group/${group.id}`);
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
                                                void handleGroupAction(group);
                                            }}
                                            disabled={isLoading}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all btn-premium press-scale ${isJoined
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
                                            {stats.members.toLocaleString('es-ES')} miembros - {stats.postsWeek} posts/semana
                                        </div>
                                        <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                                            {visibilityLabel}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Publicaciones */}
            <section>
                <h2 className="text-lg font-light text-white mb-6">Publicaciones</h2>

                <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
                    {PUBLICATIONS.map(pub => (
                        <div
                            key={pub.id}
                            role="button"
                            tabIndex={0}
                            className="flex-shrink-0 w-[320px] md:w-[400px] h-[280px] md:h-[320px] relative rounded-lg overflow-hidden cursor-pointer group"
                            onClick={() => navigate(`/post/${pub.id}`)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigate(`/post/${pub.id}`);
                                }
                            }}
                        >
                            {/* Background image */}
                            <img
                                src={pub.image}
                                alt={pub.title}
                                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                            />

                            {/* Gradient overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />

                            {/* Content */}
                            <div className="absolute inset-0 p-5 flex flex-col justify-between">
                                {/* Top - Group badge */}
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                                        {(() => {
                                            const cat = CATEGORIES.find(c => c.id === pub.categoryId);
                                            return cat ? <cat.icon size={14} className="text-amber-200" strokeWidth={1.5} /> : null;
                                        })()}
                                    </div>
                                    <div>
                                        <p className="text-white text-sm font-medium">{pub.group}</p>
                                        <p className="text-neutral-400 text-xs">{pub.category}</p>
                                    </div>
                                </div>

                                {/* Right side - Interaction buttons */}
                                <div className="absolute right-5 top-1/2 -translate-y-1/2 flex flex-col gap-4">
                                    <button
                                        type="button"
                                        aria-label={`Me gusta: ${pub.likes}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleLikePost(pub.id);
                                        }}
                                        className={`flex flex-col items-center transition-colors ${isPostLiked(pub.id) ? 'text-red-400' : 'text-white/80 hover:text-white'}`}
                                    >
                                        <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center mb-1">
                                            <svg className="w-5 h-5" fill={isPostLiked(pub.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                                        </div>
                                        <span className="text-xs">{pub.likes + (isPostLiked(pub.id) ? 1 : 0)}</span>
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Comentarios: ${pub.comments}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            showToast('Los comentarios estarán disponibles pronto', 'info');
                                        }}
                                        className="flex flex-col items-center text-white/80 hover:text-white transition-colors"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center mb-1">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                                        </div>
                                        <span className="text-xs">{pub.comments}</span>
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="Guardar publicación"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleSavePost(pub.id);
                                        }}
                                        className={`flex flex-col items-center transition-colors ${isPostSaved(pub.id) ? 'text-brand-gold' : 'text-white/80 hover:text-white'}`}
                                    >
                                        <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                                            <svg className="w-5 h-5" fill={isPostSaved(pub.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                                        </div>
                                    </button>
                                </div>

                                {/* Bottom - Title */}
                                <div>
                                    <h3 className="text-white text-lg font-light mb-2 pr-16 line-clamp-2">{pub.title}</h3>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-neutral-400 text-xs">
                                            {(() => {
                                                const cat = CATEGORIES.find(c => c.id === pub.categoryId);
                                                return cat ? <cat.icon size={12} strokeWidth={1.5} /> : null;
                                            })()}
                                            <span>{pub.category}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-neutral-400 text-xs">
                                            <span>Deslizar para ver más</span>
                                            <ArrowRight size={12} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Community feed link */}
                <div className="mt-8 flex justify-center">
                    <button
                        onClick={() => navigate('/feed')}
                        className="group flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-amber-500/10 to-amber-600/10 border border-amber-500/30 rounded-lg text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/20 transition-all"
                    >
                        <Users size={20} />
                        <span className="font-medium">Ver publicaciones de la comunidad</span>
                        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </section>
        </div>
    );
};

export default DiscoverPage;

