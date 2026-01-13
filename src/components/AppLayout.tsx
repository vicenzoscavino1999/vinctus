import { lazy, Suspense, useState, useRef, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Compass, Hash, User, Briefcase, MoreHorizontal, Settings, LogOut, Search, Plus } from 'lucide-react';

import Header from './Header';
import SidebarItem from './SidebarItem';
import PageLoader from './PageLoader';
import CreatePostModal from './CreatePostModal';
import { useAuth } from '../context/AuthContext';

// Lazy loaded components
const GroupDetailPage = lazy(() => import('./GroupDetailPage'));
const PostDetailPage = lazy(() => import('./PostDetailPage'));
const UserProfilePage = lazy(() => import('./UserProfilePage'));

// Lazy loaded pages
const DiscoverPage = lazy(() => import('../pages/DiscoverPage'));
const UserSearchPage = lazy(() => import('../pages/UserSearchPage'));
const CategoryPage = lazy(() => import('../pages/CategoryPage'));
const FeedPage = lazy(() => import('../pages/FeedPage'));
const ProjectsPage = lazy(() => import('../pages/ProjectsPage'));
const LibraryPage = lazy(() => import('../pages/LibraryPage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage'));
const NotificationsPage = lazy(() => import('../pages/NotificationsPage'));
const MessagesPage = lazy(() => import('../pages/MessagesPage'));

// Settings page (lazy loaded)
const SettingsPage = lazy(() => import('../pages/SettingsPage'));

type NavProps = {
  activeTab: string;
  onNavigate: (path: string) => void;
};

// Create Post button component
const CreatePostButton = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-14 h-14 flex items-center justify-center mb-16 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-all duration-300 hover:scale-105"
    aria-label="Crear publicación"
    title="Crear publicación"
  >
    <Plus size={28} strokeWidth={2} />
  </button>
);

