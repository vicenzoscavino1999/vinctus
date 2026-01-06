import { useState, useMemo } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Search,
  Compass,
  Hash,
  User,
  ChevronLeft,
  Feather,
  BookOpen,
  Calendar,
  Briefcase,
  ArrowRight,
  Filter,
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
  UserProfilePage
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
  <div className="w-14 h-14 flex items-center justify-center mb-16 opacity-90 hover:opacity-100 transition-opacity cursor-pointer">
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
      <SidebarItem icon={Briefcase} active={activeTab === 'projects'} onClick={() => onNavigate('/projects')} tooltip="Colaboraciones" />
      <SidebarItem icon={BookOpen} active={activeTab === 'library'} onClick={() => onNavigate('/library')} tooltip="Archivo Global" />
      <SidebarItem icon={Calendar} active={activeTab === 'events'} onClick={() => onNavigate('/events')} tooltip="Eventos" />
    </nav>
    <div className="mt-auto mb-4">
      <SidebarItem icon={User} active={activeTab === 'profile'} onClick={() => onNavigate('/profile')} tooltip="Perfil" />
    </div>
  </aside>
);

// Mobile navigation
const MobileNav = ({ activeTab, onNavigate }) => (
  <div className="md:hidden fixed bottom-0 w-full bg-[#0a0a0a]/95 backdrop-blur-md border-t border-neutral-900 flex justify-around px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-50">
    <button onClick={() => onNavigate('/discover')} className={`p-2.5 ${activeTab === 'discover' ? 'text-white' : 'text-neutral-600'}`}><Compass size={24} strokeWidth={1} /></button>
    <button onClick={() => onNavigate('/feed')} className={`p-2.5 ${activeTab === 'feed' ? 'text-white' : 'text-neutral-600'}`}><Hash size={24} strokeWidth={1} /></button>
    <button onClick={() => onNavigate('/projects')} className={`p-2.5 ${activeTab === 'projects' ? 'text-white' : 'text-neutral-600'}`}><Briefcase size={24} strokeWidth={1} /></button>
    <button onClick={() => onNavigate('/library')} className={`p-2.5 ${activeTab === 'library' ? 'text-white' : 'text-neutral-600'}`}><BookOpen size={24} strokeWidth={1} /></button>
    <button onClick={() => onNavigate('/profile')} className={`p-2.5 ${activeTab === 'profile' ? 'text-white' : 'text-neutral-600'}`}><User size={24} strokeWidth={1} /></button>
  </div>
);

