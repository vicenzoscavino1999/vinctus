import { Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CATEGORIES } from '@/shared/constants';
import type { Category } from '@/shared/types';

type Props = {
  reputation: number;
  karmaByInterest: Record<string, unknown> | null;
  followedCategories: string[];
  email: string;
  onUnfollowCategory: (category: Category) => void;
};

const sectionTitle = 'mb-4 text-xs uppercase tracking-[0.2em] text-neutral-600';

/** Reputation (with the strongest interests), followed categories and contact. */
export default function ProfileAboutAside({
  reputation,
  karmaByInterest,
  followedCategories,
  email,
  onUnfollowCategory,
}: Props) {
  const navigate = useNavigate();
  const strongestInterests = Object.entries(karmaByInterest ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const labelOf = (id: string) => CATEGORIES.find((category) => category.id === id)?.label ?? id;
  const followed = followedCategories
    .map((id) => CATEGORIES.find((category) => category.id === id))
    .filter((category): category is Category => Boolean(category));
  const barWidth = Math.min(100, Math.max(0, reputation));

  return (
    <aside className="space-y-8">
      <section>
        <h2 className={sectionTitle}>Reputación</h2>
        <div className="flex items-center gap-4">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-500"
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <span className="text-lg font-light tabular-nums text-neutral-400">{reputation}</span>
        </div>
        <p className="mt-2 text-xs text-neutral-600">Contribuye para aumentar tu reputación</p>
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

      <section>
        <h2 className={sectionTitle}>Categorías seguidas</h2>
        {followed.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Aún no sigues categorías. Desde Descubrir puedes seguir las que te interesen.
          </p>
        ) : (
          <div className="space-y-2">
            {followed.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800/80 bg-neutral-900/40 px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/category/${category.id}`)}
                  className="flex min-w-0 items-center gap-2 text-neutral-200 transition-colors hover:text-white"
                >
                  <category.icon size={14} className={category.color} />
                  <span className="truncate text-sm">{category.label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onUnfollowCategory(category)}
                  aria-label={`Dejar de seguir ${category.label}`}
                  className="text-[10px] uppercase tracking-wider text-neutral-400 transition-colors hover:text-brand-gold"
                >
                  Dejar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {email && (
        <section>
          <h2 className={sectionTitle}>Contacto</h2>
          <div className="flex min-w-0 items-center gap-2 text-sm text-neutral-400">
            <Mail size={14} className="shrink-0" />
            <span className="truncate">{email}</span>
          </div>
        </section>
      )}
    </aside>
  );
}
