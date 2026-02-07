import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Bell, Mail, AtSign, Calendar, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import { useToast } from '@/shared/ui/Toast';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getUserSettings,
  updateNotificationSettings,
  type NotificationSettings,
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

const SettingsNotificationsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
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
          setSettings(data.notifications);
        }
      } catch (error) {
        console.error('Error loading notification settings:', error);
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

  const handleUpdate = async (next: NotificationSettings) => {
    if (!user) return;
    const previous = settings;
    setSettings(next);
    setSaving(true);
    try {
      await updateNotificationSettings(user.uid, next);
    } catch (error) {
      console.error('Error saving notification settings:', error);
      setSettings(previous);
      showToast('No se pudieron guardar los cambios.', 'error');
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
          <h1 className="text-2xl font-semibold">Notificaciones</h1>
          <p className="text-xs text-neutral-500">Configura como quieres recibir alertas</p>
        </div>
      </header>

      {!user ? (
        <div className="text-sm text-neutral-500 text-center py-10">
          Inicia sesion para configurar notificaciones.
        </div>
      ) : loading ? (
        <div className="text-sm text-neutral-500 text-center py-10">Cargando preferencias...</div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-medium text-neutral-400 mb-4 uppercase tracking-wider px-2">
              Alertas principales
            </h2>
            <div className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden">
              <ToggleRow
                label="Notificaciones push"
                description="Alertas en tiempo real en tus dispositivos"
                icon={<Bell size={18} className="text-yellow-400" />}
                checked={settings.pushEnabled}
                onChange={() => handleUpdate({ ...settings, pushEnabled: !settings.pushEnabled })}
                disabled={disabled}
              />
              <ToggleRow
                label="Correos importantes"
                description="Recibe avisos clave en tu email"
                icon={<Mail size={18} className="text-blue-400" />}
                checked={settings.emailEnabled}
                onChange={() => handleUpdate({ ...settings, emailEnabled: !settings.emailEnabled })}
                disabled={disabled}
              />
              <ToggleRow
                label="Solo menciones"
                description="Limita alertas a menciones y respuestas directas"
                icon={<AtSign size={18} className="text-emerald-400" />}
                checked={settings.mentionsOnly}
                onChange={() => handleUpdate({ ...settings, mentionsOnly: !settings.mentionsOnly })}
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
                label="Resumen semanal"
                description="Un recordatorio con lo mas relevante"
                icon={<Calendar size={18} className="text-purple-400" />}
                checked={settings.weeklyDigest}
                onChange={() => handleUpdate({ ...settings, weeklyDigest: !settings.weeklyDigest })}
                disabled={disabled}
              />
              <ToggleRow
                label="Novedades de Vinctus"
                description="Recibe noticias de nuevas funciones"
                icon={<Sparkles size={18} className="text-amber-300" />}
                checked={settings.productUpdates}
                onChange={() =>
                  handleUpdate({ ...settings, productUpdates: !settings.productUpdates })
                }
                disabled={disabled}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default SettingsNotificationsPage;