// Discover page with search
const DiscoverPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';

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

  return (
    <div className="page-discover">
      <header className="mb-20 pt-10 flex flex-col items-center text-center">
        <span className="text-xs font-medium tracking-[0.2em] text-neutral-500 uppercase mb-4">Descubrimiento</span>
        <h1 className="text-4xl md:text-6xl font-serif font-thin text-white mb-6 tracking-tight">
          Curaduría de <span className="text-neutral-500 italic">Intereses</span>
        </h1>
        <div className="relative mt-8 w-full max-w-md group">
          <input
            type="text"
            placeholder="Buscar categorías..."
            value={searchQuery}
            onChange={handleSearch}
            className="w-full bg-transparent border-b border-neutral-800 text-white text-center py-4 focus:outline-none focus:border-neutral-500 transition-colors placeholder:text-neutral-700 font-light"
          />
          <Search className="absolute right-0 top-1/2 -translate-y-1/2 text-neutral-700 group-hover:text-neutral-500 transition-colors" size={16} />
        </div>
      </header>
      {filteredCategories.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20 stagger-children">
          {filteredCategories.map(cat => (
            <CategoryCard key={cat.id} category={cat} onClick={() => navigate(`/category/${cat.id}`)} />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <p className="text-neutral-500 font-light italic">No se encontraron categorías para "{searchQuery}"</p>
        </div>
      )}
    </div>
  );
};

// Category detail page with API integration
const CategoryPage = () => {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('live');
  const [selectedSubgroup, setSelectedSubgroup] = useState(null);

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

// Feed page with search
const FeedPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';

  const filteredPosts = useMemo(() => {
    if (!searchQuery) return FEED_POSTS;
    const query = searchQuery.toLowerCase();
    return FEED_POSTS.filter(post =>
      post.title.toLowerCase().includes(query) ||
      post.content.toLowerCase().includes(query) ||
      post.author.toLowerCase().includes(query) ||
      post.group.toLowerCase().includes(query)
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

  return (
    <div className="page-feed max-w-3xl mx-auto pt-10">
      <header className="mb-16 text-center">
        <span className="text-xs font-medium tracking-[0.2em] text-neutral-500 uppercase">En Conversación</span>
        <h2 className="text-3xl md:text-4xl font-serif font-light text-white mt-4">Diálogos Recientes</h2>
        <div className="relative mt-8 w-full max-w-md mx-auto group">
          <input
            type="text"
            placeholder="Buscar publicaciones..."
            value={searchQuery}
            onChange={handleSearch}
            className="w-full bg-transparent border-b border-neutral-800 text-white text-center py-4 focus:outline-none focus:border-neutral-500 transition-colors placeholder:text-neutral-700 font-light"
          />
          <Search className="absolute right-0 top-1/2 -translate-y-1/2 text-neutral-700 group-hover:text-neutral-500 transition-colors" size={16} />
        </div>
      </header>
      {filteredPosts.length > 0 ? (
        filteredPosts.map(post => <PostCard key={post.id} post={post} />)
      ) : (
        <div className="py-20 text-center">
          <p className="text-neutral-500 font-light italic">No se encontraron publicaciones para "{searchQuery}"</p>
        </div>
      )}
    </div>
  );
};

// Projects page
const ProjectsPage = () => (
  <div className="page-projects pt-10">
    <header className="mb-12 border-b border-neutral-900 pb-8 flex flex-col md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-3xl font-serif font-light text-white mb-2">Colaboraciones</h2>
        <p className="text-neutral-500 font-light">Conecta habilidades. Construye realidades.</p>
      </div>
      <button className="mt-4 md:mt-0 text-xs bg-white text-black px-6 py-3 rounded-sm hover:bg-neutral-200 transition-colors uppercase tracking-widest font-medium">
        + Publicar Proyecto
      </button>
    </header>
    <div className="grid grid-cols-1 gap-6 max-w-4xl mx-auto stagger-children">
      {COLLABORATIONS.map(item => <CollaborationCard key={item.id} item={item} />)}
    </div>
  </div>
);

// Library page
const LibraryPage = () => (
  <div className="page-library max-w-4xl mx-auto pt-10">
    <header className="mb-16 text-center">
      <span className="text-xs font-medium tracking-[0.2em] text-neutral-500 uppercase">Archivo Central</span>
      <h2 className="text-3xl md:text-4xl font-serif font-light text-white mt-4">Explora el Conocimiento</h2>
      <p className="text-neutral-500 mt-4 max-w-lg mx-auto font-light text-sm">Destacados de todas las disciplinas y tus lecturas guardadas.</p>
      <div className="flex justify-center mt-8 space-x-4">
        <button className="text-xs bg-neutral-800 text-white px-4 py-2 rounded-full flex items-center"><Filter size={12} className="mr-2" /> Filtrar por tema</button>
      </div>
    </header>
    <div className="space-y-2">
      {GLOBAL_LIBRARY_HIGHLIGHTS.map(item => <LibraryItem key={item.id} item={item} />)}
    </div>
  </div>
);

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
    if (location === '/events') return 'events';
    if (location === '/profile') return 'profile';
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
              <Route path="/events" element={<EventsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/user/:userId" element={<UserProfilePage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/messages" element={<MessagesPage />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
};

// App with Router
export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
