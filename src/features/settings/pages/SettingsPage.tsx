import { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  FileText,
  HelpCircle,
  LogOut,
  Monitor,
  Moon,
  Scale,
  Shield,
  ShieldAlert,
  Sparkles,
  Sun,
  Trash2,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import SupportModal from '@/features/help/components/SupportModal';
import { isCurrentUserAppAdmin } from '@/features/moderation/api';
import { getServerAIConsent, updateServerAIConsent } from '@/features/settings/api/aiConsent';
import DeleteAccountModal from '@/features/settings/components/DeleteAccountModal';
import {
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
  SettingsSwitch,
} from '@/features/settings/components/SettingsList';
import { LEGAL_COPY } from '@/shared/constants';
import { getAIConsent, setAIConsent } from '@/shared/lib/aiConsent';
import {
  applyTheme,
  getStoredTheme,
  LIGHT_THEME_AVAILABLE,
  setStoredTheme,
  type ThemeMode,
} from '@/shared/lib/theme';
import { useToast } from '@/shared/ui/Toast';

const SettingsPage = () => {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { showToast } = useToast();
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [aiConsentGranted, setAiConsentGranted] = useState(() => getAIConsent(user?.uid).granted);
  const [aiConsentSyncLoading, setAiConsentSyncLoading] = useState(false);
  const [isModerationAdmin, setIsModerationAdmin] = useState(false);

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
    const uid = user?.uid ?? null;
    if (!uid) {
      setAiConsentGranted(false);
      setAiConsentSyncLoading(false);
      return () => {
        active = false;
      };
    }

    const localConsent = getAIConsent(uid);
    setAiConsentGranted(localConsent.granted);

    const syncAiConsent = async () => {
      setAiConsentSyncLoading(true);
      try {
        const serverConsent = await getServerAIConsent(uid);
        if (!active) return;

        if (serverConsent.recorded) {
          setAIConsent(serverConsent.granted, uid);
          setAiConsentGranted(serverConsent.granted);
          return;
        }

        if (localConsent.granted) {
          await updateServerAIConsent(uid, true, 'migration');
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
    if (aiConsentSyncLoading) return;
    const uid = user?.uid ?? null;
    const next = !aiConsentGranted;
    setAiConsentSyncLoading(true);
    setAiConsentGranted(next);

    try {
      if (uid) {
        await updateServerAIConsent(uid, next, 'settings');
        setAIConsent(next, uid);
      } else {
        setAIConsent(next);
      }

      showToast(
        next ? 'Consentimiento de IA actualizado.' : 'Consentimiento de IA revocado.',
        'success',
      );
    } catch (error) {
      console.error('Error updating AI consent:', error);
      setAiConsentGranted(!next);
      showToast('No se pudo guardar el consentimiento de IA.', 'error');
    } finally {
      setAiConsentSyncLoading(false);
    }
  };

  const name = user?.displayName?.trim() || 'Tu cuenta';

  return (
    <>
      <div className="fade-in mx-auto max-w-2xl pb-24">
        <SettingsHeader title="Configuración" onBack={() => navigate(-1)} />

        <div className="space-y-7">
          {user && (
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="flex w-full items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-left transition-colors hover:bg-white/[0.04]"
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-800 font-display text-2xl text-neutral-300">
                  {name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-semibold text-white">{name}</span>
                {user.email && (
                  <span className="block truncate text-sm text-neutral-500">{user.email}</span>
                )}
              </span>
              <span className="text-sm text-neutral-400">Ver perfil</span>
            </button>
          )}

          {/* Appearance: hidden while only the dark theme works (see LIGHT_THEME_AVAILABLE). */}
          {LIGHT_THEME_AVAILABLE && (
            <SettingsGroup title="Apariencia">
              <div role="radiogroup" aria-label="Apariencia">
                {(
                  [
                    { value: 'dark', label: 'Modo oscuro', icon: Moon },
                    { value: 'light', label: 'Modo claro', icon: Sun },
                    { value: 'system', label: 'Sistema', icon: Monitor },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={theme === option.value}
                    onClick={() => handleThemeChange(option.value)}
                    className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <option.icon size={19} className="text-neutral-400" />
                    <span className="flex-1 text-[15px] text-white">{option.label}</span>
                    {theme === option.value && <Check size={17} className="text-brand-gold" />}
                  </button>
                ))}
              </div>
            </SettingsGroup>
          )}

          <SettingsGroup title="Preferencias">
            <SettingsRow
              icon={Bell}
              label="Notificaciones"
              detail="Alertas y correos"
              onClick={() => navigate('/settings/notifications')}
            />
            <SettingsRow
              icon={Shield}
              label="Privacidad y seguridad"
              detail="Cuenta privada, bloqueados, contraseña y sesiones"
              onClick={() => navigate('/settings/privacy')}
            />
          </SettingsGroup>

          <SettingsGroup title="Inteligencia artificial" footer={LEGAL_COPY.aiDisclosure}>
            <SettingsSwitch
              icon={Sparkles}
              label="Enviar mis mensajes a la IA"
              detail="Necesario para usar Chat con IA y Arena IA"
              checked={aiConsentGranted}
              busy={aiConsentSyncLoading}
              onChange={() => void handleToggleAiConsent()}
            />
          </SettingsGroup>

          <SettingsGroup title="Ayuda">
            <SettingsRow
              icon={HelpCircle}
              label="Ayuda y comentarios"
              detail="Escríbenos si algo no funciona"
              onClick={() => setIsSupportOpen(true)}
            />
          </SettingsGroup>

          {isModerationAdmin && (
            <SettingsGroup title="Moderación">
              <SettingsRow
                icon={ShieldAlert}
                label="Panel de moderación"
                detail="Revisar reportes pendientes"
                onClick={() => navigate('/moderation')}
              />
            </SettingsGroup>
          )}

          <SettingsGroup title="Legal">
            <SettingsRow
              icon={FileText}
              label="Política de privacidad"
              detail="Cómo usamos y protegemos tus datos"
              onClick={() => navigate('/legal/privacy')}
            />
            <SettingsRow
              icon={Scale}
              label="Términos de servicio"
              detail="Las condiciones para usar Vinctus"
              onClick={() => navigate('/legal/terms')}
            />
            <SettingsRow
              icon={Users}
              label="Normas de la comunidad"
              detail="Qué está permitido y cómo se modera"
              onClick={() => navigate('/legal/community-guidelines')}
            />
          </SettingsGroup>

          <SettingsGroup>
            <button
              type="button"
              onClick={async () => {
                try {
                  await signOut();
                } catch (error) {
                  console.error(error);
                  showToast('No se pudo cerrar sesión.', 'error');
                }
              }}
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left text-[15px] text-white transition-colors hover:bg-white/[0.03]"
            >
              <LogOut size={19} className="text-neutral-400" />
              <span>Cerrar sesión</span>
            </button>
            <SettingsRow
              icon={Trash2}
              label="Eliminar cuenta"
              detail="Acción permanente e irreversible"
              tone="danger"
              onClick={() => setIsDeleteOpen(true)}
            />
          </SettingsGroup>
        </div>
      </div>
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
      <DeleteAccountModal
        key={user?.uid ?? 'anon'}
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
      />
    </>
  );
};

export default SettingsPage;
