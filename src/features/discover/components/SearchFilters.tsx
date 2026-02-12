import { useEffect, useRef, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { CATEGORIES } from '@/shared/constants';

type SearchFiltersState = {
  category: string | null;
  sortBy: string;
};

type SearchFiltersProps = {
  isOpen: boolean;
  onClose: () => void;
  filters: SearchFiltersState;
  onApply: (nextFilters: SearchFiltersState) => void;
};

const SearchFilters = ({ isOpen, onClose, filters, onApply }: SearchFiltersProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Handle Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  // Focus trap and body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the close button when modal opens
    closeButtonRef.current?.focus();

    // Add escape listener
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  // Focus trap - keep focus within modal
  const handleTabKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return;

    const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement?.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement?.focus();
    }
  };

  if (!isOpen) return null;

  const handleCategorySelect = (catId: string) => {
    onApply({
      ...filters,
      category: filters.category === catId ? null : catId,
    });
  };

  const handleSortChange = (sortBy: string) => {
    onApply({
      ...filters,
      sortBy,
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
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-filters-title"
        onKeyDown={handleTabKey}
        className="fixed bottom-0 left-0 right-0 bg-surface-base border-t border-neutral-800 rounded-t-3xl px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] z-50 animate-slide-up max-h-[80vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="search-filters-title" className="text-heading-lg font-display text-white">
            Filtros
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar filtros"
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
              { id: 'recent', label: 'M\u00E1s recientes' },
              { id: 'popular', label: 'M\u00E1s populares' },
              { id: 'alphabetical', label: 'A-Z' },
            ].map((option) => (
              <button
                key={option.id}
                onClick={() => handleSortChange(option.id)}
                className={`px-4 py-2 rounded-full text-sm transition-all press-scale ${
                  filters.sortBy === option.id
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
          <h3 className="text-sm text-neutral-500 uppercase tracking-wider mb-3">Categor\u00EDa</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategorySelect(cat.id)}
                className={`flex items-center gap-2 p-3 rounded-lg text-left transition-all press-scale ${
                  filters.category === cat.id
                    ? 'bg-brand-gold/10 border border-brand-gold/50 text-white'
                    : 'bg-neutral-800/50 border border-neutral-800 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                <cat.icon
                  size={16}
                  strokeWidth={1.5}
                  className={filters.category === cat.id ? 'text-brand-gold' : ''}
                />
                <span className="text-sm">{cat.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-neutral-800">
          <button
            type="button"
            onClick={clearFilters}
            className="flex-1 py-3 rounded-button text-neutral-400 text-sm hover:text-white transition-colors"
          >
            Limpiar filtros
          </button>
          <button
            type="button"
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
