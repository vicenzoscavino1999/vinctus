import { LIMITS } from '@/shared/lib/firestore/firestoreContract';

interface TopicInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
}

const SUGGESTIONS = [
  'La IA va a reemplazar el trabajo creativo humano.',
  'El trabajo remoto es mejor que el presencial.',
  'Las criptomonedas serán adopción masiva en 5 años.',
];

/** The topic, with the characters left and a few ideas while it is empty. */
export function TopicInput({
  value,
  onChange,
  disabled = false,
  maxLength = LIMITS.arena.topicMaxLength,
}: TopicInputProps) {
  const remaining = maxLength - value.length;
  const counterClass =
    remaining <= 10 ? 'text-red-400' : remaining <= 30 ? 'text-amber-400' : 'text-neutral-600';

  return (
    <div className="space-y-3">
      <div className="relative">
        <textarea
          aria-label="Tema del debate"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          rows={3}
          maxLength={maxLength}
          placeholder="¿Sobre qué quieres que debatan?"
          className="w-full resize-none rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 pb-7 font-display text-lg leading-snug text-white placeholder:font-sans placeholder:text-base placeholder:text-neutral-500 focus:border-white/20 focus:outline-none disabled:opacity-60"
        />
        <span className={`absolute bottom-3 right-4 text-[11px] ${counterClass}`}>{remaining}</span>
      </div>

      {value.trim().length === 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onChange(suggestion)}
              disabled={disabled}
              className="shrink-0 rounded-full border border-white/[0.08] px-3.5 py-1.5 text-xs text-neutral-400 transition-colors hover:border-white/20 hover:text-white disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