// More Menu Component
const MoreMenu = ({ onNavigate }: { onNavigate: (path: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { signOut } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      // Auth state change will handle redirect, but we can force it too if needed
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-3 rounded-xl transition-all duration-200 group flex items-center justify-center
          ${isOpen ? 'bg-white/10 text-white' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}
        aria-label="Más opciones"
        title="Más opciones"
      >
        <MoreHorizontal size={24} strokeWidth={1.5} className="group-hover:scale-105 transition-transform duration-200" />
      </button>

      {isOpen && (
        <div className="absolute left-full ml-4 bottom-0 w-48 bg-[#1A1A1A] border border-neutral-800 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-50">
          <div className="py-1">
            <button
              onClick={() => {
                onNavigate('/settings');
                setIsOpen(false);
              }}
              className="w-full text-left px-4 py-3 text-sm text-neutral-300 hover:bg-white/5 hover:text-white flex items-center gap-3 transition-colors"
            >
              <Settings size={18} />
              Configuración
            </button>
            <div className="h-px bg-neutral-800 my-1" />
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-3 transition-colors"
            >
              <LogOut size={18} />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Sidebar component
const Sidebar = ({ activeTab, onNavigate, onCreatePost }: NavProps & { onCreatePost: () => void }) => (
  <aside className="hidden md:flex w-20 flex-col items-center py-12 fixed h-full z-20 border-r border-neutral-900/50 bg-bg">
    <CreatePostButton onClick={onCreatePost} />
    <nav className="flex flex-col space-y-4">
      <SidebarItem icon={Compass} active={activeTab === 'discover'} onClick={() => onNavigate('/discover')} tooltip="Descubrir" />
      <SidebarItem icon={Search} active={activeTab === 'search'} onClick={() => onNavigate('/search')} tooltip="Buscar" />
      <SidebarItem icon={Hash} active={activeTab === 'feed'} onClick={() => onNavigate('/feed')} tooltip="Conversación" />
      <SidebarItem icon={Briefcase} active={activeTab === 'projects'} onClick={() => onNavigate('/projects')} tooltip="Conexiones" />
    </nav>
    <div className="mt-auto mb-4 flex flex-col items-center gap-4">
      <SidebarItem icon={User} active={activeTab === 'profile'} onClick={() => onNavigate('/profile')} tooltip="Perfil" />
      <MoreMenu onNavigate={onNavigate} />
    </div>
  </aside>
);

// Mobile navigation
const MobileNav = ({ activeTab, onNavigate }: NavProps) => {
  // For mobile we might want a different implementation of MoreMenu (e.g. drawer)
  // For now, let's keep it simple or maybe just add the profile link as the last item
  // and put settings inside the profile page or a dedicated settings tab if requested.
  // The user specifically asked for "a button in the functions part", implying the sidebar.
  // Let's add it to mobile too as a drawer trigger or similar if needed, but for now standard nav.

  // Changing the request to fit mobile: usually "More" is the last item.
  return (
    <div className="md:hidden fixed bottom-0 w-full bg-bg/95 backdrop-blur-md border-t border-neutral-900 flex justify-around px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-50">
      <button onClick={() => onNavigate('/discover')} aria-label="Descubrir" className={`p-2.5 ${activeTab === 'discover' ? 'text-white' : 'text-neutral-600'}`}><Compass size={24} strokeWidth={1} /></button>
      <button onClick={() => onNavigate('/search')} aria-label="Buscar" className={`p-2.5 ${activeTab === 'search' ? 'text-white' : 'text-neutral-600'}`}><Search size={24} strokeWidth={1} /></button>
      <button onClick={() => onNavigate('/feed')} aria-label="Diálogos" className={`p-2.5 ${activeTab === 'feed' ? 'text-white' : 'text-neutral-600'}`}><Hash size={24} strokeWidth={1} /></button>
      <button onClick={() => onNavigate('/projects')} aria-label="Conexiones" className={`p-2.5 ${activeTab === 'projects' ? 'text-white' : 'text-neutral-600'}`}><Briefcase size={24} strokeWidth={1} /></button>
      <button onClick={() => onNavigate('/profile')} aria-label="Perfil" className={`p-2.5 ${activeTab === 'profile' ? 'text-white' : 'text-neutral-600'}`}><User size={24} strokeWidth={1} /></button>
    </div>
  );
};

// Main App Layout
const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);

  const getActiveTab = () => {
    if (pathname.startsWith('/category')) return 'discover';
    if (pathname === '/discover' || pathname === '/') return 'discover';
    if (pathname === '/search') return 'search';
    if (pathname === '/feed') return 'feed';
    if (pathname === '/projects') return 'projects';
    if (pathname === '/library') return 'library';
    if (pathname === '/profile') return 'profile';
    if (pathname === '/notifications') return 'profile';
    if (pathname === '/messages') return 'feed';
    if (pathname.startsWith('/user/')) return 'profile';
    if (pathname.startsWith('/group/')) return 'discover';
    if (pathname.startsWith('/post/')) return 'discover';
    return 'discover';
  };

  const handleCreatePost = () => {
    setIsCreatePostOpen(true);
  };

  return (
    <div className="min-h-screen bg-bg text-neutral-200 font-sans selection:bg-white/20 selection:text-white overflow-x-hidden">
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none z-0 mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />

      <div className="flex h-screen relative z-10">
        <Sidebar activeTab={getActiveTab()} onNavigate={navigate} onCreatePost={handleCreatePost} />
        <MobileNav activeTab={getActiveTab()} onNavigate={navigate} />
        <Header onCreatePost={handleCreatePost} />

        <main className="flex-1 md:ml-20 pt-[calc(4rem+env(safe-area-inset-top))] md:pt-16 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6 px-4 md:px-16 overflow-y-auto scrollbar-hide">
          <div className="max-w-5xl mx-auto">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<DiscoverPage />} />
                <Route path="/discover" element={<DiscoverPage />} />
                <Route path="/search" element={<UserSearchPage />} />
                <Route path="/category/:categoryId" element={<CategoryPage />} />
                <Route path="/feed" element={<FeedPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/user/:userId" element={<UserProfilePage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/messages" element={<MessagesPage />} />
                <Route path="/group/:groupId" element={<GroupDetailPage />} />
                <Route path="/post/:postId" element={<PostDetailPage />} />
                <Route path="*" element={<DiscoverPage />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>

      {/* Create Post Modal */}
      <CreatePostModal
        isOpen={isCreatePostOpen}
        onClose={() => setIsCreatePostOpen(false)}
      />
    </div>
  );
};

export default AppLayout;
