import { Link } from 'react-router-dom';
import { MessageCircle, Swords } from 'lucide-react';

interface AIModeTabsProps {
  active: 'arena' | 'chat';
  arenaPath?: string;
  chatPath?: string;
}

/** Chat con IA and Arena IA as one segmented control. */
export function AIModeTabs({
  active,
  arenaPath = '/arena',
  chatPath = '/ai/chat',
}: AIModeTabsProps) {
  const tab = (selected: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-colors ${
      selected ? 'bg-white text-black font-medium' : 'text-neutral-400 hover:text-white'
    }`;

  return (
    <nav
      aria-label="Modos de IA"
      className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.03] p-1"
    >
      <Link
        to={chatPath}
        aria-current={active === 'chat' ? 'page' : undefined}
        className={tab(active === 'chat')}
      >
        <MessageCircle size={15} />
        Chat
      </Link>
      <Link
        to={arenaPath}
        aria-current={active === 'arena' ? 'page' : undefined}
        className={tab(active === 'arena')}
      >
        <Swords size={15} />
        Arena
      </Link>
    </nav>
  );
}
