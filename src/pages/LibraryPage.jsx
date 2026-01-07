import { useState, useMemo } from 'react';
import { Search, ArrowRight, FolderPlus } from 'lucide-react';
import { useToast } from '../components/Toast';

const LibraryPage = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const { showToast } = useToast();

    // Datos de carpetas
    const FOLDERS = [
        { id: 1, name: 'Para despues', count: 9, icon: '📁' },
        { id: 2, name: 'Fisica', count: 12, icon: '📂' },
        { id: 3, name: 'Salsa', count: 7, icon: '🎵' },
        { id: 4, name: 'Ideas de proyectos', count: 4, icon: '💡' },
        { id: 5, name: 'Lecturas largas', count: 14, icon: '📚' }
    ];

    // Datos de recientes
    const RECENTS = [
        {
            id: 1,
            title: 'Paper sobre orbitas exoplanetarias',
            collection: 'Fisica',
            time: '10 horas',
            icon: '📄'
        },
        {
            id: 2,
            title: 'La magia de Ruben Blades',
            collection: 'Salsa',
            time: '1 dia',
            hasImage: true
        },
        {
            id: 3,
            title: 'Neuroplasticidad: Una guia esencial',
            collection: 'Para despues',
            time: '2 dias',
            icon: '#'
        }
    ];

    // Filter folders and recents based on search query
    const filteredFolders = useMemo(() => {
        if (!searchQuery.trim()) return FOLDERS;
        const query = searchQuery.toLowerCase();
        return FOLDERS.filter(folder =>
            folder.name.toLowerCase().includes(query)
        );
    }, [searchQuery]);

    const filteredRecents = useMemo(() => {
        if (!searchQuery.trim()) return RECENTS;
        const query = searchQuery.toLowerCase();
        return RECENTS.filter(item =>
            item.title.toLowerCase().includes(query) ||
            item.collection.toLowerCase().includes(query)
        );
    }, [searchQuery]);

    const handleNewFolder = () => {
        showToast('Crear carpetas estara disponible pronto', 'info');
    };

    return (
        <div className="page-library pb-32">
            {/* Header */}
            <header className="mb-10 pt-6 md:pt-10 text-center">
                <h1 className="text-4xl md:text-5xl font-serif font-light text-white mb-4 tracking-tight">
                    Colecciones
                </h1>
                <p className="text-neutral-500 font-light text-sm">
                    Tu archivo personal de lecturas, recursos, musica y mas.
                </p>
            </header>

            {/* Barra de busqueda */}
            <div className="mb-8">
                <div className="relative bg-neutral-900/50 border border-neutral-800 rounded-lg px-5 py-3.5">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-600" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar en colecciones..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-transparent text-white pl-8 focus:outline-none placeholder:text-neutral-600 font-light"
                    />
                </div>
            </div>

            {/* Nueva carpeta button */}
            <button
                onClick={handleNewFolder}
                className="w-full mb-8 flex items-center justify-between bg-neutral-900/30 border border-neutral-800 rounded-lg px-5 py-4 hover:bg-neutral-900/50 transition-colors group"
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
            <section className="mb-10">
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
                                    <p className="text-neutral-500 text-xs mt-0.5">Coleccion: {item.collection}</p>
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
    );
};

export default LibraryPage;
