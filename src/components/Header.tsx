import { Bell, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
    notificationCount?: number;
    onCreatePost?: () => void;
}

const Header = ({ notificationCount = 0, onCreatePost }: HeaderProps) => {
    const navigate = useNavigate();

    return (
        <header className="fixed top-0 left-0 right-0 md:left-20 z-30 flex items-center px-4 md:px-8 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-bg/95 backdrop-blur-md border-b border-neutral-900/50">
            {/* Left side - Create post button (mobile only) */}
            <div className="w-16 flex-shrink-0 flex justify-start">
                <button
                    onClick={onCreatePost}
                    className="md:hidden p-2 bg-gradient-to-br from-amber-400 to-amber-500 rounded-lg text-black hover:from-amber-300 hover:to-amber-400 transition-all shadow-lg shadow-amber-500/20"
                    aria-label="Crear publicación"
                >
                    <Plus size={20} strokeWidth={2.5} />
                </button>
            </div>

            {/* Logo/Title - centered */}
            <div className="flex-1 flex justify-center">
                <button
                    onClick={() => navigate('/discover')}
                    className="text-lg font-serif tracking-tight text-white cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none p-0"
                >
                    Vinctus
                </button>
            </div>

            {/* Action icons - right side */}
            <div className="w-16 flex-shrink-0 flex justify-end">
                {/* Notifications */}
                <button
                    onClick={() => navigate('/notifications')}
                    className="relative p-2.5 text-neutral-400 hover:text-white transition-colors"
                    aria-label="Notificaciones"
                >
                    <Bell size={22} strokeWidth={1.5} />
                    {notificationCount > 0 && (
                        <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
                    )}
                </button>
            </div>
        </header>
    );
};

export default Header;
