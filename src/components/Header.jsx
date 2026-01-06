import { Bell, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Header = ({ notificationCount = 3 }) => {
    const navigate = useNavigate();

    return (
        <header className="fixed top-0 right-0 left-20 z-30 flex items-center justify-end px-8 py-4 bg-gradient-to-b from-[#0a0a0a] to-transparent pointer-events-none">
            <div className="flex items-center space-x-4 pointer-events-auto">
                {/* Notifications */}
                <button
                    onClick={() => navigate('/notifications')}
                    className="relative p-2 text-neutral-500 hover:text-white transition-colors"
                    aria-label="Notificaciones"
                >
                    <Bell size={20} strokeWidth={1.5} />
                    {notificationCount > 0 && (
                        <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
                    )}
                </button>

                {/* Messages */}
                <button
                    onClick={() => navigate('/messages')}
                    className="p-2 text-neutral-500 hover:text-white transition-colors"
                    aria-label="Mensajes"
                >
                    <MessageSquare size={20} strokeWidth={1.5} />
                </button>
            </div>
        </header>
    );
};

export default Header;
