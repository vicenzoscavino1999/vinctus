import { Search, Users, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import type { FirestoreGroup } from '@/features/groups/api';
import PersonRow from '@/features/discover/components/PersonRow';
import { usePeopleSearch } from '@/features/discover/hooks/usePeopleSearch';

const isSafeHttpUrl = (value: string | null | undefined): value is string =>
  typeof value === 'string' && /^https?:\/\//i.test(value.trim());

const sectionTitle = 'mb-3 text-xs uppercase tracking-[0.2em] text-neutral-500';

/** Search: people to follow and groups, with the same follow, request and message actions. */
export default function UserSearchPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Discover links here with ?q= when a search there may be about people.
  const [searchParams] = useSearchParams();
  const search = usePeopleSearch(user?.uid ?? null, searchParams.get('q') ?? '');
  const people = search.isSearching ? search.results : search.suggested;
  const typedOneLetter = search.query.trim().length > 0 && !search.isSearching;

  return (
    <div className="page-feed mx-auto max-w-3xl pb-28 pt-6 md:pt-10">
      <h1 className="mb-6 font-serif text-3xl font-light text-white">Buscar</h1>

      <label className="mb-8 flex h-12 items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 transition-colors focus-within:border-white/25">
        <Search size={18} className="shrink-0 text-neutral-500" />
        <input
          type="text"
          aria-label="Buscar usuarios"
          placeholder="Buscar personas o grupos"
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-neutral-500 focus:outline-none"
        />
        {search.query && (
          <button
            type="button"
            onClick={() => search.setQuery('')}
            aria-label="Limpiar búsqueda"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </label>

      {typedOneLetter && (
        <p className="mb-6 text-sm text-neutral-500">Escribe al menos 2 caracteres para buscar.</p>
      )}

      {/* With groups found and no people, only the groups show. */}
      {!(
        search.isSearching &&
        !search.searching &&
        !search.searchError &&
        people.length === 0 &&
        search.matchingGroups.length > 0
      ) && (
        <section aria-label={search.isSearching ? 'Personas' : 'Personas sugeridas'}>
          <h2 className={sectionTitle}>{search.isSearching ? 'Personas' : 'Personas sugeridas'}</h2>

          {(search.isSearching ? search.searching : search.loadingSuggested) ? (
            <div aria-hidden className="space-y-2">
              {[0, 1, 2].map((index) => (
                <div key={index} className="skeleton h-[68px] rounded-2xl" />
              ))}
            </div>
          ) : (search.isSearching ? search.searchError : search.suggestedError) ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-surface-overlay px-4 py-3.5">
              <p className="text-sm text-neutral-400">
                {search.isSearching ? search.searchError : search.suggestedError}
              </p>
              <button
                type="button"
                onClick={search.isSearching ? search.retrySearch : search.retrySuggested}
                className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-white/30 hover:text-white"
              >
                Reintentar
              </button>
            </div>
          ) : people.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">
              {search.isSearching ? 'No hay resultados.' : 'No hay usuarios registrados aún.'}
            </p>
          ) : (
            <div className="space-y-2">
              {people.map((person) => (
                <PersonRow
                  key={person.uid}
                  person={person}
                  busy={search.busyUid === person.uid}
                  actions={search.actions}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {search.isSearching && search.matchingGroups.length > 0 && (
        <section aria-label="Grupos encontrados" className="mt-10">
          <h2 className={sectionTitle}>Grupos</h2>
          <div className="space-y-2">
            {search.matchingGroups.map((group) => (
              <GroupResultRow
                key={group.id}
                group={group}
                onOpen={() => navigate(`/group/${group.id}`)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function GroupResultRow({ group, onOpen }: { group: FirestoreGroup; onOpen: () => void }) {
  const members = group.memberCount ?? 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.06] bg-surface-overlay px-4 py-3 text-left transition-colors hover:border-white/[0.12]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-neutral-900">
        {isSafeHttpUrl(group.iconUrl) ? (
          <img src={group.iconUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Users size={18} className="text-neutral-500" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-white">{group.name}</span>
        <span className="block truncate text-xs text-neutral-500">
          {group.description || 'Grupo en Vinctus'}
        </span>
      </span>
      <span className="shrink-0 text-xs text-neutral-500">
        {members.toLocaleString('es-ES')} {members === 1 ? 'miembro' : 'miembros'}
      </span>
    </button>
  );
}
