import { useState } from 'react';
import { Settings, Search, ArrowRight, FolderPlus, BookOpen, MapPin, Mail, Edit3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';

const ProfilePage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeSection, setActiveSection] = useState<'profile' | 'collections'>('profile');

    // User profile data (from Firebase Auth + defaults for new users)
    const displayName = user?.displayName || 'Usuario';
    const email = user?.email || '';
    const initial = displayName.charAt(0).toUpperCase();
    const photoURL = user?.photoURL || null;

    // Default profile data for new users (editable later)
    const userProfile = {
        role: 'Nuevo miembro',
        location: 'Sin ubicación',
        bio: 'Aún no has añadido una biografía. ¡Cuéntale al mundo sobre ti!',
        reputation: 0,
        credentials: [] as { label: string; color: string }[],
        contributions: [] as { id: number; title: string; category: string; year: string }[]
    };

    // Collections mock data
    const FOLDERS = [
        { id: 1, name: 'Para después', count: 9, icon: '📁' },
        { id: 2, name: 'Física', count: 12, icon: '📂' },
        { id: 3, name: 'Salsa', count: 7, icon: '🎵' },
        { id: 4, name: 'Ideas de proyectos', count: 4, icon: '💡' },
        { id: 5, name: 'Lecturas largas', count: 14, icon: '📚' }
    ];

    const RECENTS = [
        { id: 1, title: 'Paper sobre órbitas exoplanetarias', collection: 'Física', time: '10 horas', icon: '📄' },
        { id: 2, title: 'La magia de Rubén Blades', collection: 'Salsa', time: '1 día', hasImage: true },
        { id: 3, title: 'Neuroplasticidad: Una guía esencial', collection: 'Para después', time: '2 días', icon: '#' }
    ];

    const filteredFolders = !searchQuery.trim()
        ? FOLDERS
        : FOLDERS.filter(folder => folder.name.toLowerCase().includes(searchQuery.toLowerCase()));

    const filteredRecents = !searchQuery.trim()
        ? RECENTS
        : RECENTS.filter(item => {
            const query = searchQuery.toLowerCase();
            return item.title.toLowerCase().includes(query) || item.collection.toLowerCase().includes(query);
        });

    const handleNewFolder = () => {
        showToast('Crear carpetas estará disponible pronto', 'info');
    };

    const handleEditProfile = () => {
        showToast('Editar perfil estará disponible pronto', 'info');
    };

    return (
        <div className="page-profile pt-8 max-w-4xl mx-auto pb-32">
            {/* Profile Header */}
            <header className="flex items-start justify-between mb-12 pb-8 border-b border-neutral-900">
                <div className="flex items-center gap-6">
                    {/* Avatar */}
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 flex items-center justify-center text-3xl font-serif text-amber-500">
                        {photoURL ? (
                            <img src={photoURL} alt={displayName} className="w-full h-full rounded-full object-cover" />
                        ) : (
                            initial
                        )}
                    </div>

                    {/* Name and info */}
                    <div>
                        <h1 className="text-4xl font-serif font-light text-white mb-2">{displayName}</h1>
                        <p className="text-neutral-400 mb-1">{userProfile.role}</p>
                        <p className="text-neutral-600 text-sm flex items-center">
                            <MapPin size={12} className="mr-1" />
                            {userProfile.location}
                        </p>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/settings')}
                        className="p-2.5 border border-neutral-700 text-neutral-500 hover:text-white hover:bg-neutral-900 transition-colors rounded-lg"
                        aria-label="Configuración"
                    >
                        <Settings size={18} />
                    </button>
                    <button
                        onClick={handleEditProfile}
                        className="flex items-center gap-2 px-5 py-2.5 border border-neutral-700 text-white hover:bg-neutral-900 transition-colors text-sm rounded-lg"
                    >
                        <Edit3 size={16} />
                        Editar Perfil
                    </button>
                </div>
            </header>

            {/* Tabs: Mi Perfil | Colecciones */}
            <div className="flex justify-center mb-8">
                <div className="inline-flex bg-neutral-900/30 border border-neutral-800 rounded-full p-1">
                    <button
                        onClick={() => setActiveSection('profile')}
                        className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${activeSection === 'profile'
                            ? 'bg-neutral-800 text-white'
                            : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                    >
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                    {/* Left column - About */}
                    <div className="md:col-span-1 space-y-8">
                        {/* About me */}
                        <section>
                            <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-4">Sobre Mí</h2>
                            <p className="text-neutral-400 font-light leading-relaxed italic">{userProfile.bio}</p>
                            <button
                                onClick={handleEditProfile}
                                className="mt-3 text-amber-500 text-sm hover:text-amber-400 transition-colors"
                            >
                                + Añadir biografía
                            </button>
                        </section>

                        {/* Credentials */}
                        <section>
                            <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-4">Credenciales</h2>
                            {userProfile.credentials.length > 0 ? (
                                <div className="space-y-2">
                                    {userProfile.credentials.map((cred, idx) => (
                                        <div key={idx} className="flex items-center gap-2 text-sm">
                                            <BookOpen size={16} className={cred.color} />
                                            <span className="text-neutral-300">{cred.label}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-neutral-600 text-sm italic">Sin credenciales aún</p>
                            )}
                        </section>

                        {/* Reputation */}
                        <section>
                            <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-4">Reputación</h2>
                            <div className="flex items-center gap-4">
                                <div className="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-500"
                                        style={{ width: `${userProfile.reputation}%` }}
                                    />
                                </div>
                                <span className="text-neutral-400 text-lg font-light">{userProfile.reputation}</span>
                            </div>
                            <p className="text-neutral-600 text-xs mt-2">Contribuye para aumentar tu reputación</p>
                        </section>

                        {/* Contact info */}
                        <section>
                            <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-4">Contacto</h2>
                            <div className="flex items-center gap-2 text-sm text-neutral-400">
                                <Mail size={14} />
                                <span>{email}</span>
                            </div>
                        </section>
                    </div>

                    {/* Right column - Portfolio */}
                    <div className="md:col-span-2">
                        <h2 className="text-xs tracking-[0.2em] text-neutral-600 uppercase mb-6">Portafolio & Contribuciones</h2>

                        {userProfile.contributions.length > 0 ? (
                            <div className="space-y-3">
                                {userProfile.contributions.map(item => (
                                    <div
                                        key={item.id}
                                        className="flex items-center gap-4 p-5 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/30 transition-all cursor-pointer group rounded-lg"
                                    >
                                        <BookOpen size={20} className="text-neutral-600 group-hover:text-neutral-400" />
                                        <div className="flex-1">
                                            <span className="text-[10px] tracking-widest text-neutral-600 uppercase">{item.category}</span>
                                            <h3 className="text-lg text-neutral-200 font-serif font-light group-hover:text-white transition-colors">
                                                {item.title}
                                            </h3>
                                        </div>
                                        <span className="text-neutral-600 text-sm">{item.year}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-16 text-center border border-dashed border-neutral-800 rounded-lg">
                                <BookOpen size={32} strokeWidth={0.5} className="mx-auto mb-4 text-neutral-600" />
                                <p className="text-neutral-500 font-light italic mb-4">Sin contribuciones publicadas aún.</p>
                                <button
                                    onClick={() => showToast('Crear contenido estará disponible pronto', 'info')}
                                    className="text-amber-500 text-sm hover:text-amber-400 transition-colors"
                                >
                                    + Publicar tu primera contribución
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Collections Section */}
            {activeSection === 'collections' && (
                <div className="space-y-8">
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

                    {/* Nueva carpeta */}
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
                                        className="bg-neutral-900/30 border border-neutral-800 rounded-lg p-4 cursor-pointer hover:bg-neutral-900/50 hover:border-neutral-700 transition-all"
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
                                        <div className="w-12 h-12 rounded-lg bg-neutral-800/80 flex items-center justify-center flex-shrink-0">
                                            {item.hasImage ? (
                                                <img src="/jazz.png" alt={item.title} className="w-full h-full object-cover rounded-lg" />
                                            ) : (
                                                <span className="text-neutral-400 text-lg">{item.icon}</span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-white font-light text-base truncate">{item.title}</h3>
                                            <p className="text-neutral-500 text-xs mt-0.5">Colección: {item.collection}</p>
                                        </div>
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
