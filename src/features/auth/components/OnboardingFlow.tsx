import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Sparkles, Users } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { getGroups, joinPublicGroup, type FirestoreGroup } from '@/features/groups/api';
import { followCategoryWithSync, getUserProfile } from '@/features/profile/api';
import { CATEGORIES } from '@/shared/constants';
import type { OnboardingFlowProps } from '@/shared/types';

const MIN_INTERESTS = 2;
const GROUPS_TO_SHOW = 6;
/** Accounts older than this already know Vinctus; a new device doesn't greet them again. */
const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;

const safeSetItem = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or a full quota: the welcome still finishes.
  }
};

const formatMembers = (count: number) =>
  `${new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(count)} ${
    count === 1 ? 'miembro' : 'miembros'
  }`;

/**
 * The welcome after signing up: what Vinctus is, the interests to follow (they become followed
 * categories) and real public groups to join. Accounts that already existed skip it.
 */
const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const [groups, setGroups] = useState<FirestoreGroup[] | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [finishing, setFinishing] = useState(false);

  // Someone who already had an account (or already posted) goes straight in.
  useEffect(() => {
    let active = true;
    if (!uid) return;
    getUserProfile(uid)
      .then((profile) => {
        if (!active) return;
        const created = profile?.createdAt?.getTime?.() ?? Date.now();
        const isExisting = Date.now() - created > NEW_ACCOUNT_MS || (profile?.postsCount ?? 0) > 0;
        if (isExisting) {
          safeSetItem('vinctus_onboarding_complete', 'true');
          onComplete();
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [uid, onComplete]);

  // Real public groups, the ones of the chosen interests first.
  useEffect(() => {
    if (step !== 2 || groups) return;
    let active = true;
    getGroups()
      .then((all) => {
        if (active) setGroups(all.filter((group) => (group.visibility ?? 'public') === 'public'));
      })
      .catch(() => {
        if (active) setGroups([]);
      });
    return () => {
      active = false;
    };
  }, [step, groups]);

  const suggestedGroups = useMemo(() => {
    if (!groups) return [];
    const chosen = new Set(interests);
    return [...groups]
      .sort((a, b) => {
        const byInterest =
          Number(chosen.has(b.categoryId ?? '')) - Number(chosen.has(a.categoryId ?? ''));
        return byInterest || (b.memberCount ?? 0) - (a.memberCount ?? 0);
      })
      .slice(0, GROUPS_TO_SHOW);
  }, [groups, interests]);

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    safeSetItem('vinctus_interests', JSON.stringify(interests));
    if (uid) {
      // One that fails doesn't stop the others or the welcome.
      await Promise.allSettled([
        ...interests.map((categoryId) => followCategoryWithSync(categoryId, uid)),
        ...selectedGroups.map((groupId) => joinPublicGroup(groupId, uid)),
      ]);
    }
    safeSetItem('vinctus_onboarding_complete', 'true');
    onComplete();
  };

  const canContinue = step !== 1 || interests.length >= MIN_INTERESTS;
  const next = () => {
    if (step < 2) setStep(step + 1);
    else void finish();
  };

  if (checking) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="safe-area-inset fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="flex justify-center gap-2 pb-4 pt-8" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              index === step
                ? 'w-8 bg-brand-gold'
                : index < step
                  ? 'w-1.5 bg-brand-gold/50'
                  : 'w-1.5 bg-white/15'
            }`}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-40">
        {step === 0 && (
          <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center text-center animate-fade-up">
            <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-gold/15">
              <Sparkles size={36} className="text-brand-gold" />
            </div>
            <h1 className="mb-4 font-display text-display-sm text-white">
              Bienvenido a <span className="text-brand-gold">Vinctus</span>
            </h1>
            <p className="mb-2 text-base text-neutral-300">
              Una red social basada en lo que realmente te apasiona.
            </p>
            <p className="text-sm text-neutral-500">
              Elige tus intereses y te mostraremos personas, grupos y temas que valen la pena.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="mx-auto max-w-md animate-fade-up">
            <div className="mb-8 text-center">
              <h2 className="mb-2 font-display text-display-sm text-white">¿Qué te apasiona?</h2>
              <p className="text-sm text-neutral-500">
                Elige al menos {MIN_INTERESTS}. Seguirás esas categorías y podrás cambiarlas cuando
                quieras.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {CATEGORIES.map((category) => {
                const selected = interests.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setInterests((previous) => toggle(previous, category.id))}
                    className={`relative rounded-2xl border p-4 text-left transition-colors ${
                      selected
                        ? 'border-brand-gold/60 bg-brand-gold/10'
                        : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <category.icon
                      size={24}
                      strokeWidth={1.5}
                      className={`mb-3 ${category.color}`}
                    />
                    <span
                      className={`block text-sm font-medium ${selected ? 'text-white' : 'text-neutral-300'}`}
                    >
                      {category.label}
                    </span>
                    {selected && (
                      <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-brand-gold text-black">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-5 text-center text-xs text-neutral-500">
              {interests.length} {interests.length === 1 ? 'elegido' : 'elegidos'}
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="mx-auto max-w-md animate-fade-up">
            <div className="mb-8 text-center">
              <h2 className="mb-2 font-display text-display-sm text-white">Grupos para empezar</h2>
              <p className="text-sm text-neutral-500">
                Únete a los que te interesen. Puedes saltar este paso.
              </p>
            </div>
            {groups === null ? (
              <div aria-hidden className="space-y-3">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="skeleton h-[72px] rounded-2xl" />
                ))}
              </div>
            ) : suggestedGroups.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/[0.08] py-10 text-center text-sm text-neutral-500">
                Aún no hay grupos públicos. Podrás crear el primero desde tu perfil.
              </p>
            ) : (
              <div className="space-y-3">
                {suggestedGroups.map((group) => {
                  const selected = selectedGroups.includes(group.id);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedGroups((previous) => toggle(previous, group.id))}
                      className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors ${
                        selected
                          ? 'border-brand-gold/60 bg-brand-gold/10'
                          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
                      }`}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-900">
                        {group.iconUrl ? (
                          <img src={group.iconUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Users size={19} className="text-neutral-500" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-white">{group.name}</span>
                        <span className="block text-xs text-neutral-500">
                          {formatMembers(group.memberCount ?? 0)}
                        </span>
                      </span>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                          selected ? 'border-brand-gold bg-brand-gold' : 'border-white/25'
                        }`}
                      >
                        {selected && <Check size={13} strokeWidth={3} className="text-black" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-bg via-bg to-transparent p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={next}
            disabled={!canContinue || finishing}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-gold text-sm font-semibold text-black transition-opacity disabled:opacity-40"
          >
            {finishing
              ? 'Preparando tu Vinctus...'
              : step === 2
                ? selectedGroups.length > 0
                  ? 'Unirme y empezar'
                  : 'Empezar'
                : 'Continuar'}
            {!finishing && <ArrowRight size={17} />}
          </button>
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              disabled={finishing}
              className="mt-3 w-full py-2 text-sm text-neutral-500 transition-colors hover:text-white"
            >
              Atrás
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingFlow;
