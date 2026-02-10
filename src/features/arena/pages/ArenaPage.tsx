import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { collection, doc, getDoc } from 'firebase/firestore';
import {
  createDebate,
  likeArenaDebateWithSync,
  saveArenaDebateWithSync,
  unlikeArenaDebateWithSync,
  unsaveArenaDebateWithSync,
} from '@/features/arena/api/mutations';
import {
  getArenaUsage,
  isArenaDebateLiked,
  isArenaDebateSaved,
  subscribeToDebate,
  subscribeToTurns,
} from '@/features/arena/api/queries';
import { DebateViewer } from '@/features/arena/components/DebateViewer';
import { PersonaPicker } from '@/features/arena/components/PersonaPicker';
import { TopicInput } from '@/features/arena/components/TopicInput';
import type { Debate, Persona, Turn, UsageStats } from '@/features/arena/types';
import { getPersonaById } from '@/features/arena/types';
import { AIModeTabs } from '@/features/ai/components/AIModeTabs';
import { useAuth } from '@/context/auth';
import { db } from '@/shared/lib/firebase';
import { useToast } from '@/shared/ui/Toast';

export default function ArenaPage() {
  const navigate = useNavigate();
  const { debateId } = useParams<{ debateId?: string }>();
  const { user } = useAuth();
  const userId = user?.uid ?? null;
  const { showToast } = useToast();

  const [topic, setTopic] = useState('');
  const [personaA, setPersonaA] = useState<Persona | null>(null);
  const [personaB, setPersonaB] = useState<Persona | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [debate, setDebate] = useState<Debate | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [isDebateLiked, setIsDebateLiked] = useState(false);
  const [isLikingDebate, setIsLikingDebate] = useState(false);
  const [isDebateSaved, setIsDebateSaved] = useState(false);
  const [isSavingDebate, setIsSavingDebate] = useState(false);

  const isViewing = Boolean(debateId);

  useEffect(() => {
    if (!userId) return;
    getArenaUsage()
      .then(setUsage)
      .catch((usageError) => {
        console.error('getArenaUsage failed:', usageError);
      });
  }, [userId]);

  useEffect(() => {
    if (!debateId) return undefined;
    const unsubscribeDebate = subscribeToDebate(debateId, setDebate);
    const unsubscribeTurns = subscribeToTurns(debateId, setTurns);

    return () => {
      unsubscribeDebate();
      unsubscribeTurns();
    };
  }, [debateId]);

  useEffect(() => {
    if (!debateId || !userId) {
      setIsDebateLiked(false);
      return undefined;
    }

    let isActive = true;
    setIsDebateLiked(false);
    isArenaDebateLiked(debateId, userId)
      .then((liked) => {
        if (!isActive) return;
        setIsDebateLiked(liked);
      })
      .catch((likeStateError) => {
        console.error('isArenaDebateLiked failed:', likeStateError);
      });

    return () => {
      isActive = false;
    };
  }, [debateId, userId]);

  useEffect(() => {
    if (!debateId || !userId) {
      setIsDebateSaved(false);
      return undefined;
    }

    let isActive = true;
    setIsDebateSaved(false);
    isArenaDebateSaved(debateId, userId)
      .then((saved) => {
        if (!isActive) return;
        setIsDebateSaved(saved);
      })
      .catch((saveStateError) => {
        console.error('isArenaDebateSaved failed:', saveStateError);
      });

    return () => {
      isActive = false;
    };
  }, [debateId, userId]);

  const formValid =
    topic.trim().length >= 5 &&
    personaA !== null &&
    personaB !== null &&
    personaA.id !== personaB.id;

  const disableCreate = !formValid || isCreating || usage?.remaining === 0;

  const usageLabel = useMemo(() => {
    if (!usage) return '...';
    return `${usage.used}/${usage.limit}`;
  }, [usage]);

  const handleCreate = async () => {
    if (!userId) {
      setError('Debes iniciar sesion para usar Arena.');
      return;
    }
    if (!personaA || !personaB) {
      setError('Selecciona ambas personas.');
      return;
    }
    if (personaA.id === personaB.id) {
      setError('Las personas deben ser diferentes.');
      return;
    }

    setIsCreating(true);
    setError(null);
    let clientDebateId = '';

    try {
      clientDebateId = doc(collection(db, 'arenaDebates')).id;
      navigate(`/arena/${clientDebateId}`);

      const result = await createDebate({
        topic: topic.trim(),
        personaA: personaA.id,
        personaB: personaB.id,
        visibility: 'public',
        clientDebateId,
      });
      if (usage) {
        setUsage({
          ...usage,
          used: usage.used + 1,
          remaining: result.remaining,
        });
      }
      if (result.debateId !== clientDebateId) {
        navigate(`/arena/${result.debateId}`);
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'No se pudo crear el debate.');
      if (!clientDebateId) {
        navigate('/arena');
      } else {
        const createdDebate = await getDoc(doc(db, 'arenaDebates', clientDebateId)).catch(
          () => null,
        );
        if (!createdDebate?.exists()) {
          navigate('/arena');
        }
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleRetry = () => {
    if (!debate) return;
    setTopic(debate.topic);
    navigate('/arena');
  };

  const handleBackToCreator = () => {
    navigate('/arena');
  };

  const handleCreateAnother = () => {
    if (debate) {
      setTopic(debate.topic);
      setPersonaA(getPersonaById(debate.personaA) || null);
      setPersonaB(getPersonaById(debate.personaB) || null);
    }
    setError(null);
    navigate('/arena');
  };

  const handleToggleSaveDebate = async () => {
    if (!userId) {
      showToast('Inicia sesion para guardar debates', 'info');
      return;
    }
    if (!debate || debate.status !== 'done') return;

    const nextSaved = !isDebateSaved;
    setIsDebateSaved(nextSaved);
    setIsSavingDebate(true);

    try {
      if (nextSaved) {
        await saveArenaDebateWithSync(
          {
            debateId: debate.id,
            topic: debate.topic,
            personaA: debate.personaA,
            personaB: debate.personaB,
            summary: debate.summary ?? null,
            verdictWinner: debate.verdict?.winner ?? null,
          },
          userId,
        );
        showToast('Debate guardado en tu perfil', 'success');
      } else {
        await unsaveArenaDebateWithSync(debate.id, userId);
        showToast('Debate eliminado de guardados', 'info');
      }
    } catch (saveError) {
      console.error('save debate failed:', saveError);
      setIsDebateSaved(!nextSaved);
      showToast('No se pudo actualizar el guardado', 'error');
    } finally {
      setIsSavingDebate(false);
    }
  };

  const handleToggleLikeDebate = async () => {
    if (!userId) {
      showToast('Inicia sesion para reaccionar a debates', 'info');
      return;
    }
    if (!debate || debate.status !== 'done') return;

    const nextLiked = !isDebateLiked;
    const previousLikes = typeof debate.likesCount === 'number' ? debate.likesCount : 0;
    const nextLikes = Math.max(0, previousLikes + (nextLiked ? 1 : -1));

    setIsDebateLiked(nextLiked);
    setIsLikingDebate(true);
    setDebate((prev) => (prev ? { ...prev, likesCount: nextLikes } : prev));

    try {
      if (nextLiked) {
        await likeArenaDebateWithSync(debate.id, userId);
        showToast('Te gustó este debate', 'success');
      } else {
        await unlikeArenaDebateWithSync(debate.id, userId);
      }
    } catch (likeError) {
      console.error('like debate failed:', likeError);
      setIsDebateLiked(!nextLiked);
      setDebate((prev) => (prev ? { ...prev, likesCount: previousLikes } : prev));
      showToast('No se pudo actualizar el like', 'error');
    } finally {
      setIsLikingDebate(false);
    }
  };

  return (
    <div className="page-transition pb-24">
      <header className="mb-8 flex flex-col gap-4 pt-6 md:pt-10">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-brand-gold/30 bg-brand-gold/10 p-2 text-brand-gold">
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className="text-display-sm md:text-display-md font-display text-white">Arena IA</h1>
            <p className="text-sm text-neutral-500">
              Debates estructurados entre perspectivas opuestas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-500">
          <span>Debates hoy:</span>
          <span className={usage?.remaining === 0 ? 'text-red-400' : 'text-brand-gold'}>
            {usageLabel}
          </span>
        </div>

        <AIModeTabs active="arena" />
      </header>

      {isViewing ? (
        <DebateViewer
          debate={debate}
          turns={turns}
          isLoading={!debate}
          onRetry={handleRetry}
          onBack={handleBackToCreator}
          onCreateAnother={handleCreateAnother}
          onToggleLike={debate?.status === 'done' ? handleToggleLikeDebate : undefined}
          onToggleSave={debate?.status === 'done' ? handleToggleSaveDebate : undefined}
          isLiked={isDebateLiked}
          isLiking={isLikingDebate}
          isSaved={isDebateSaved}
          isSaving={isSavingDebate}
        />
      ) : (
        <section className="space-y-6">
          <div className="card card-premium space-y-6">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-neutral-500">Tema</p>
              <TopicInput value={topic} onChange={setTopic} disabled={isCreating} />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <PersonaPicker
                label="Persona A (defiende)"
                selectedId={personaA?.id || null}
                onSelect={setPersonaA}
                excludeId={personaB?.id}
                disabled={isCreating}
              />
              <PersonaPicker
                label="Persona B (contraparte)"
                selectedId={personaB?.id || null}
                onSelect={setPersonaB}
                excludeId={personaA?.id}
                disabled={isCreating}
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={disableCreate}
              onClick={handleCreate}
              className="btn-accent w-full"
            >
              {isCreating
                ? 'Generando debate...'
                : usage?.remaining === 0
                  ? 'Limite diario alcanzado'
                  : 'Iniciar debate'}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <article className="card">
              <p className="text-xs uppercase tracking-wider text-neutral-500">Formato</p>
              <p className="mt-2 text-sm text-neutral-200">6 turnos alternados A/B</p>
            </article>
            <article className="card">
              <p className="text-xs uppercase tracking-wider text-neutral-500">Salida</p>
              <p className="mt-2 text-sm text-neutral-200">Resumen + veredicto imparcial</p>
            </article>
            <article className="card">
              <p className="text-xs uppercase tracking-wider text-neutral-500">Tiempo</p>
              <p className="mt-2 text-sm text-neutral-200">Normalmente menos de 20 segundos</p>
            </article>
          </div>
        </section>
      )}
    </div>
  );
}
