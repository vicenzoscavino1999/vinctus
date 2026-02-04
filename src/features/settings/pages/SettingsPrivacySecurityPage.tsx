import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Lock, MessageSquare, Eye, EyeOff, Users, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/shared/ui/Toast';
import { functions } from '@/shared/lib/firebase';
import {
  DEFAULT_PRIVACY_SETTINGS,
  getUserSettings,
  updatePrivacySettings,
  type PrivacySettings,
} from '@/features/settings/api';

type ToggleRowProps = {
  label: string;
  description: string;
  icon: ReactNode;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
};

const ToggleRow = ({ label, description, icon, checked, onChange, disabled }: ToggleRowProps) => (
  <button
    type="button"
    onClick={onChange}
    disabled={disabled}
    role="switch"
    aria-checked={checked}
    className={`w-full flex items-center justify-between p-4 transition-colors border-b border-neutral-800 last:border-0 ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/5'
    }`}
  >
    <div className="flex items-center gap-3 text-left">
      <div className="w-10 h-10 rounded-full bg-neutral-900/60 border border-neutral-800 flex items-center justify-center text-neutral-300">
        {icon}
      </div>
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-neutral-500">{description}</div>
      </div>
    </div>
    <div
      className={`w-11 h-6 rounded-full border transition-colors ${checked ? 'bg-amber-500/80 border-amber-400' : 'bg-neutral-800 border-neutral-700'}`}
    >
      <div
        className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </div>
  </button>
);

type ActionRowProps = {
  label: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

const ActionRow = ({ label, description, icon, onClick, disabled }: ActionRowProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`w-full flex items-center justify-between p-4 transition-colors border-b border-neutral-800 last:border-0 ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/5'
    }`}
  >
    <div className="flex items-center gap-3 text-left">
      <div className="w-10 h-10 rounded-full bg-neutral-900/60 border border-neutral-800 flex items-center justify-center text-neutral-300">
        {icon}
      </div>
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-neutral-500">{description}</div>
      </div>
    </div>
    <span className="text-xs text-neutral-500">&gt;</span>
  </button>
);

const SettingsPrivacySecurityPage = () => {
  const navigate = useNavigate();
  const { user, resetPassword } = useAuth();
  const { showToast } = useToast();
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadSettings = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const data = await getUserSettings(user.uid);
        if (isMounted) {
          setSettings(data.privacy);
        }
      } catch (error) {
        console.error('Error loading privacy settings:', error);
        showToast('No se pudieron cargar las preferencias.', 'error');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    void loadSettings();
    return () => {
      isMounted = false;
    };
  }, [user, showToast]);

  const handleUpdate = async (next: PrivacySettings) => {
    if (!user) return;
    const previous = settings;
    setSettings(next);
    setSaving(true);
    try {
      await updatePrivacySettings(user.uid, next);
    } catch (error) {
      console.error('Error saving privacy settings:', error);
      setSettings(previous);
      showToast('No se pudieron guardar los cambios.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) {
      showToast('Tu cuenta no tiene correo asociado.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await resetPassword(user.email);
      showToast('Enviamos un correo para cambiar tu contrasena.', 'success');
    } catch (error) {
      console.error('Error sending reset password email:', error);
      showToast('No se pudo enviar el correo.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeSessions = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const revokeSessions = httpsCallable(functions, 'revokeUserSessions');
      await revokeSessions();
      showToast('Sesiones revocadas. Puede tardar unos minutos.', 'success', 4000);
    } catch (error) {
      console.error('Error revoking sessions:', error);
      showToast('No se pudo cerrar las sesiones.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const disabled = loading || saving || !user;

  return (
    <div className="max-w-2xl mx-auto pb-20 fade-in">
      <header className="flex items-center gap-4 mb-8 sticky top-0 bg-bg/80 backdrop-blur-md py-4 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-white/5 rounded-full transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-semibold">Privacidad y seguridad</h1>
          <p className="text-xs text-neutral-500">Controla quien puede contactarte</p>
        </div>
      </header>

      {!user ? (
        <div className="text-sm text-neutral-500 text-center py-10">
          Inicia sesion para ajustar privacidad y seguridad.
        </div>
      ) : loading ? (
        <div className="text-sm text-neutral-500 text-center py-10">Cargando preferencias...</div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider px-2">
              Privacidad
            </h2>
            <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden">
              <ToggleRow
                label="Cuenta privada"
                description="Solo tus seguidores aprobados y amigos ven tus publicaciones"
                icon={<Lock size={18} className="text-amber-300" />}
                checked={settings.accountVisibility === 'private'}
                onChange={() =>
                  handleUpdate({
                    ...settings,
                    accountVisibility:
                      settings.accountVisibility === 'private' ? 'public' : 'private',
                  })
                }
                disabled={disabled}
              />
              <ToggleRow
                label="Permitir mensajes directos"
                description="Decide si otros pueden enviarte DM"
                icon={<MessageSquare size={18} className="text-emerald-400" />}
                checked={settings.allowDirectMessages}
                onChange={() =>
                  handleUpdate({ ...settings, allowDirectMessages: !settings.allowDirectMessages })
                }
                disabled={disabled}
              />
              <ToggleRow
                label="Mostrar estado en linea"
                description="Muestra cuando estas conectado"
                icon={<Eye size={18} className="text-blue-400" />}
                checked={settings.showOnlineStatus}
                onChange={() =>
                  handleUpdate({ ...settings, showOnlineStatus: !settings.showOnlineStatus })
                }
                disabled={disabled}
              />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider px-2">
              Opcional
            </h2>
            <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden">
              <ToggleRow
                label="Mostrar ultima actividad"
                description="Muestra cuando fue tu ultima conexion"
                icon={<EyeOff size={18} className="text-purple-400" />}
                checked={settings.showLastActive}
                onChange={() =>
                  handleUpdate({ ...settings, showLastActive: !settings.showLastActive })
                }
                disabled={disabled}
              />
              <ToggleRow
                label="Permitir solicitudes de amistad"
                description="Habilita nuevas solicitudes de conexion"
                icon={<Users size={18} className="text-amber-400" />}
                checked={settings.allowFriendRequests}
                onChange={() =>
                  handleUpdate({ ...settings, allowFriendRequests: !settings.allowFriendRequests })
                }
                disabled={disabled}
              />
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider px-2">
              Seguridad
            </h2>
            <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden">
              <ActionRow
                label="Cambiar contrasena"
                description="Te enviaremos un correo para resetearla"
                icon={<Lock size={18} className="text-rose-300" />}
                onClick={handlePasswordReset}
                disabled={saving || !user}
              />
              <ActionRow
                label="Cerrar sesion en otros dispositivos"
                description="Revoca sesiones activas en todos tus equipos"
                icon={<Shield size={18} className="text-orange-300" />}
                onClick={handleRevokeSessions}
                disabled={saving || !user}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default SettingsPrivacySecurityPage;
