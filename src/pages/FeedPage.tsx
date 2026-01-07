import { useState } from 'react';
import { Search, User, ArrowRight } from 'lucide-react';

const FeedPage = () => {
    const [activeTab, setActiveTab] = useState('grupos');
    const [searchQuery, setSearchQuery] = useState('');

    // Datos de conversaciones de grupos
    const CONVERSATIONS = [
        {
            id: 1,
            name: 'Exploradores Cuanticos',
            type: 'grupo',
            icon: '⚛️',
            lastMessage: 'Nuevo paper sobre entrelazamiento cuantico',
            time: '4 min',
            unread: 2
        },
        {
            id: 2,
            name: 'Documentales HispaMundo',
            type: 'grupo',
            icon: '▶️',
            lastMessage: 'Marco: Ha salido un nuevo...',
            time: '1 h',
            unread: 5
        },
        {
            id: 3,
            name: 'IA y Futuro',
            type: 'grupo',
            icon: '⚛️',
            lastMessage: 'Alvaro: Increible! Puedes pas...',
            time: '10 abr',
            unread: 8
        },
        {
            id: 4,
            name: 'Musica: Salsa',
            type: 'grupo',
            icon: '🎵',
            lastMessage: 'Adriana: Nuevo tema para...',
            time: '4 abr',
            unread: 1
        },
        {
            id: 5,
            name: 'Astronomia & Cosmos',
            type: 'grupo',
            icon: '🌌',
            lastMessage: 'Resena: Guia de Observacio...',
            time: '1 abr',
            unread: 0
        },
        {
            id: 6,
            name: 'Paisajes y Sabores',
            type: 'grupo',
            icon: '🥖',
            lastMessage: 'Eric: Receta facil para hornear...',
            time: '14 abr',
            unread: 1
        }
    ];

    // Datos de conversaciones privadas
    const PRIVATE_CONVERSATIONS = [
        {
            id: 1,
            name: 'Dr. Elena R.',
            icon: '',
            lastMessage: 'Sobre el paper de...',
            time: '2 h',
            unread: 1
        },
        {
            id: 2,
            name: 'Marco V.',
            icon: '',
            lastMessage: 'Viste el nuevo paper?',
            time: '1 dia',
            unread: 0
        }
    ];

    const currentConversations = activeTab === 'grupos' ? CONVERSATIONS : PRIVATE_CONVERSATIONS;

    const filteredConversations = currentConversations.filter(conv =>
        conv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="page-feed pb-32">
            {/* Header */}
            <header className="mb-8 pt-6 md:pt-10 text-center">
                <span className="text-caption font-medium tracking-[0.3em] text-neutral-500 uppercase mb-2 block">EN CONVERSACION</span>
                <h1 className="text-display-sm md:text-display-md font-display font-normal text-white tracking-tight">
                    Dialogos
                </h1>
            </header>

            {/* Barra de busqueda */}
            <div className="mb-6">
                <div className="relative bg-neutral-900/50 border border-neutral-800 rounded-full px-6 py-3">
                    <input
                        type="text"
                        placeholder="Buscar mensajes o grupos..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-transparent text-white text-center focus:outline-none placeholder:text-neutral-600 font-light text-sm"
                    />
                    <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-neutral-600" size={18} />
                </div>
            </div>

            {/* Tabs */}
            <div className="flex justify-center mb-8">
                <div className="inline-flex bg-neutral-900/50 border border-neutral-800 rounded-full p-1">
                    <button
                        onClick={() => setActiveTab('grupos')}
                        className={`px-6 py-2 rounded-full text-sm font-light transition-all ${activeTab === 'grupos'
                            ? 'bg-neutral-800 text-white'
                            : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                    >
                        Grupos
                    </button>
                    <button
                        onClick={() => setActiveTab('privados')}
                        className={`px-6 py-2 rounded-full text-sm font-light transition-all ${activeTab === 'privados'
                            ? 'bg-neutral-800 text-white'
                            : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                    >
                        Privados
                    </button>
                </div>
            </div>

            {/* Lista de conversaciones */}
            <div className="space-y-2">
                {filteredConversations.map(conv => (
                    <div
                        key={conv.id}
                        className="flex items-center gap-4 bg-neutral-900/20 border border-neutral-800/50 rounded-lg p-4 cursor-pointer hover:bg-neutral-900/40 hover:border-neutral-700 transition-all group"
                    >
                        {/* Icon */}
                        <div className="w-12 h-12 rounded-full bg-neutral-800/80 flex items-center justify-center flex-shrink-0 text-xl">
                            {conv.icon || conv.name.charAt(0)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-white font-medium text-base truncate">{conv.name}</h3>
                                {activeTab === 'grupos' && (
                                    <span className="text-[9px] px-2 py-0.5 bg-neutral-800 text-neutral-400 rounded uppercase tracking-wider flex items-center gap-1">
                                        <User size={8} />
                                        Grupo
                                    </span>
                                )}
                            </div>
                            <p className="text-neutral-500 text-sm truncate">{conv.lastMessage}</p>
                        </div>

                        {/* Time and unread badge */}
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <div className="flex items-center gap-1 text-neutral-500 text-xs">
                                <span>{conv.time}</span>
                                <ArrowRight size={12} className="text-neutral-600" />
                            </div>
                            {conv.unread > 0 && (
                                <span className="w-5 h-5 rounded-full bg-brand-gold text-black text-caption font-medium flex items-center justify-center">
                                    {conv.unread}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FeedPage;
