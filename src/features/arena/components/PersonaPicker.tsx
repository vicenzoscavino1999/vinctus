import { Check } from 'lucide-react';
import { ARENA_PERSONAS, type Persona } from '@/features/arena/types';

interface PersonaPickerProps {
  label: string;
  /** "A" defends the topic, "B" argues against it. */
  side: 'A' | 'B';
  selectedId: string | null;
  onSelect: (persona: Persona) => void;
  excludeId?: string | null;
  disabled?: boolean;
}

/** One side of the debate: the personas as cards in a row that scrolls on phones. */
export function PersonaPicker({
  label,
  side,
  selectedId,
  onSelect,
  excludeId,
  disabled = false,
}: PersonaPickerProps) {
  const options = ARENA_PERSONAS.filter((persona) => persona.id !== excludeId);

  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-sm font-medium text-neutral-300">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
            side === 'A' ? 'bg-white text-black' : 'bg-brand-gold text-black'
          }`}
        >
          {side}
        </span>
        {label}
      </h3>
      <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {options.map((persona) => {
          const selected = selectedId === persona.id;
          return (
            <button
              key={persona.id}
              type="button"
              onClick={() => onSelect(persona)}
              disabled={disabled}
              aria-pressed={selected}
              className={`relative w-36 shrink-0 snap-start rounded-2xl border p-3 text-left transition-colors md:w-auto ${
                selected
                  ? 'border-brand-gold/70 bg-brand-gold/10'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
              } disabled:opacity-60`}
            >
              {selected && (
                <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-gold text-black">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
              <span className="mb-2 block text-2xl" aria-hidden="true">
                {persona.avatar}
              </span>
              <span className="block text-sm font-medium text-white">{persona.name}</span>
              <span className="mt-0.5 line-clamp-2 block text-xs text-neutral-500">
                {persona.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
