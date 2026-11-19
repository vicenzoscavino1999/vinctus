import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Ban,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  MessageSquare,
  Shield,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import { functions } from '@/shared/lib/firebase';
import {
  DEFAULT_PRIVACY_SETTINGS,
  getBlockedUsersProfiles,
  getUserSettings,
  unblockBlockedUser,
  updatePrivacySettings,
  type BlockedUserSummary,
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [blockedUsers, setBlockedUsers] = useState<BlockedUserSummary[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(true);
  const [blockedError, setBlockedError] = useState<string | null>(null);
  const [pendingUnblockUid, setPendingUnblockUid] = useState<string | null>(null);

  const settingsSeqRef = useRef(0);
  const blockedSeqRef = useRef(0);

  const loadSettings = useCallback(async () => {
    const seq = ++settingsSeqRef.current;
    if (!user?.uid) {
      setSettings(DEFAULT_PRIVACY_SETTINGS);
      setLoadError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getUserSettings(user.uid);
      if (seq !== settingsSeqRef.current) return;
      setSettings(data.privacy);
    } catch (error) {
      if (seq !== settingsSeqRef.current) return;
      console.error('Error loading privacy settings:', error);
      setLoadError('No se pudieron cargar tus preferencias de privacidad.');
      showToast('No se pudieron cargar las preferencias.', 'error');
    } finally {
      if (seq === settingsSeqRef.current) {
        setLoading(false);
      }
    }
  }, [user?.uid, showToast]);

  const loadBlockedUsers = useCallback(async () => {
    const seq = ++blockedSeqRef.current;
    if (!user?.uid) {
      setBlockedUsers([]);
      setBlockedError(null);
      setLoadingBlocked(false);
      return;
    }
    setLoadingBlocked(true);
    setBlockedError(null);
    try {
      const profiles = await getBlockedUsersProfiles(user.uid);
      if (seq !== blockedSeqRef.current) return;
      setBlockedUsers(profiles);
    } catch (error) {
      if (seq !== blockedSeqRef.current) return;
      console.error('Error loading blocked users:', error);
      setBlockedError('No se pudo cargar la lista de usuarios bloqueados.');
    } finally {
      if (seq === blockedSeqRef.current) {
        setLoadingBlocked(false);
      }
    }
  }, [user?.uid]);

  useEffect(() => {
    void loadSettings();
    void loadBlockedUsers();
  }, [loadSettings, loadBlockedUsers]);

  const handleUpdate = async (next: PrivacySettings) => {
    if (!user || saving || loading || loadError) return;
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

  const handleUnblock = async (blockedUid: string) => {
    if (!user || pendingUnblockUid) return;
    setPendingUnblockUid(blockedUid);
    try {
      await unblockBlockedUser(user.uid, blockedUid);
      setBlockedUsers((prev) => prev.filter((item) => item.uid !== blockedUid));
      showToast('Usuario desbloqueado.', 'success');
    } catch (error) {
      console.error('Error unblocking user:', error);
      showToast('No se pudo desbloquear al usuario.', 'error');
    } finally {
      setPendingUnblockUid(null);
    }
  };

  const handlePasswordReset = async () => {
    if (saving) return;
    if (!user?.email) {
      showToast('Tu cuenta no tiene correo asociado.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await resetPassword(user.email);
      showToast('Enviamos un correo para cambiar tu contraseña.', 'success');
    } catch (error) {
      console.error('Error sending reset password email:', error);
      showToast('No se pudo enviar el correo.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeSessions = async () => {
    if (!user || saving) return;
    if (
      !window.confirm(
        '¿Cerrar sesión en todos tus otros dispositivos? Deberás volver a iniciar sesión en ellos.',
      )
    ) {
      return;
    }
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

  const disabled = loading || saving || !user || !!loadError;

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
          <p className="text-xs text-neutral-500">Controla quién puede contactarte</p>
        </div>
      </header>

      {!user ? (
        <div className="text-sm text-neutral-500 text-center py-10">
          Inicia sesión para ajustar privacidad y seguridad.
        </div>
      ) : loading ? (
        <div className="text-sm text-neutral-500 text-center py-10">Cargando preferencias...</div>
      ) : (
        <div className="space-y-8">
          {loadError ? (
            <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 space-y-3">
              <p className="text-sm text-red-200">{loadError}</p>
              <button
                type="button"
                onClick={() => void loadSettings()}
                className="px-4 py-2 rounded-lg border border-red-400/40 text-xs font-medium text-red-100 hover:bg-red-500/20 transition-colors"
              >
                Reintentar
              </button>
            </section>
          ) : (
            <>
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
                      handleUpdate({
                        ...settings,
                        allowDirectMessages: !settings.allowDirectMessages,
                      })
                    }
                    disabled={disabled}
                  />
                  <ToggleRow
                    label="Mostrar estado en línea"
                    description="Muestra cuando estás conectado"
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
                    label="Mostrar última actividad"
                    description="Muestra cuando fue tu última conexión"
                    icon={<EyeOff size={18} className="text-purple-400" />}
                    checked={settings.showLastActive}
                    onChange={() =>
                      handleUpdate({ ...settings, showLastActive: !settings.showLastActive })
                    }
                    disabled={disabled}
                  />
                  <ToggleRow
                    label="Permitir solicitudes de amistad"
                    description="Habilita nuevas solicitudes de conexión"
                    icon={<Users size={18} className="text-amber-400" />}
                    checked={settings.allowFriendRequests}
                    onChange={() =>
                      handleUpdate({
                        ...settings,
                        allowFriendRequests: !settings.allowFriendRequests,
                      })
                    }
                    disabled={disabled}
                  />
                </div>
              </section>
            </>
          )}

          <section>
            <h2 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider px-2">
              Usuarios bloqueados
            </h2>
            <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden">
              {loadingBlocked ? (
                <div className="p-5 flex items-center justify-center gap-2 text-xs text-neutral-400">
                  <Loader2 size={14} className="animate-spin" />
                  Cargando usuarios bloqueados...
                </div>
              ) : blockedError ? (
                <div className="p-5 space-y-3">
                  <p className="text-sm text-red-300">{blockedError}</p>
                  <button
                    type="button"
                    onClick={() => void loadBlockedUsers()}
                    className="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs text-neutral-200 hover:border-neutral-500 transition-colors"
                  >
                    Reintentar
                  </button>
                </div>
              ) : blockedUsers.length === 0 ? (
                <div className="p-5 flex items-center gap-3 text-sm text-neutral-500">
                  <Ban size={16} className="text-neutral-600 shrink-0" />
                  <span>No has bloqueado a nadie.</span>
                </div>
              ) : (
                blockedUsers.map((blocked) => {
                  const isUnblocking = pendingUnblockUid === blocked.uid;
                  return (
                    <div
                      key={blocked.uid}
                      className="flex items-center justify-between gap-3 p-4 border-b border-neutral-800 last:border-0"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800 overflow-hidden flex items-center justify-center shrink-0">
                          {blocked.photoURL ? (
                            <img
                              src={blocked.photoURL}
                              alt={blocked.displayName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <UserIcon size={18} className="text-neutral-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate">
                            {blocked.displayName}
                          </div>
                          {blocked.username && (
                            <div className="text-xs text-neutral-500 truncate">
                              @{blocked.username}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleUnblock(blocked.uid)}
                        disabled={pendingUnblockUid !== null}
                        className="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs font-medium text-neutral-200 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      >
                        {isUnblocking ? 'Desbloqueando...' : 'Desbloquear'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider px-2">
              Seguridad
            </h2>
            <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden">
              <ActionRow
                label="Cambiar contraseña"
                description="Te enviaremos un correo para restablecerla"
                icon={<Lock size={18} className="text-rose-300" />}
                onClick={handlePasswordReset}
                disabled={saving || !user}
              />
              <ActionRow
                label="Cerrar sesión en otros dispositivos"
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
