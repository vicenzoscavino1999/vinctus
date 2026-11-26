import { Search, SlidersHorizontal, X } from 'lucide-react';

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  filtersActive: boolean;
  onOpenFilters: () => void;
};

/** Discover's title and its search over interests and groups. */
export default function DiscoverHeader({
  query,
  onQueryChange,
  filtersActive,
  onOpenFilters,
}: Props) {
  return (
    <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-neutral-500">
          Descubrir
        </p>
        <h1 className="mt-2 font-display text-[2rem] leading-[1.1] text-white md:text-[2.5rem]">
          Curaduría de <span className="italic text-brand-gold">intereses</span>
        </h1>
      </div>

      <div className="flex h-12 w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] pl-4 pr-1.5 transition-colors focus-within:border-white/25 md:w-[380px]">
        <Search size={17} className="shrink-0 text-neutral-500" />
        <input
          type="text"
          aria-label="Buscar intereses o grupos"
          placeholder="Buscar intereses o grupos"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-neutral-500 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label="Limpiar búsqueda"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:text-white"
          >
            <X size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={onOpenFilters}
          aria-label="Abrir filtros"
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
            filtersActive
              ? 'bg-brand-gold/15 text-brand-gold'
              : 'text-neutral-400 hover:bg-white/[0.06] hover:text-white'
          }`}
        >
          <SlidersHorizontal size={16} />
          {filtersActive && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand-gold" />
          )}
        </button>
      </div>
    </header>
  );
}
