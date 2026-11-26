import { Edit3, MapPin, Settings } from 'lucide-react';

type Props = {
  displayName: string;
  photoURL: string | null;
  role: string;
  location: string;
  bio: string;
  onEdit: () => void;
  onOpenSettings: () => void;
};

/**
 * The top of your own profile: photo, name, role, location and bio, with Configuración and
 * Editar perfil. Missing details become quiet "Añadir…" links instead of placeholder text.
 */
export default function OwnProfileHeader({
  displayName,
  photoURL,
  role,
  location,
  bio,
  onEdit,
  onOpenSettings,
}: Props) {
  return (
    <header className="border-b border-neutral-900 pb-8">
      {/* On phones the buttons go under the name, so the name keeps the full width. */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-500/30 bg-gradient-to-br from-amber-500/20 to-amber-600/20 font-serif text-3xl text-amber-500 shadow-[0_0_0_4px_rgba(212,175,55,0.06)] sm:h-24 sm:w-24">
            {photoURL ? (
              <img
                src={photoURL}
                alt={displayName}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              (displayName.trim().charAt(0) || 'U').toUpperCase()
            )}
          </div>

          <div className="min-w-0">
            <h1 className="mb-1.5 break-words font-serif text-3xl font-light leading-tight text-white sm:mb-2 sm:text-4xl">
              {displayName}
            </h1>
            <p className="mb-1 text-neutral-400">{role}</p>
            {location ? (
              <p className="flex items-center text-sm text-neutral-500">
                <MapPin size={12} className="mr-1 shrink-0" />
                <span className="truncate">{location}</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={onEdit}
                className="flex items-center text-sm text-neutral-500 transition-colors hover:text-amber-400"
              >
                <MapPin size={12} className="mr-1 shrink-0" />
                Añadir ubicación
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 sm:shrink-0">
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-lg border border-neutral-700 p-2.5 text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-white"
            aria-label="Configuración"
          >
            <Settings size={18} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-700 px-5 py-2.5 text-sm text-white transition-colors hover:bg-neutral-900 sm:flex-none"
          >
            <Edit3 size={16} />
            Editar perfil
          </button>
        </div>
      </div>

      {bio ? (
        <p className="mt-6 max-w-2xl whitespace-pre-line font-light leading-relaxed text-neutral-300">
          {bio}
        </p>
      ) : (
        <p className="mt-6 text-sm font-light italic text-neutral-500">
          Aún no has añadido una biografía.{' '}
          <button
            type="button"
            onClick={onEdit}
            className="not-italic text-amber-500 transition-colors hover:text-amber-400"
          >
            + Añadir biografía
          </button>
        </p>
      )}
    </header>
  );
}
