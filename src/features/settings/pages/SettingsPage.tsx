import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Moon,
  Sun,
  Monitor,
  Bell,
  Shield,
  HelpCircle,
  ChevronRight,
  LogOut,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import SupportModal from '@/features/help/components/SupportModal';
import { applyTheme, getStoredTheme, setStoredTheme, type ThemeMode } from '@/shared/lib/theme';

const SettingsPage = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  useEffect(() => {
    applyTheme(theme);
    setStoredTheme(theme);
  }, [theme]);

  const handleThemeChange = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
  };

  return (
    <>
      <div className="max-w-2xl mx-auto pb-20 fade-in">
        <header className="flex items-center gap-4 mb-8 sticky top-0 bg-bg/80 backdrop-blur-md py-4 z-10">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white/5 rounded-full transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-2xl font-semibold">Configuración</h1>
        </header>

        <div className="space-y-8">
          {/* Appearance */}
          <section>
            <h2 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider px-2">
              Apariencia
            </h2>
            <div
              className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden"
              role="radiogroup"
              aria-label="Apariencia"
            >
              <button
                onClick={() => handleThemeChange('dark')}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-neutral-800 last:border-0"
                role="radio"
                aria-checked={theme === 'dark'}
              >
                <div className="flex items-center gap-3">
                  <Moon size={20} className="text-purple-400" />
                  <span>Modo oscuro</span>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border ${
                    theme === 'dark' ? 'border-purple-400 bg-purple-500' : 'border-neutral-600'
                  }`}
                />
              </button>
              <button
                onClick={() => handleThemeChange('light')}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-neutral-800 last:border-0"
                role="radio"
                aria-checked={theme === 'light'}
              >
                <div className="flex items-center gap-3">
                  <Sun size={20} className="text-orange-400" />
                  <span>Modo claro</span>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border ${
                    theme === 'light' ? 'border-purple-400 bg-purple-500' : 'border-neutral-600'
                  }`}
                />
              </button>
              <button
                onClick={() => handleThemeChange('system')}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                role="radio"
                aria-checked={theme === 'system'}
              >
                <div className="flex items-center gap-3">
                  <Monitor size={20} className="text-blue-400" />
                  <span>Sistema</span>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border ${
                    theme === 'system' ? 'border-purple-400 bg-purple-500' : 'border-neutral-600'
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Preferences */}
          <section>
            <h2 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider px-2">
              Preferencias
            </h2>
            <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden">
              <button
                onClick={() => navigate('/settings/notifications')}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-neutral-800"
              >
                <div className="flex items-center gap-3">
                  <Bell size={20} className="text-yellow-400" />
                  <div className="text-left">
                    <div className="font-medium">Notificaciones</div>
                    <div className="text-xs text-neutral-500">Gestionar alertas push y correos</div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-neutral-600" />
              </button>
              <button
                onClick={() => navigate('/settings/privacy')}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Shield size={20} className="text-green-400" />
                  <div className="text-left">
                    <div className="font-medium">Privacidad y Seguridad</div>
                    <div className="text-xs text-neutral-500">Contraseña, sesiones activas</div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-neutral-600" />
              </button>
            </div>
          </section>

          {/* Support */}
          <section>
            <h2 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider px-2">
              Soporte
            </h2>
            <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden">
              <button
                onClick={() => setIsSupportOpen(true)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <HelpCircle size={20} className="text-cyan-400" />
                  <span>Ayuda y comentarios</span>
                </div>
                <ChevronRight size={18} className="text-neutral-600" />
              </button>
              <div className="p-4 text-center">
                <p className="text-xs text-neutral-600 font-mono">Vinctus v0.0.2 (Alpha)</p>
              </div>
            </div>
          </section>

          {/* Sign Out */}
          <button
            onClick={async () => {
              try {
                await signOut();
              } catch (error) {
                console.error(error);
              }
            }}
            className="w-full flex items-center justify-between p-4 bg-red-500/5 border border-red-500/20 rounded-2xl hover:bg-red-500/10 transition-colors text-red-400 group"
          >
            <div className="flex items-center gap-3">
              <LogOut size={20} className="group-hover:scale-110 transition-transform" />
              <span className="font-medium">Cerrar sesión</span>
            </div>
          </button>
        </div>
      </div>
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
    </>
  );
};

export default SettingsPage;
