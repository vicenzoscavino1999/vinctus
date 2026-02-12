import { ARENA_PERSONAS, type Persona } from '@/features/arena/types';

interface PersonaPickerProps {
  label: string;
  selectedId: string | null;
  onSelect: (persona: Persona) => void;
  excludeId?: string | null;
  disabled?: boolean;
}

export function PersonaPicker({
  label,
  selectedId,
  onSelect,
  excludeId,
  disabled = false,
}: PersonaPickerProps) {
  const options = ARENA_PERSONAS.filter((persona) => persona.id !== excludeId);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-neutral-300">{label}</h3>
      <div className="grid grid-cols-2 gap-3">
        {options.map((persona) => {
          const selected = selectedId === persona.id;
          return (
            <button
              key={persona.id}
              type="button"
              onClick={() => onSelect(persona)}
              disabled={disabled}
              className={`relative rounded-xl border p-3 text-left transition-all ${
                selected
                  ? 'border-brand-gold/70 bg-brand-gold/10 shadow-glow'
                  : 'border-neutral-800 bg-surface-1/60 hover:border-neutral-600'
              } ${disabled ? 'opacity-60' : ''}`}
            >
              {selected && (
                <span className="absolute right-2 top-2 rounded-full bg-brand-gold px-2 py-0.5 text-[10px] font-semibold text-black">
                  OK
                </span>
              )}
              <div className="mb-2 text-xl">{persona.avatar}</div>
              <p className="text-sm font-medium text-text-1">{persona.name}</p>
              <p className="mt-1 line-clamp-2 text-xs text-text-3">{persona.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
