import { X } from 'lucide-react';
import { CATEGORIES } from '../data';

const SearchFilters = ({ isOpen, onClose, filters, onApply }) => {
    if (!isOpen) return null;

    const handleCategorySelect = (catId) => {
        onApply({
            ...filters,
            category: filters.category === catId ? null : catId
        });
    };

    const handleSortChange = (sortBy) => {
        onApply({
            ...filters,
            sortBy
        });
    };

    const clearFilters = () => {
        onApply({ category: null, sortBy: 'relevance' });
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed bottom-0 left-0 right-0 bg-surface-base border-t border-neutral-800 rounded-t-3xl p-6 z-50 animate-slide-up max-h-[80vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-heading-lg font-display text-white">Filtros</h2>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-neutral-700 transition-colors"
                    >
                        <X size={20} className="text-neutral-400" />
                    </button>
                </div>

                {/* Sort by */}
                <section className="mb-6">
                    <h3 className="text-sm text-neutral-500 uppercase tracking-wider mb-3">Ordenar por</h3>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { id: 'relevance', label: 'Relevancia' },
                            { id: 'recent', label: 'Mas recientes' },
                            { id: 'popular', label: 'Mas populares' },
                            { id: 'alphabetical', label: 'A-Z' },
                        ].map(option => (
                            <button
                                key={option.id}
                                onClick={() => handleSortChange(option.id)}
                                className={`px-4 py-2 rounded-full text-sm transition-all press-scale ${filters.sortBy === option.id
                                        ? 'bg-brand-gold text-black'
                                        : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                                    }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </section>

                {/* Categories */}
                <section className="mb-6">
                    <h3 className="text-sm text-neutral-500 uppercase tracking-wider mb-3">Categoria</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => handleCategorySelect(cat.id)}
                                className={`flex items-center gap-2 p-3 rounded-lg text-left transition-all press-scale ${filters.category === cat.id
                                        ? 'bg-brand-gold/10 border border-brand-gold/50 text-white'
                                        : 'bg-neutral-800/50 border border-neutral-800 text-neutral-400 hover:border-neutral-700'
                                    }`}
                            >
                                <cat.icon size={16} strokeWidth={1.5} className={filters.category === cat.id ? 'text-brand-gold' : ''} />
                                <span className="text-sm">{cat.label}</span>
                            </button>
                        ))}
                    </div>
                </section>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-neutral-800">
                    <button
                        onClick={clearFilters}
                        className="flex-1 py-3 rounded-button text-neutral-400 text-sm hover:text-white transition-colors"
                    >
                        Limpiar filtros
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 rounded-button bg-brand-gold text-black text-sm font-medium btn-premium"
                    >
                        Ver resultados
                    </button>
                </div>
            </div>
        </>
    );
};

export default SearchFilters;
