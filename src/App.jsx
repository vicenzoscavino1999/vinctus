import { useState, useMemo, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Search,
  Compass,
  Hash,
  User,
  ChevronLeft,
  Feather,
  BookOpen,
  Briefcase,
  ArrowRight,
  Loader
} from 'lucide-react';

// Import components
import {
  SidebarItem,
  CategoryCard,
  PostCard,
  CollaborationCard,
  LibraryItem,
  EventCard,
  ApiContentCard,
  Header,
  UserProfilePage,
  LoginScreen
} from './components';

// Import hooks
import { useApiContent } from './hooks';

// Import data
import {
  CATEGORIES,
  FEED_POSTS,
  COLLABORATIONS,
  GLOBAL_LIBRARY_HIGHLIGHTS,
  EVENTS
} from './data';

// Logo component
const Logo = () => (
  <div className="w-14 h-14 flex items-center justify-center mb-16 opacity-90 hover:opacity-100 transition-opacity">
    <img src="/image_fdd620.png" alt="Logo" className="w-full h-full object-contain" />
  </div>
);

// Sidebar component
const Sidebar = ({ activeTab, onNavigate }) => (
  <aside className="hidden md:flex w-20 flex-col items-center py-12 fixed h-full z-20 border-r border-neutral-900/50 bg-[#0a0a0a]">
    <Logo />
    <nav className="flex flex-col space-y-4">
      <SidebarItem icon={Compass} active={activeTab === 'discover'} onClick={() => onNavigate('/discover')} tooltip="Descubrir" />
      <SidebarItem icon={Hash} active={activeTab === 'feed'} onClick={() => onNavigate('/feed')} tooltip="Conversación" />
      <SidebarItem icon={Briefcase} active={activeTab === 'projects'} onClick={() => onNavigate('/projects')} tooltip="Conexiones" />
      <SidebarItem icon={BookOpen} active={activeTab === 'library'} onClick={() => onNavigate('/library')} tooltip="Colecciones" />
    </nav>
    <div className="mt-auto mb-4">
      <SidebarItem icon={User} active={activeTab === 'profile'} onClick={() => onNavigate('/profile')} tooltip="Perfil" />
    </div>
  </aside>
);

// Mobile navigation
const MobileNav = ({ activeTab, onNavigate }) => (
  <div className="md:hidden fixed bottom-0 w-full bg-[#0a0a0a]/95 backdrop-blur-md border-t border-neutral-900 flex justify-around px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-50">
    <button onClick={() => onNavigate('/discover')} aria-label="Descubrir" className={`p-2.5 ${activeTab === 'discover' ? 'text-white' : 'text-neutral-600'}`}><Compass size={24} strokeWidth={1} /></button>
    <button onClick={() => onNavigate('/feed')} aria-label="Diálogos" className={`p-2.5 ${activeTab === 'feed' ? 'text-white' : 'text-neutral-600'}`}><Hash size={24} strokeWidth={1} /></button>
    <button onClick={() => onNavigate('/projects')} aria-label="Conexiones" className={`p-2.5 ${activeTab === 'projects' ? 'text-white' : 'text-neutral-600'}`}><Briefcase size={24} strokeWidth={1} /></button>
    <button onClick={() => onNavigate('/library')} aria-label="Colecciones" className={`p-2.5 ${activeTab === 'library' ? 'text-white' : 'text-neutral-600'}`}><BookOpen size={24} strokeWidth={1} /></button>
    <button onClick={() => onNavigate('/profile')} aria-label="Perfil" className={`p-2.5 ${activeTab === 'profile' ? 'text-white' : 'text-neutral-600'}`}><User size={24} strokeWidth={1} /></button>
  </div>
);
// Datos para publicaciones
const PUBLICATIONS = [
  {
    id: 1,
    title: "Un agujero negro revela secretos del universo temprano",
    group: "Exploradores Cuánticos",
    category: "Ciencia & Materia",
    categoryId: "science",
    image: "/blackhole.png",
    likes: 318,
    comments: 21
  },
  {
    id: 2,
    title: "Entrelazamiento cuántico: Nuevos experimentos",
    group: "Física Teórica",
    category: "Ciencia & Materia",
    categoryId: "science",
    image: "/quantum.png",
    likes: 245,
    comments: 18
  },
  {
    id: 3,
    title: "La evolución del jazz modal en NY",
    group: "Melómanos Unidos",
    category: "Acústica & Arte",
    categoryId: "music",
    image: "/jazz.png",
    likes: 189,
    comments: 34
  }
];

