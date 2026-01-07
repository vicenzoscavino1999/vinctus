import { Bell, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Header = ({ notificationCount = 0 }) => {
    const navigate = useNavigate();

    return (
        <header className="fixed top-0 left-0 right-0 md:left-20 z-30 flex items-center justify-between px-4 md:px-8 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-[#0a0a0a]/95 backdrop-blur-md border-b border-neutral-900/50">
            {/* Spacer for mobile - left side empty */}
            <div className="w-16 md:hidden" />

            {/* Logo/Title - center on mobile, left on desktop */}
            <button
                onClick={() => navigate('/discover')}
                className="text-lg font-serif tracking-tight text-white cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none p-0"
            >
                Vinctus
            </button>

            {/* Action icons - right side */}
            <div className="flex items-center space-x-1">
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

                {/* Messages */}
                <button
                    onClick={() => navigate('/messages')}
                    className="p-2.5 text-neutral-400 hover:text-white transition-colors"
                    aria-label="Mensajes"
                >
                    <MessageSquare size={22} strokeWidth={1.5} />
                </button>
            </div>
        </header>
    );
};

export default Header;
