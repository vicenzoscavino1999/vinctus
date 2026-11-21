import { Bell, Plus, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  notificationCount?: number;
  onCreatePost?: () => void;
}

const Header = ({ notificationCount = 0, onCreatePost }: HeaderProps) => {
  const navigate = useNavigate();
  const badgeLabel = notificationCount > 9 ? '9+' : String(notificationCount);

  return (
    <header className="fixed top-0 left-0 right-0 md:left-20 z-30 flex items-center px-4 md:px-8 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-bg/95 backdrop-blur-md border-b border-neutral-900/50">
      <div className="w-16 flex-shrink-0 flex items-center justify-start">
        <button
          type="button"
          onClick={onCreatePost}
          className="p-2 bg-gradient-to-br from-amber-400 to-amber-500 rounded-lg text-black hover:from-amber-300 hover:to-amber-400 transition-all shadow-lg shadow-amber-500/20"
          aria-label="Crear publicación"
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <button
          type="button"
          onClick={() => navigate('/discover')}
          className="text-lg font-serif tracking-tight text-white cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none p-0"
        >
          Vinctus
        </button>
      </div>

      <div className="w-24 flex-shrink-0 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => navigate('/ai/chat')}
          className="p-2.5 text-neutral-400 hover:text-amber-400 transition-colors"
          aria-label="IA Vinctus"
        >
          <Sparkles size={22} strokeWidth={1.5} />
        </button>

        <button
          type="button"
          onClick={() => navigate('/notifications')}
          className="relative p-2.5 text-neutral-400 hover:text-white transition-colors"
          aria-label={
            notificationCount > 0
              ? `Notificaciones (${notificationCount} pendientes)`
              : 'Notificaciones'
          }
        >
          <Bell size={22} strokeWidth={1.5} />
          {notificationCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[10px] font-semibold leading-4 text-white text-center"
            >
              {badgeLabel}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};

export default Header;