// Grupos recomendados
const RECOMMENDED_GROUPS = [
  {
    id: 1,
    name: "Exploradores Cuánticos",
    members: 832,
    postsPerWeek: 5,
    categoryId: "science",
    subgroup: { name: "Anexo ciánia", members: "1 es" }
  },
  {
    id: 2,
    name: "Documentales HispaMundo",
    members: 1124,
    postsPerWeek: 4,
    categoryId: "history",
    subgroup: { name: "Crecer ciánia", members: "1 es" }
  }
];

// Discover page with new design
const DiscoverPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const [savedCategories, setSavedCategories] = useState([]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return CATEGORIES;
    const query = searchQuery.toLowerCase();
    return CATEGORIES.filter(cat =>
      cat.label.toLowerCase().includes(query) ||
      cat.description.toLowerCase().includes(query) ||
      cat.subgroups.some(sub => sub.name.toLowerCase().includes(query))
    );
  }, [searchQuery]);

  const handleSearch = (e) => {
    const value = e.target.value;
    if (value) {
      setSearchParams({ q: value });
    } else {
      setSearchParams({});
    }
  };

  const toggleSave = (catId) => {
    setSavedCategories(prev =>
      prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
    );
  };

  return (
    <div className="page-discover pb-32">
      {/* Header */}
      <header className="mb-12 pt-6 md:pt-10 flex flex-col items-center text-center">
        <span className="text-[10px] font-medium tracking-[0.3em] text-neutral-500 uppercase mb-4">DESCUBRIR</span>
        <h1 className="text-3xl md:text-5xl font-serif font-thin text-white mb-8 tracking-tight">
          Curaduría de <span className="text-neutral-500 italic">Intereses</span>
        </h1>

        {/* Barra de búsqueda */}
        <div className="w-full max-w-lg mt-4">
          <div className="relative bg-neutral-900/50 border border-neutral-800 rounded-full px-6 py-3">
            <input
              type="text"
              placeholder="Buscar intereses o grupos..."
              value={searchQuery}
              onChange={handleSearch}
              className="w-full bg-transparent text-white text-center focus:outline-none placeholder:text-neutral-600 font-light text-sm"
            />
            <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-neutral-600" size={18} />
          </div>
        </div>
      </header>

      {/* Tendencias esta semana */}
      <section className="mb-12">
        <h2 className="text-lg font-light text-white mb-6">
          <span className="text-amber-200/80">Tendencias</span> esta semana
        </h2>

        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
          {filteredCategories.map(cat => (
            <div
              key={cat.id}
              className="flex-shrink-0 w-[280px] bg-[#1a1916] border border-neutral-800/50 rounded-lg p-5 cursor-pointer hover:border-neutral-700 transition-all group"
              onClick={() => navigate(`/category/${cat.id}`)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`${cat.color} opacity-70`}>
                    <cat.icon size={28} strokeWidth={1} />
                  </div>
                  <div>
                    <h3 className="text-white font-medium text-base">{cat.label}</h3>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSave(cat.id); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] uppercase tracking-wide transition-colors ${savedCategories.includes(cat.id)
                    ? 'bg-amber-200/20 text-amber-200'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                    }`}
                >
                  <BookOpen size={10} />
                  {savedCategories.includes(cat.id) ? 'Guardado' : 'Guardar'}
                </button>
              </div>

              <p className="text-neutral-500 text-sm mb-4 line-clamp-2">{cat.description}</p>

              <div className="flex flex-wrap gap-2 pt-3 border-t border-neutral-800/50">
                {cat.subgroups.slice(0, 2).map(sub => (
                  <span key={sub.id} className="text-[10px] uppercase tracking-wider text-neutral-500 bg-neutral-800/50 px-2 py-1 rounded">
                    {sub.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Grupos recomendados */}
      <section className="mb-12">
        <h2 className="text-lg font-light text-white mb-6">
          <span className="text-neutral-400">Grupos</span> recomendados
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {RECOMMENDED_GROUPS.map(group => (
            <div key={group.id} className="bg-[#1a1916] border border-neutral-800/50 rounded-lg p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-medium text-lg">{group.name}</h3>
                  <p className="text-neutral-500 text-xs mt-1">
                    {group.members} miembros, {group.postsPerWeek} post ta/ st semana
                  </p>
                </div>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded text-xs hover:bg-neutral-700 transition-colors">
                  <BookOpen size={12} />
                  Unirme
                </button>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-neutral-800/50 mt-3">
                <div className="flex items-center gap-2 text-neutral-500 text-xs">
                  <div className={`${CATEGORIES.find(c => c.id === group.categoryId)?.color || 'text-neutral-400'} opacity-60`}>
                    {(() => {
                      const cat = CATEGORIES.find(c => c.id === group.categoryId);
                      return cat ? <cat.icon size={14} strokeWidth={1.5} /> : null;
                    })()}
                  </div>
                  <span>{group.subgroup.name}</span>
                  <span className="text-neutral-600">urata {group.subgroup.members}</span>
                </div>
                <button className="text-neutral-400 text-xs hover:text-white transition-colors">
                  + Unirme
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Publicaciones */}
      <section>
        <h2 className="text-lg font-light text-white mb-6">Publicaciones</h2>

        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
          {PUBLICATIONS.map(pub => (
            <div
              key={pub.id}
              className="flex-shrink-0 w-[320px] md:w-[400px] h-[280px] md:h-[320px] relative rounded-lg overflow-hidden cursor-pointer group"
            >
              {/* Background image */}
              <img
                src={pub.image}
                alt={pub.title}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />

              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />

              {/* Content */}
              <div className="absolute inset-0 p-5 flex flex-col justify-between">
                {/* Top - Group badge */}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                    {(() => {
                      const cat = CATEGORIES.find(c => c.id === pub.categoryId);
                      return cat ? <cat.icon size={14} className="text-amber-200" strokeWidth={1.5} /> : null;
                    })()}
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{pub.group}</p>
                    <p className="text-neutral-400 text-xs">{pub.category}</p>
                  </div>
                </div>

                {/* Right side - Interaction buttons */}
                <div className="absolute right-5 top-1/2 -translate-y-1/2 flex flex-col gap-4">
                  <button className="flex flex-col items-center text-white/80 hover:text-white transition-colors">
                    <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center mb-1">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                    </div>
                    <span className="text-xs">{pub.likes}</span>
                  </button>
                  <button className="flex flex-col items-center text-white/80 hover:text-white transition-colors">
                    <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center mb-1">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                    </div>
                    <span className="text-xs">{pub.comments}</span>
                  </button>
                  <button className="flex flex-col items-center text-white/80 hover:text-white transition-colors">
                    <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                    </div>
                  </button>
                </div>

                {/* Bottom - Title */}
                <div>
                  <h3 className="text-white text-lg font-light mb-2 pr-16 line-clamp-2">{pub.title}</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-neutral-400 text-xs">
                      {(() => {
                        const cat = CATEGORIES.find(c => c.id === pub.categoryId);
                        return cat ? <cat.icon size={12} strokeWidth={1.5} /> : null;
                      })()}
                      <span>{pub.category}</span>
                    </div>
                    <div className="flex items-center gap-1 text-neutral-400 text-xs">
                      <span>Deslizar para ver más</span>
                      <ArrowRight size={12} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

// Category detail page with API integration
const CategoryPage = () => {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('live');
  const [selectedSubgroup, setSelectedSubgroup] = useState(null);

  // Reset selectedSubgroup when category changes
  useEffect(() => {
    setSelectedSubgroup(null);
  }, [categoryId]);

  const category = CATEGORIES.find(c => c.id === categoryId);

  // Get API query from selected subgroup or default to first one
  const apiQuery = selectedSubgroup?.apiQuery || category?.subgroups[0]?.apiQuery || category?.id;

  // Fetch live content from API
  const { data: liveContent, loading, error } = useApiContent(
    category?.apiSource,
    apiQuery,
    8
  );

  if (!category) {
    return (
      <div className="py-20 text-center">
        <p className="text-neutral-500">Categoría no encontrada</p>
        <button onClick={() => navigate('/discover')} className="mt-4 text-white underline">Volver</button>
      </div>
    );
  }

  return (
    <div className="page-category">
      <button
        onClick={() => navigate('/discover')}
        className="group flex items-center text-neutral-500 hover:text-neutral-300 mb-8 transition-colors text-xs tracking-widest uppercase"
      >
        <ChevronLeft size={14} className="mr-2 group-hover:-translate-x-1 transition-transform" />
        Regresar
      </button>

      <header className="mb-12 border-b border-neutral-900 pb-12">
        <div className={`inline-flex mb-6 opacity-80 ${category.color}`}>
          <category.icon size={40} strokeWidth={0.5} />
        </div>

        <div className="flex justify-between items-end mb-6">
          <h1 className="text-5xl md:text-7xl font-serif font-light text-white tracking-tight">
            {category.label}
          </h1>
        </div>

        <p className="text-neutral-400 text-lg md:text-xl max-w-2xl font-light font-sans leading-relaxed mb-8">
          {category.description}
        </p>

        {/* Tab navigation */}
        <div className="flex space-x-8 text-sm tracking-widest uppercase">
          <button
            onClick={() => setViewMode('live')}
            className={`pb-2 border-b-2 transition-colors ${viewMode === 'live' ? 'text-white border-white' : 'text-neutral-600 border-transparent hover:text-neutral-400'}`}
          >
            En Vivo
          </button>
          <button
            onClick={() => setViewMode('subgroups')}
            className={`pb-2 border-b-2 transition-colors ${viewMode === 'subgroups' ? 'text-white border-white' : 'text-neutral-600 border-transparent hover:text-neutral-400'}`}
          >
            Comunidades
          </button>
          <button
            onClick={() => setViewMode('library')}
            className={`pb-2 border-b-2 transition-colors ${viewMode === 'library' ? 'text-white border-white' : 'text-neutral-600 border-transparent hover:text-neutral-400'}`}
          >
            Biblioteca
          </button>
        </div>
      </header>

      {/* Live content from API */}
      {viewMode === 'live' && (
        <div className="animate-in fade-in duration-500">
          {/* Subgroup filter buttons */}
          <div className="flex flex-wrap gap-2 mb-8">
            {category.subgroups.map((group) => (
              <button
                key={group.id}
                onClick={() => setSelectedSubgroup(group)}
                className={`text-xs px-4 py-2 rounded-full border transition-colors ${(selectedSubgroup?.id || category.subgroups[0].id) === group.id
                  ? 'bg-white text-black border-white'
                  : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-white'
                  }`}
              >
                {group.name}
              </button>
            ))}
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader size={24} className="animate-spin text-neutral-500" />
              <span className="ml-3 text-neutral-500">Cargando contenido...</span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="py-10 text-center border border-dashed border-red-800/50 rounded-lg">
              <p className="text-red-400/80">Error al cargar: {error}</p>
            </div>
          )}

          {/* Content grid */}
          {!loading && !error && liveContent.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-children">
              {liveContent.map((item, idx) => (
                <ApiContentCard key={item.id || idx} item={item} type={category.apiSource} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && liveContent.length === 0 && (
            <div className="py-20 text-center border border-dashed border-neutral-800 rounded-lg">
              <p className="text-neutral-500 font-light italic">No hay contenido disponible en este momento.</p>
            </div>
          )}
        </div>
      )}

      {/* Subgroups view */}
      {viewMode === 'subgroups' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-neutral-900 border border-neutral-900 animate-in fade-in duration-500">
          {category.subgroups.map((group) => (
            <div key={group.id} className="bg-neutral-950 p-10 hover:bg-neutral-900/40 transition-colors cursor-pointer group">
              <div className="flex justify-between items-start mb-8">
                <Hash size={16} className="text-neutral-700 group-hover:text-neutral-500 transition-colors" />
              </div>
              <h3 className="text-xl text-neutral-200 font-serif font-light mb-2">{group.name}</h3>
              <p className="text-neutral-600 text-xs tracking-wider uppercase mb-8">{group.members} Miembros</p>
              <div className="flex items-center text-neutral-500 text-xs group-hover:text-white transition-colors">
                <span>Explorar</span>
                <ArrowRight size={12} className="ml-2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Library view */}
      {viewMode === 'library' && (
        <div className="animate-in fade-in duration-500">
          {category.library && category.library.length > 0 ? (
            <div className="space-y-2 max-w-4xl">
              {category.library.map(item => <LibraryItem key={item.id} item={item} />)}
            </div>
          ) : (
            <div className="py-20 text-center border border-dashed border-neutral-800 rounded-lg">
              <p className="text-neutral-500 font-light italic">No hay documentos archivados en esta categoría aún.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Feed page - Diálogos
const FeedPage = () => {
  const [activeTab, setActiveTab] = useState('grupos');
  const [searchQuery, setSearchQuery] = useState('');

  // Datos de conversaciones de grupos
  const CONVERSATIONS = [
    {
      id: 1,
      name: 'Exploradores Cuánticos',
      type: 'grupo',
      icon: '⚛️',
      lastMessage: 'Anaestio clania urat 1 es',
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
      lastMessage: 'Álvaro: Increíble! Puedes pas...',
      time: '10 abr',
      unread: 8
    },
    {
      id: 4,
      name: 'Música: Salsa',
      type: 'grupo',
      icon: '🎵',
      lastMessage: 'Adriana: Nuevo tema para...',
      time: '4 abr',
      unread: 1
    },
    {
      id: 5,
      name: 'Astronomía & Cosmos',
      type: 'grupo',
      icon: '🌌',
      lastMessage: 'Reseña: Guía de Observació...',
      time: '1 abr',
      unread: 0
    },
    {
      id: 6,
      name: 'Papajes y Sabores',
      type: 'grupo',
      icon: '🥖',
      lastMessage: 'Eric: Receta fácil para hornear...',
      time: '14 abr',
      unread: 1
    }
  ];

  // Datos de conversaciones privadas
  const PRIVATE_CONVERSATIONS = [
    {
      id: 1,
      name: 'Dr. Elena R.',
      lastMessage: 'Sobre el paper de...',
      time: '2 h',
      unread: 1
    },
    {
      id: 2,
      name: 'Marco V.',
      lastMessage: '¿Viste el nuevo paper?',
      time: '1 día',
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
        <span className="text-[10px] font-medium tracking-[0.3em] text-neutral-500 uppercase mb-2 block">EN CONVERSACIÓN</span>
        <h1 className="text-4xl md:text-5xl font-serif font-light text-white tracking-tight">
          Diálogos
        </h1>
      </header>

      {/* Barra de búsqueda */}
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
                <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-[10px] font-medium flex items-center justify-center">
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

// Projects page
// Projects page - Conexiones (combina Colaboraciones y Encuentros)
const ProjectsPage = () => {
  // Datos de eventos actualizados
  const EVENTS_DATA = [
    { id: 1, day: '12', month: 'ENE', title: 'Noche de Vinilos & Charla', location: 'Ciudad de México, Roma Norte', attendees: 34 },
    { id: 2, day: '15', month: 'FEB', title: 'Simposio de Arqueología', location: 'Lima, Barranco', attendees: 120 },
    { id: 3, day: '28', month: 'ENE', title: 'Hackathon AI for Good', location: 'Buenos Aires, Palermo', attendees: 85 },
    { id: 4, day: '5', month: 'FEB', title: 'Observación de Aves', location: 'Bogotá, Humedal Córdoba', attendees: 25 }
  ];

  return (
    <div className="page-projects pb-32">
      {/* Header */}
      <header className="mb-10 pt-6 md:pt-10 flex flex-col md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-4xl md:text-5xl font-serif font-light text-white mb-3 tracking-tight">
            Conexiones
          </h1>
          <p className="text-neutral-500 font-light text-sm">
            Conecta. Colabora. Encuentra.
          </p>
        </div>
        <button className="mt-6 md:mt-0 text-xs bg-white text-black px-6 py-3 hover:bg-neutral-200 transition-colors uppercase tracking-widest font-medium flex items-center gap-2">
          + PUBLICAR PROYECTO
        </button>
      </header>

      {/* Colaboraciones */}
      <section className="mb-10">
        <h2 className="text-2xl font-serif font-light text-white mb-6">Colaboraciones</h2>

        {COLLABORATIONS.map(item => (
          <div
            key={item.id}
            className="bg-neutral-900/20 border border-neutral-800/50 rounded-lg p-6 mb-4 cursor-pointer hover:bg-neutral-900/40 hover:border-neutral-700 transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <span className="text-[10px] uppercase tracking-widest text-neutral-500 border border-neutral-700 px-2 py-1 rounded">
                {item.context}
              </span>
              <span className="text-neutral-600 text-xs">{item.time}</span>
            </div>

            <h3 className="text-xl md:text-2xl text-white font-serif font-light mb-2 group-hover:text-white/90">
              {item.title}
            </h3>

            <p className="text-neutral-500 text-sm mb-4">
              Por <span className="text-amber-200/80">{item.author}</span>
            </p>

            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {item.tags.map(tag => (
                  <span key={tag} className="text-[10px] text-neutral-500 bg-neutral-800/50 px-2 py-1 rounded">
                    {tag}
                  </span>
                ))}
              </div>
              <ArrowRight size={16} className="text-neutral-600 group-hover:text-white transition-colors" />
            </div>
          </div>
        ))}
      </section>

      {/* Encuentros */}
      <section>
        <h2 className="text-2xl font-serif font-light text-white mb-6">Encuentros</h2>

        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
          {EVENTS_DATA.map(event => (
            <div
              key={event.id}
              className="flex-shrink-0 w-[220px] bg-neutral-900/30 border border-neutral-800/50 rounded-lg p-5 cursor-pointer hover:bg-neutral-900/50 hover:border-neutral-700 transition-all group"
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="text-3xl font-serif text-white font-light">{event.day}</span>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mt-1">{event.month}</span>
                </div>
                <div className="w-8 h-8 rounded-full border border-neutral-700 flex items-center justify-center group-hover:bg-white group-hover:border-white transition-all">
                  <ArrowRight size={14} className="text-neutral-500 group-hover:text-black transition-colors" />
                </div>
              </div>

              <h4 className="text-white font-light text-sm mb-3 line-clamp-2 group-hover:text-white/90">{event.title}</h4>

              <div className="flex items-center gap-1 text-neutral-500 text-xs mb-1">
                <span>📍 {event.location}</span>
              </div>
              <div className="flex items-center gap-1 text-neutral-500 text-xs">
                <User size={10} />
                <span>{event.attendees}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

// Library page - Colecciones
const LibraryPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  // Datos de carpetas
  const FOLDERS = [
    { id: 1, name: 'Para después', count: 9, icon: '📁' },
    { id: 2, name: 'Física', count: 12, icon: '📂' },
    { id: 3, name: 'Salsa', count: 7, icon: '🎵' },
    { id: 4, name: 'Ideas de proyectos', count: 4, icon: '💡' },
    { id: 5, name: 'Lecturas largas', count: 14, icon: '📚' }
  ];

  // Datos de recientes
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

  return (
    <div className="page-library pb-32">
      {/* Header */}
      <header className="mb-10 pt-6 md:pt-10 text-center">
        <h1 className="text-4xl md:text-5xl font-serif font-light text-white mb-4 tracking-tight">
          Colecciones
        </h1>
        <p className="text-neutral-500 font-light text-sm">
          Tu archivo personal de lecturas, recursos, música y más.
        </p>
      </header>

      {/* Barra de búsqueda */}
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
      <button className="w-full mb-8 flex items-center justify-between bg-neutral-900/30 border border-neutral-800 rounded-lg px-5 py-4 hover:bg-neutral-900/50 transition-colors group">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400">
            <span className="text-lg">+</span>
          </div>
          <span className="text-neutral-300 font-light">+ Nueva carpeta</span>
        </div>
        <ArrowRight size={16} className="text-neutral-600 group-hover:text-neutral-400 transition-colors" />
      </button>

      {/* CARPETAS */}
      <section className="mb-10">
        <h2 className="text-[10px] font-medium tracking-[0.2em] text-neutral-500 uppercase mb-4">CARPETAS</h2>

        <div className="grid grid-cols-2 gap-3">
          {FOLDERS.map(folder => (
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
      </section>

      {/* RECIENTES */}
      <section>
        <h2 className="text-[10px] font-medium tracking-[0.2em] text-neutral-500 uppercase mb-4">RECIENTES</h2>

        <div className="space-y-2">
          {RECENTS.map(item => (
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
      </section>
    </div>
  );
};

// Events page
const EventsPage = () => (
  <div className="page-events pt-10">
    <header className="mb-12 border-b border-neutral-900 pb-8">
      <h2 className="text-3xl font-serif font-light text-white mb-2">Encuentros</h2>
      <p className="text-neutral-500 font-light">La red digital es solo el preludio.</p>
    </header>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 stagger-children">
      {EVENTS.map(ev => <EventCard key={ev.id} event={ev} />)}
    </div>
  </div>
);

// Profile page (placeholder)
// Notifications page with clickable names
const NotificationsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="page-profile pt-10 max-w-2xl mx-auto">
      <h1 className="text-3xl font-serif font-light text-white mb-8">Notificaciones</h1>
      <div className="space-y-4">
        <div className="p-4 border border-neutral-800 hover:bg-neutral-900/30 transition-colors">
          <p className="text-neutral-400">
            <span
              onClick={() => navigate('/user/dr-elena-r')}
              className="text-white cursor-pointer hover:underline"
            >Dr. Elena R.</span> comentó en tu publicación
          </p>
          <span className="text-neutral-600 text-xs">Hace 2 horas</span>
        </div>
        <div className="p-4 border border-neutral-800 hover:bg-neutral-900/30 transition-colors">
          <p className="text-neutral-400">
            <span
              onClick={() => navigate('/user/marco-v')}
              className="text-white cursor-pointer hover:underline"
            >Marco V.</span> te mencionó en un debate
          </p>
          <span className="text-neutral-600 text-xs">Hace 5 horas</span>
        </div>
        <div className="p-4 border border-neutral-800 hover:bg-neutral-900/30 transition-colors">
          <p className="text-neutral-400">Tu ensayo recibió <span className="text-white">15 nuevas reacciones</span></p>
          <span className="text-neutral-600 text-xs">Ayer</span>
        </div>
      </div>
    </div>
  );
};

// Messages page with clickable names
const MessagesPage = () => {
  const navigate = useNavigate();

  return (
    <div className="page-profile pt-10 max-w-2xl mx-auto">
      <h1 className="text-3xl font-serif font-light text-white mb-8">Mensajes</h1>
      <div className="space-y-2">
        <div className="flex items-center gap-4 p-4 border border-neutral-800 hover:bg-neutral-900/30 transition-colors cursor-pointer">
          <div
            onClick={() => navigate('/user/marco-v')}
            className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:ring-2 hover:ring-neutral-600 transition-all"
          >M</div>
          <div className="flex-1">
            <p
              onClick={() => navigate('/user/marco-v')}
              className="text-white cursor-pointer hover:underline inline"
            >Marco V.</p>
            <p className="text-neutral-500 text-sm truncate">¿Viste el nuevo paper sobre jazz modal?</p>
          </div>
          <span className="text-neutral-600 text-xs">2h</span>
        </div>
        <div className="flex items-center gap-4 p-4 border border-neutral-800 hover:bg-neutral-900/30 transition-colors cursor-pointer">
          <div
            onClick={() => navigate('/user/dr-elena-r')}
            className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:ring-2 hover:ring-neutral-600 transition-all"
          >E</div>
          <div className="flex-1">
            <p
              onClick={() => navigate('/user/dr-elena-r')}
              className="text-white cursor-pointer hover:underline inline"
            >Dr. Elena R.</p>
            <p className="text-neutral-500 text-sm truncate">Sobre la colaboración del paper...</p>
          </div>
          <span className="text-neutral-600 text-xs">1d</span>
        </div>
      </div>
    </div>
  );
};

// My Profile page
const ProfilePage = () => (
  <div className="page-profile pt-10 max-w-4xl mx-auto">
    <header className="flex items-start justify-between mb-12 pb-8 border-b border-neutral-900">
      <div className="flex items-center gap-6">
        <div className="w-24 h-24 rounded-full bg-neutral-800 flex items-center justify-center text-3xl font-serif text-neutral-400">V</div>
        <div>
          <h1 className="text-4xl font-serif font-light text-white mb-2">Vicenzo S.</h1>
          <p className="text-neutral-400 mb-1">Desarrollador & Curioso</p>
          <p className="text-neutral-600 text-sm">Lima, Perú</p>
        </div>
      </div>
      <button className="px-5 py-2.5 border border-neutral-700 text-white hover:bg-neutral-900 transition-colors text-sm">
        Editar Perfil
      </button>
    </header>
    <div className="py-16 text-center border border-dashed border-neutral-800 rounded-lg">
      <Feather size={32} strokeWidth={0.5} className="mx-auto mb-4 text-neutral-600" />
      <p className="text-neutral-500 font-light italic">Personaliza tu perfil para comenzar</p>
    </div>
  </div>
);

// Main App Layout
const AppLayout = () => {
  const navigate = useNavigate();
  const location = window.location.pathname;

  const getActiveTab = () => {
    if (location.startsWith('/category')) return 'discover';
    if (location === '/discover' || location === '/') return 'discover';
    if (location === '/feed') return 'feed';
    if (location === '/projects') return 'projects';
    if (location === '/library') return 'library';
    if (location === '/profile') return 'profile';
    if (location === '/notifications') return 'profile';
    if (location === '/messages') return 'feed';
    if (location.startsWith('/user/')) return 'profile';
    return 'discover';
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200 font-sans selection:bg-white/20 selection:text-white overflow-x-hidden">
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none z-0 mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />

      <div className="flex h-screen relative z-10">
        <Sidebar activeTab={getActiveTab()} onNavigate={navigate} />
        <MobileNav activeTab={getActiveTab()} onNavigate={navigate} />
        <Header />

        <main className="flex-1 md:ml-20 pt-[calc(4rem+env(safe-area-inset-top))] md:pt-16 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6 px-4 md:px-16 overflow-y-auto scrollbar-hide">
          <div className="max-w-5xl mx-auto">
            <Routes>
              <Route path="/" element={<DiscoverPage />} />
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/category/:categoryId" element={<CategoryPage />} />
              <Route path="/feed" element={<FeedPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/library" element={<LibraryPage />} />

              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/user/:userId" element={<UserProfilePage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="*" element={<DiscoverPage />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
};

// App with Router and Authentication
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
