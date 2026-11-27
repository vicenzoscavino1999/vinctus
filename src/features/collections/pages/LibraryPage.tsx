import { Bookmark } from 'lucide-react';
import CollectionsPanel from '@/features/collections/components/CollectionsPanel';

/** `/library`: the person's private folders of links, notes and files. */
const LibraryPage = () => {
  return (
    <div className="page-library mx-auto max-w-3xl pb-32">
      <header className="flex items-center gap-3 pb-6 pt-6 md:pt-10">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gold/15 text-brand-gold">
          <Bookmark size={19} />
        </span>
        <div>
          <h1 className="font-display text-display-sm text-white">Colecciones</h1>
          <p className="text-sm text-neutral-500">
            Tus enlaces, notas y archivos. Solo tú puedes verlos.
          </p>
        </div>
      </header>
      <CollectionsPanel showIntro={false} />
    </div>
  );
};

export default LibraryPage;
