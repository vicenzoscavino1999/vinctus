import { useMemo } from 'react';

interface TopicInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
}

const SUGGESTIONS = [
  'La IA va a reemplazar el trabajo creativo humano.',
  'El trabajo remoto es mejor que el presencial.',
  'Las criptomonedas seran adopcion masiva en 5 anos.',
];

export function TopicInput({
  value,
  onChange,
  disabled = false,
  maxLength = 240,
}: TopicInputProps) {
  const remaining = maxLength - value.length;
  const counterClass = useMemo(() => {
    if (remaining <= 10) return 'text-red-400';
    if (remaining <= 30) return 'text-amber-400';
    return 'text-neutral-500';
  }, [remaining]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          rows={4}
          maxLength={maxLength}
          placeholder="Define un tema claro para el debate..."
          className="w-full resize-none rounded-xl border border-neutral-800 bg-surface-1/70 px-4 py-3 text-sm text-text-1 placeholder:text-text-3 focus-ring focus:border-white/20 disabled:opacity-60"
        />
        <span className={`absolute bottom-3 right-3 text-xs ${counterClass}`}>{remaining}</span>
      </div>

      {value.trim().length === 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-neutral-500">Ideas:</span>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onChange(suggestion)}
              disabled={disabled}
              className="rounded-full border border-neutral-700 bg-neutral-900/40 px-3 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
