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
  Trash2,
  FileText,
  Scale,
  ShieldAlert,
  Smartphone,
  Camera,
  BellRing,
  Vibrate,
  Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import SupportModal from '@/features/help/components/SupportModal';
import { isCurrentUserAppAdmin } from '@/features/moderation/api';
import { getServerAIConsent, updateServerAIConsent } from '@/features/settings/api/aiConsent';
import DeleteAccountModal from '@/features/settings/components/DeleteAccountModal';
import {
  captureNativeCameraPhoto,
  getNativePlatform,
  isNativePlatform,
  registerNativePushNotifications,
  triggerSelectionHaptic,
} from '@/shared/lib/native';
import { LEGAL_COPY } from '@/shared/constants';
import { getAIConsent, setAIConsent } from '@/shared/lib/aiConsent';
import { applyTheme, getStoredTheme, setStoredTheme, type ThemeMode } from '@/shared/lib/theme';
import { useToast } from '@/shared/ui/Toast';

const SettingsPage = () => {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { showToast } = useToast();
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [aiConsentGranted, setAiConsentGranted] = useState(() => getAIConsent().granted);
  const [aiConsentSyncLoading, setAiConsentSyncLoading] = useState(false);
  const [isModerationAdmin, setIsModerationAdmin] = useState(false);
  const [nativeActionLoading, setNativeActionLoading] = useState<
    'camera' | 'push' | 'haptic' | null
  >(null);
  const [nativeCameraPreview, setNativeCameraPreview] = useState<string | null>(null);
  const nativePlatform = getNativePlatform();
  const nativeEnabled = isNativePlatform();

  useEffect(() => {
    applyTheme(theme);
    setStoredTheme(theme);
  }, [theme]);

  useEffect(() => {
    let active = true;

    const checkModerationAccess = async () => {
      if (!user?.uid) {
        if (!active) return;
        setIsModerationAdmin(false);
        return;
      }

      try {
        const access = await isCurrentUserAppAdmin(user.uid);
        if (!active) return;
        setIsModerationAdmin(access);
      } catch (error) {
        console.error('Error checking moderation admin access:', error);
        if (!active) return;
        setIsModerationAdmin(false);
      }
    };

    void checkModerationAccess();

    return () => {
      active = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    let active = true;
    const localConsent = getAIConsent();
    setAiConsentGranted(localConsent.granted);

    const syncAiConsent = async () => {
      if (!user?.uid) return;

      setAiConsentSyncLoading(true);
      try {
        const serverConsent = await getServerAIConsent(user.uid);
        if (!active) return;

        if (serverConsent.recorded) {
          setAIConsent(serverConsent.granted);
          setAiConsentGranted(serverConsent.granted);
          return;
        }

        if (localConsent.granted) {
          await updateServerAIConsent(user.uid, true, 'migration');
        }
      } catch (error) {
        console.error('Error syncing AI consent:', error);
      } finally {
        if (active) {
          setAiConsentSyncLoading(false);
        }
      }
    };

    void syncAiConsent();

    return () => {
      active = false;
    };
  }, [user?.uid]);

  const handleThemeChange = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
  };

  const handleToggleAiConsent = async () => {
    const next = !aiConsentGranted;
    setAiConsentSyncLoading(true);
    setAIConsent(next);
    setAiConsentGranted(next);

    try {
      if (user?.uid) {
        await updateServerAIConsent(user.uid, next, 'settings');
      }

      showToast(
        next ? 'Consentimiento de IA actualizado.' : 'Consentimiento de IA revocado.',
        'success',
      );
    } catch (error) {
      console.error('Error updating AI consent:', error);
      setAIConsent(!next);
      setAiConsentGranted(!next);
      showToast('No se pudo guardar el consentimiento de IA.', 'error');
    } finally {
      setAiConsentSyncLoading(false);
    }
  };

  const handleNativeHaptic = async () => {
    setNativeActionLoading('haptic');
    try {
      await triggerSelectionHaptic();
      showToast(
        nativeEnabled ? 'Haptics ejecutado en dispositivo.' : 'Vibracion de prueba ejecutada.',
        'success',
      );
    } catch (error) {
      console.error('Error triggering native haptic:', error);
      showToast('No se pudo ejecutar haptics.', 'error');
    } finally {
      setNativeActionLoading(null);
    }
  };

  const handleNativeCamera = async () => {
    setNativeActionLoading('camera');
    try {
      const result = await captureNativeCameraPhoto();
      if (!result.dataUrl) {
        showToast('No se obtuvo imagen desde la camara.', 'warning');
        return;
      }
      setNativeCameraPreview(result.dataUrl);
      showToast(
        result.native ? 'Foto capturada con plugin nativo.' : 'Foto capturada en modo web.',
        'success',
      );
    } catch (error) {
      console.error('Error capturing native photo:', error);
      showToast('No se pudo abrir la camara.', 'error');
    } finally {
      setNativeActionLoading(null);
    }
  };

  const handleNativePush = async () => {
    setNativeActionLoading('push');
    try {
      const result = await registerNativePushNotifications();
      if (!result.granted || !result.token) {
        showToast(result.error || 'Registro push no disponible.', 'warning');
        return;
      }
      const shortToken = `${result.token.slice(0, 14)}...`;
      showToast(`Push registrado: ${shortToken}`, 'success');
    } catch (error) {
      console.error('Error registering native push:', error);
      showToast('No se pudo registrar push notifications.', 'error');
    } finally {
      setNativeActionLoading(null);
    }
  };

  return (
    <>
      <div className="max-w-2xl mx-auto pb-20 fade-in">
        <header className="flex items-center gap-4 mb-8 sticky top-0 bg-bg/80 backdrop-blur-md py-4 z-10">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white/5 rounded-full transition-colors"
            aria-label="Volver"
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

          {/* Native capabilities */}
          <section>
            <h2 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider px-2">
              Capacidades nativas
            </h2>
            <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-800 text-xs text-neutral-500 flex items-center gap-2">
                <Smartphone size={14} className="text-neutral-400" />
                Plataforma detectada: {nativePlatform} {nativeEnabled ? '(nativo)' : '(web)'}
              </div>

              <button
                onClick={() => void handleNativeHaptic()}
                disabled={nativeActionLoading !== null}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <Vibrate size={20} className="text-emerald-300" />
                  <div className="text-left">
                    <div className="font-medium">Probar haptics</div>
                    <div className="text-xs text-neutral-500">Feedback tactil en interacciones</div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-neutral-600" />
              </button>

              <button
                onClick={() => void handleNativeCamera()}
                disabled={nativeActionLoading !== null}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <Camera size={20} className="text-sky-300" />
                  <div className="text-left">
                    <div className="font-medium">Capturar foto</div>
                    <div className="text-xs text-neutral-500">Usa plugin de camara nativa</div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-neutral-600" />
              </button>

              <button
                onClick={() => void handleNativePush()}
                disabled={nativeActionLoading !== null}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <BellRing size={20} className="text-amber-300" />
                  <div className="text-left">
                    <div className="font-medium">Registrar push</div>
                    <div className="text-xs text-neutral-500">
                      Solicita permisos y registra token del dispositivo
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-neutral-600" />
              </button>

              {nativeCameraPreview && (
                <div className="border-t border-neutral-800 p-4">
                  <p className="text-xs text-neutral-500 mb-2">Vista previa de camara</p>
                  <img
                    src={nativeCameraPreview}
                    alt="Captura de camara nativa"
                    className="w-full max-h-56 object-cover rounded-xl border border-neutral-700"
                  />
                </div>
              )}
            </div>
          </section>

          {isModerationAdmin && (
            <section>
              <h2 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider px-2">
                Trust y Safety
              </h2>
              <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden">
                <button
                  onClick={() => navigate('/moderation')}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <ShieldAlert size={20} className="text-red-300" />
                    <div className="text-left">
                      <div className="font-medium">Panel de moderacion</div>
                      <div className="text-xs text-neutral-500">
                        Revisar reportes UGC pendientes
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-neutral-600" />
                </button>
              </div>
            </section>
          )}

          {/* Legal */}
          <section>
            <h2 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider px-2">
              Legal
            </h2>
            <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden">
              <button
                onClick={() => navigate('/legal/privacy')}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-neutral-800"
              >
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-indigo-300" />
                  <div className="text-left">
                    <div className="font-medium">Politica de privacidad</div>
                    <div className="text-xs text-neutral-500">Como usamos y protegemos datos</div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-neutral-600" />
              </button>
              <button
                onClick={() => navigate('/legal/terms')}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-neutral-800"
              >
                <div className="flex items-center gap-3">
                  <Scale size={20} className="text-amber-300" />
                  <div className="text-left">
                    <div className="font-medium">Terminos de servicio</div>
                    <div className="text-xs text-neutral-500">{LEGAL_COPY.aiDisclosure}</div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-neutral-600" />
              </button>
              <button
                onClick={() => navigate('/legal/community-guidelines')}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-neutral-800"
              >
                <div className="flex items-center gap-3">
                  <ShieldAlert size={20} className="text-rose-300" />
                  <div className="text-left">
                    <div className="font-medium">Community Guidelines</div>
                    <div className="text-xs text-neutral-500">
                      Normas de comunidad, reportes y enforcement
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-neutral-600" />
              </button>
              <button
                onClick={handleToggleAiConsent}
                disabled={aiConsentSyncLoading}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="text-left">
                  <div className="font-medium">Consentimiento de IA</div>
                  <div className="text-xs text-neutral-500">{LEGAL_COPY.aiConsent}</div>
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    aiConsentGranted
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                  }`}
                >
                  {aiConsentSyncLoading ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Guardando</span>
                    </span>
                  ) : aiConsentGranted ? (
                    'Aceptado'
                  ) : (
                    'Pendiente'
                  )}
                </div>
              </button>
            </div>
          </section>

          {/* Account */}
          <section>
            <h2 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider px-2">
              Cuenta
            </h2>
            <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden">
              <button
                onClick={() => setIsDeleteOpen(true)}
                className="w-full flex items-center justify-between p-4 bg-red-500/5 hover:bg-red-500/10 transition-colors text-red-500/90 group"
              >
                <div className="flex items-center gap-3">
                  <Trash2 size={20} className="text-red-500" />
                  <div className="text-left">
                    <div className="font-medium">Eliminar cuenta</div>
                    <div className="text-xs text-red-500/60 font-medium">
                      Acción permanente e irreversible
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-red-500/40" />
              </button>
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
      <DeleteAccountModal isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} />
    </>
  );
};

export default SettingsPage;
