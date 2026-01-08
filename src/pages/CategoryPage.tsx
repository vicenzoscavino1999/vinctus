import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Hash, ArrowRight, Feather } from 'lucide-react';
import {
    ApiContentCard,
    LibraryItem,
    SkeletonContentGrid,
    EmptyState,
    ErrorState,
    useToast
} from '../components';
import { useApiContent } from '../hooks';
import { CATEGORIES } from '../data';

const CategoryPage = () => {
    const { categoryId } = useParams();
    const navigate = useNavigate();
    const [viewMode, setViewMode] = useState('live');
    const [selectedSubgroup, setSelectedSubgroup] = useState(null);
    const { showToast } = useToast();

    // Reset selectedSubgroup when category changes
    useEffect(() => {
        setSelectedSubgroup(null);
    }, [categoryId]);

    const category = CATEGORIES.find(c => c.id === categoryId);

    // Get API query from selected subgroup or default to first one
    const apiQuery = selectedSubgroup?.apiQuery || category?.subgroups[0]?.apiQuery || category?.id;

    // Fetch live content from API with toast notifications
    const { data: liveContent, loading, error } = useApiContent(
        category?.apiSource,
        apiQuery,
        8,
        showToast
    );

    if (!category) {
        return (
            <div className="py-20 text-center">
                <p className="text-neutral-500">CategorÃ­a no encontrada</p>
                <button onClick={() => navigate('/discover')} className="mt-4 text-white underline">Volver</button>
            </div>
        );
    }

    return (
        <div className="page-category">
            <button
                onClick={() => navigate('/discover')}
                className="group flex items-center text-neutral-500 hover:text-neutral-300 mb-8 transition-colors text-xs tracking-widest uppercase"
            >
                <ChevronLeft size={14} className="mr-2 group-hover:-translate-x-1 transition-transform" />
                Regresar
            </button>

            <header className="mb-12 border-b border-neutral-900 pb-12">
                <div className={`inline-flex mb-6 opacity-80 ${category.color}`}>
                    <category.icon size={40} strokeWidth={0.5} />
                </div>

                <div className="flex justify-between items-end mb-6">
                    <h1 className="text-5xl md:text-7xl font-serif font-light text-white tracking-tight">
                        {category.label}
                    </h1>
                </div>

                <p className="text-neutral-400 text-lg md:text-xl max-w-2xl font-light font-sans leading-relaxed mb-8">
                    {category.description}
                </p>

                {/* Tab navigation */}
                <div className="flex space-x-8 text-sm tracking-widest uppercase">
                    <button
                        onClick={() => setViewMode('live')}
                        className={`pb-2 border-b-2 transition-colors ${viewMode === 'live' ? 'text-white border-white' : 'text-neutral-600 border-transparent hover:text-neutral-400'}`}
                    >
                        En Vivo
                    </button>
                    <button
                        onClick={() => setViewMode('subgroups')}
                        className={`pb-2 border-b-2 transition-colors ${viewMode === 'subgroups' ? 'text-white border-white' : 'text-neutral-600 border-transparent hover:text-neutral-400'}`}
                    >
                        Comunidades
                    </button>
                    <button
                        onClick={() => setViewMode('library')}
                        className={`pb-2 border-b-2 transition-colors ${viewMode === 'library' ? 'text-white border-white' : 'text-neutral-600 border-transparent hover:text-neutral-400'}`}
                    >
                        Biblioteca
                    </button>
                </div>
            </header>

            {/* Live content from API */}
            {viewMode === 'live' && (
                <div className="animate-in fade-in duration-500">
                    {/* Subgroup filter buttons */}
                    <div className="flex flex-wrap gap-2 mb-8">
                        {category.subgroups.map((group) => (
                            <button
                                key={group.id}
                                onClick={() => setSelectedSubgroup(group)}
                                className={`text-xs px-4 py-2 rounded-full border transition-colors ${(selectedSubgroup?.id || category.subgroups[0].id) === group.id
                                    ? 'bg-white text-black border-white'
                                    : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-white'
                                    }`}
                            >
                                {group.name}
                            </button>
                        ))}
                    </div>

                    {/* Loading state - Premium skeleton */}
                    {loading && (
                        <SkeletonContentGrid count={4} />
                    )}

                    {/* Error state - Premium */}
                    {error && (
                        <ErrorState
                            message={error}
                            onRetry={() => window.location.reload()}
                        />
                    )}

                    {/* Content grid */}
                    {!loading && !error && liveContent.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-premium">
                            {liveContent.map((item, idx) => (
                                <ApiContentCard key={item.id || idx} item={item} type={category.apiSource} />
                            ))}
                        </div>
                    )}

                    {/* Empty state - Premium */}
                    {!loading && !error && liveContent.length === 0 && (
                        <EmptyState
                            icon={Feather}
                            title="Sin contenido disponible"
                            message="No hay publicaciones en esta categorÃ­a aÃºn. Â¡Vuelve pronto!"
                        />
                    )}
                </div>
            )}

            {/* Subgroups view */}
            {viewMode === 'subgroups' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-neutral-900 border border-neutral-900 animate-in fade-in duration-500">
                    {category.subgroups.map((group) => (
                        <div key={group.id} className="bg-neutral-950 p-10 hover:bg-neutral-900/40 transition-colors cursor-pointer group">
                            <div className="flex justify-between items-start mb-8">
                                <Hash size={16} className="text-neutral-700 group-hover:text-neutral-500 transition-colors" />
                            </div>
                            <h3 className="text-xl text-neutral-200 font-serif font-light mb-2">{group.name}</h3>
                            <p className="text-neutral-600 text-xs tracking-wider uppercase mb-8">{group.members} Miembros</p>
                            <div className="flex items-center text-neutral-500 text-xs group-hover:text-white transition-colors">
                                <span>Explorar</span>
                                <ArrowRight size={12} className="ml-2" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Library view */}
            {viewMode === 'library' && (
                <div className="animate-in fade-in duration-500">
                    {category.library && category.library.length > 0 ? (
                        <div className="space-y-2 max-w-4xl">
                            {category.library.map(item => <LibraryItem key={item.id} item={item} />)}
                        </div>
                    ) : (
                        <div className="py-20 text-center border border-dashed border-neutral-800 rounded-lg">
                            <p className="text-neutral-500 font-light italic">No hay documentos archivados en esta categorÃ­a aÃºn.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CategoryPage;

