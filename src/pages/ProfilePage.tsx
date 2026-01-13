import { useState } from 'react';
import { Feather, Settings, Search, ArrowRight, FolderPlus, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';

const ProfilePage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeSection, setActiveSection] = useState<'profile' | 'collections'>('profile');

    // Datos de carpetas (mock)
    const FOLDERS = [
        { id: 1, name: 'Para después', count: 9, icon: '📁' },
        { id: 2, name: 'Física', count: 12, icon: '📂' },
        { id: 3, name: 'Salsa', count: 7, icon: '🎵' },
        { id: 4, name: 'Ideas de proyectos', count: 4, icon: '💡' },
        { id: 5, name: 'Lecturas largas', count: 14, icon: '📚' }
    ];

    // Datos de recientes (mock)
    const RECENTS = [
        {
            id: 1,
            title: 'Paper sobre órbitas exoplanetarias',
            collection: 'Física',
            time: '10 horas',
            icon: '📄'
        },
        {
            id: 2,
            title: 'La magia de Rubén Blades',
            collection: 'Salsa',
            time: '1 día',
            hasImage: true
        },
        {
            id: 3,
            title: 'Neuroplasticidad: Una guía esencial',
            collection: 'Para después',
            time: '2 días',
            icon: '#'
        }
    ];

    // Filter folders and recents based on search query
    const filteredFolders = !searchQuery.trim()
        ? FOLDERS
        : FOLDERS.filter(folder =>
            folder.name.toLowerCase().includes(searchQuery.toLowerCase())
        );

    const filteredRecents = !searchQuery.trim()
        ? RECENTS
        : RECENTS.filter(item => {
            const query = searchQuery.toLowerCase();
            return item.title.toLowerCase().includes(query) ||
                item.collection.toLowerCase().includes(query);
        });

    const handleNewFolder = () => {
        showToast('Crear carpetas estará disponible pronto', 'info');
    };

    const displayName = user?.displayName || 'Usuario';
    const initial = displayName.charAt(0).toUpperCase();

    return (
        <div className="page-profile pt-10 max-w-4xl mx-auto pb-32">
            {/* Header del perfil */}
            <header className="flex items-start justify-between mb-8 pb-8 border-b border-neutral-900">
                <div className="flex items-center gap-6">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 flex items-center justify-center text-3xl font-serif text-amber-500">
                        {initial}
                    </div>
                    <div>
                        <h1 className="text-4xl font-serif font-light text-white mb-2">{displayName}</h1>
                        <p className="text-neutral-400 mb-1">{user?.email || ''}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/settings')}
                        className="p-2.5 border border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors rounded-lg"
                        aria-label="Configuración"
                    >
                        <Settings size={18} />
                    </button>
                    <button className="px-5 py-2.5 border border-neutral-700 text-white hover:bg-neutral-900 transition-colors text-sm rounded-lg">
                        Editar Perfil
                    </button>
                </div>
            </header>

            {/* Tabs: Perfil | Colecciones */}
            <div className="flex justify-center mb-8">
                <div className="inline-flex bg-neutral-900/30 border border-neutral-800 rounded-full p-1">
                    <button
                        onClick={() => setActiveSection('profile')}
                        className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${activeSection === 'profile'
                                ? 'bg-neutral-800 text-white'
                                : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                    >
                        <Feather size={16} />
                        Mi Perfil
                    </button>
                    <button
                        onClick={() => setActiveSection('collections')}
                        className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${activeSection === 'collections'
                                ? 'bg-neutral-800 text-white'
                                : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                    >
                        <BookOpen size={16} />
                        Colecciones
                    </button>
                </div>
            </div>

            {/* Profile Section */}
            {activeSection === 'profile' && (
                <div className="py-16 text-center border border-dashed border-neutral-800 rounded-lg">
                    <Feather size={32} strokeWidth={0.5} className="mx-auto mb-4 text-neutral-600" />
                    <p className="text-neutral-500 font-light italic">Personaliza tu perfil para comenzar</p>
                </div>
            )}

            {/* Collections Section */}
            {activeSection === 'collections' && (
                <div className="space-y-8">
                    {/* Subtitle */}
                    <p className="text-neutral-500 font-light text-sm text-center">
                        Tu archivo personal de lecturas, recursos, música y más.
                    </p>

                    {/* Search */}
                    <div className="relative bg-neutral-900/50 border border-neutral-800 rounded-lg px-5 py-3.5">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-600" size={18} />
                        <input
                            type="text"
                            aria-label="Buscar en colecciones"
                            placeholder="Buscar en colecciones..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-transparent text-white pl-8 focus:outline-none placeholder:text-neutral-600 font-light"
                        />
                    </div>

                    {/* Nueva carpeta button */}
                    <button
                        onClick={handleNewFolder}
                        className="w-full flex items-center justify-between bg-neutral-900/30 border border-neutral-800 rounded-lg px-5 py-4 hover:bg-neutral-900/50 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400">
                                <FolderPlus size={18} />
                            </div>
                            <span className="text-neutral-300 font-light">+ Nueva carpeta</span>
                        </div>
                        <ArrowRight size={16} className="text-neutral-600 group-hover:text-neutral-400 transition-colors" />
                    </button>

                    {/* CARPETAS */}
                    <section>
                        <h2 className="text-[10px] font-medium tracking-[0.2em] text-neutral-500 uppercase mb-4">
                            CARPETAS {searchQuery && `(${filteredFolders.length})`}
                        </h2>

                        {filteredFolders.length === 0 ? (
                            <p className="text-neutral-500 text-sm text-center py-6">No se encontraron carpetas</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {filteredFolders.map(folder => (
                                    <div
                                        key={folder.id}
                                        onClick={() => showToast('Abrir carpetas estará disponible pronto', 'info')}
                                        className="bg-neutral-900/30 border border-neutral-800 rounded-lg p-4 cursor-pointer hover:bg-neutral-900/50 hover:border-neutral-700 transition-all group"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-neutral-800/80 flex items-center justify-center text-lg">
                                                {folder.icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-white font-medium text-sm truncate">{folder.name}</h3>
                                                <p className="text-neutral-500 text-xs mt-0.5">{folder.count} guardados</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* RECIENTES */}
                    <section>
                        <h2 className="text-[10px] font-medium tracking-[0.2em] text-neutral-500 uppercase mb-4">
                            RECIENTES {searchQuery && `(${filteredRecents.length})`}
                        </h2>

                        {filteredRecents.length === 0 ? (
                            <p className="text-neutral-500 text-sm text-center py-6">No se encontraron elementos recientes</p>
                        ) : (
                            <div className="space-y-2">
                                {filteredRecents.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => showToast('Ver elemento estará disponible pronto', 'info')}
                                        className="flex items-center gap-4 bg-neutral-900/30 border border-neutral-800 rounded-lg p-4 cursor-pointer hover:bg-neutral-900/50 hover:border-neutral-700 transition-all group"
                                    >
                                        {/* Icon/Image */}
                                        <div className="w-12 h-12 rounded-lg bg-neutral-800/80 flex items-center justify-center flex-shrink-0">
                                            {item.hasImage ? (
                                                <img
                                                    src="/jazz.png"
                                                    alt={item.title}
                                                    className="w-full h-full object-cover rounded-lg"
                                                />
                                            ) : (
                                                <span className="text-neutral-400 text-lg">{item.icon}</span>
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-white font-light text-base truncate group-hover:text-white/90">{item.title}</h3>
                                            <p className="text-neutral-500 text-xs mt-0.5">Colección: {item.collection}</p>
                                        </div>

                                        {/* Time and arrow */}
                                        <div className="flex items-center gap-2 text-neutral-500 text-xs flex-shrink-0">
                                            <span>{item.time}</span>
                                            <ArrowRight size={14} className="text-neutral-600 group-hover:text-neutral-400 transition-colors" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
};

export default ProfilePage;
