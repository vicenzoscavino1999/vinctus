import { CATEGORIES } from '@/shared/constants';
import { profileSectionTitle } from '@/features/profile/model/profileStyles';

type Props = {
  reputation: number;
  karmaByInterest: Record<string, unknown> | null | undefined;
  /** A short line under the bar, e.g. how to raise it on your own profile. */
  hint?: string;
};

/** Reputation as a gold bar with its number, and the strongest interests as chips. */
export default function ReputationSection({ reputation, karmaByInterest, hint }: Props) {
  const strongestInterests = Object.entries(karmaByInterest ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const labelOf = (id: string) => CATEGORIES.find((category) => category.id === id)?.label ?? id;
  const barWidth = Math.min(100, Math.max(0, reputation));

  return (
    <section>
      <h2 className={profileSectionTitle}>Reputación</h2>
      <div className="flex items-center gap-4">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-500"
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <span className="text-lg font-light tabular-nums text-neutral-400">{reputation}</span>
      </div>
      {hint && <p className="mt-2 text-xs text-neutral-600">{hint}</p>}
      {strongestInterests.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {strongestInterests.map(([interestId, value]) => (
            <span
              key={interestId}
              className="rounded-full border border-neutral-800/80 bg-neutral-900/40 px-3 py-1.5 text-xs text-neutral-300"
            >
              {labelOf(interestId)} · {Math.round(value)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
