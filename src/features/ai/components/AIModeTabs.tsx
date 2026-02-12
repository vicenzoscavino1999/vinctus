import { Link } from 'react-router-dom';

interface AIModeTabsProps {
  active: 'arena' | 'chat';
  arenaPath?: string;
  chatPath?: string;
}

export function AIModeTabs({
  active,
  arenaPath = '/arena',
  chatPath = '/ai/chat',
}: AIModeTabsProps) {
  const baseClass =
    'rounded-lg px-4 py-2 text-[11px] font-medium uppercase tracking-[0.15em] transition';

  return (
    <div className="inline-flex rounded-xl border border-neutral-800 bg-neutral-900/60 p-1">
      <Link
        to={arenaPath}
        className={`${baseClass} ${
          active === 'arena'
            ? 'bg-brand-gold text-black'
            : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
        }`}
      >
        Arena IA
      </Link>
      <Link
        to={chatPath}
        className={`${baseClass} ${
          active === 'chat'
            ? 'bg-brand-gold text-black'
            : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
        }`}
      >
        Conversacion IA
      </Link>
    </div>
  );
}
