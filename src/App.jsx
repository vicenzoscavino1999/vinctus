import { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  Compass,
  Hash,
  User,
  BookOpen,
  Briefcase,
  Loader
} from 'lucide-react';

// Import components
import {
  SidebarItem,
  Header,
  LoginScreen,
  ToastProvider
} from './components';

// Lazy loaded components
const GroupDetailPage = lazy(() => import('./components/GroupDetailPage'));
const PostDetailPage = lazy(() => import('./components/PostDetailPage'));
const UserProfilePage = lazy(() => import('./components/UserProfilePage'));
const OnboardingFlow = lazy(() => import('./components/OnboardingFlow'));

// Lazy loaded pages
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const FeedPage = lazy(() => import('./pages/FeedPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));

// Suspense fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="text-center">
      <Loader className="w-8 h-8 text-brand-gold animate-spin mx-auto mb-4" />
      <p className="text-text-2 text-sm">Cargando...</p>
    </div>
  </div>
);

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

// Main App Layout
const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  const getActiveTab = () => {
    if (pathname.startsWith('/category')) return 'discover';
    if (pathname === '/discover' || pathname === '/') return 'discover';
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

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200 font-sans selection:bg-white/20 selection:text-white overflow-x-hidden">
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none z-0 mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />

      <div className="flex h-screen relative z-10">
        <Sidebar activeTab={getActiveTab()} onNavigate={navigate} />
        <MobileNav activeTab={getActiveTab()} onNavigate={navigate} />
        <Header />

        <main className="flex-1 md:ml-20 pt-[calc(4rem+env(safe-area-inset-top))] md:pt-16 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6 px-4 md:px-16 overflow-y-auto scrollbar-hide">
          <div className="max-w-5xl mx-auto">
            <Suspense fallback={<PageLoader />}>
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
                <Route path="/group/:groupId" element={<GroupDetailPage />} />
                <Route path="/post/:postId" element={<PostDetailPage />} />
                <Route path="*" element={<DiscoverPage />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};

// App with Router and Authentication
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('vinctus_onboarding_complete');
  });

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // Show onboarding if not completed
  if (showOnboarding) {
    return (
      <Suspense fallback={<PageLoader />}>
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </Suspense>
    );
  }

  return (
    <BrowserRouter>
      <ToastProvider>
        <AppLayout />
      </ToastProvider>
    </BrowserRouter>
  );
}
