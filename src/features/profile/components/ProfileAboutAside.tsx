import { Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CATEGORIES } from '@/shared/constants';
import type { Category } from '@/shared/types';
import ReputationSection from '@/features/profile/components/ReputationSection';
import { profileSectionTitle } from '@/features/profile/model/profileStyles';

type Props = {
  reputation: number;
  karmaByInterest: Record<string, unknown> | null;
  followedCategories: string[];
  email: string;
  onUnfollowCategory: (category: Category) => void;
};

const sectionTitle = profileSectionTitle;

/** Reputation (with the strongest interests), followed categories and contact. */
export default function ProfileAboutAside({
  reputation,
  karmaByInterest,
  followedCategories,
  email,
  onUnfollowCategory,
}: Props) {
  const navigate = useNavigate();
  const followed = followedCategories
    .map((id) => CATEGORIES.find((category) => category.id === id))
    .filter((category): category is Category => Boolean(category));

  return (
    <aside className="space-y-8">
      <ReputationSection
        reputation={reputation}
        karmaByInterest={karmaByInterest}
        hint="Contribuye para aumentar tu reputación"
      />

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
