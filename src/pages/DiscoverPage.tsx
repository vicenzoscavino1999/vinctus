import { useState, useMemo, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, BookOpen, Check, ArrowRight, Filter } from 'lucide-react';
import { SearchFilters } from '../components';
import { useAppState } from '../context';
import { CATEGORIES, PUBLICATIONS, RECOMMENDED_GROUPS } from '../data';
import { useToast } from '../components/Toast';

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
        toggleJoinGroup,
        isGroupJoined,
        toggleLikePost,
        isPostLiked,
        toggleSavePost,
        isPostSaved
    } = useAppState();
    const { showToast } = useToast();

    // Search filters state (local, not persisted)
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState<SearchFiltersState>({ category: null, sortBy: 'relevance' });

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
    }, [searchQuery, filters]);

    const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchParams(value ? { q: value } : {}, { replace: true });
    };

    return (
        <div className="page-discover pb-32">
            {/* Header */}
            <header className="mb-12 pt-6 md:pt-10 flex flex-col items-center text-center">
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {RECOMMENDED_GROUPS.map(group => (
                        <div
                            key={group.id}
                            role="button"
                            tabIndex={0}
                            className="bg-surface-1 border border-neutral-800/50 rounded-lg p-5 cursor-pointer hover:border-neutral-700 transition-colors"
                            onClick={() => navigate(`/group/${group.id}`)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigate(`/group/${group.id}`);
                                }
                            }}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h3 className="text-white font-medium text-lg">{group.name}</h3>
                                    <p className="text-neutral-500 text-xs mt-1">
                                        {group.members.toLocaleString()} miembros · {group.postsPerWeek} posts/semana
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleJoinGroup(group.id); }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all btn-premium press-scale ${isGroupJoined(group.id)
                                        ? 'bg-brand-gold text-black'
                                        : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                                        }`}
                                >
                                    {isGroupJoined(group.id) ? (
                                        <><Check size={12} /> Unido</>
                                    ) : (
                                        <><BookOpen size={12} /> Unirme</>
                                    )}
                                </button>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-neutral-800/50 mt-3">
                                <div className="flex items-center gap-2 text-neutral-500 text-xs">
                                    <div className={`${CATEGORIES.find(c => c.id === group.categoryId)?.color || 'text-neutral-400'} opacity-60`}>
                                        {(() => {
                                            const cat = CATEGORIES.find(c => c.id === group.categoryId);
                                            return cat ? <cat.icon size={14} strokeWidth={1.5} /> : null;
                                        })()}
                                    </div>
                                    <span>{group.subgroup.name}</span>
                                    <span className="text-neutral-600">{group.subgroup.members} miembros</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
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
            </section>
        </div>
    );
};

export default DiscoverPage;

