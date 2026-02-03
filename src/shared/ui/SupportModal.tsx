import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Lightbulb, HelpCircle, Mail, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from './Toast';
import {
  createSupportTicket,
  type SupportTicketContext,
  type SupportTicketType,
} from '@/lib/firestore';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: 'menu' | 'form';
  initialType?: SupportTicketType;
}

const SUPPORT_EMAIL = 'support@vinctus.app';
const APP_VERSION = 'v0.0.2-alpha';

const buildContext = (): SupportTicketContext | null => {
  if (typeof window === 'undefined') return null;
  const { location, navigator, screen, innerWidth, innerHeight } = window;
  return {
    path: location.pathname,
    href: location.href,
    userAgent: navigator.userAgent,
    platform: navigator.platform ?? '',
    locale: navigator.language ?? '',
    screen: {
      width: screen?.width ?? 0,
      height: screen?.height ?? 0,
    },
    viewport: {
      width: innerWidth ?? 0,
      height: innerHeight ?? 0,
    },
    timezoneOffset: new Date().getTimezoneOffset(),
  };
};

const SupportModal = ({ isOpen, onClose, initialView, initialType }: SupportModalProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [view, setView] = useState<'menu' | 'form'>('menu');
  const [type, setType] = useState<SupportTicketType>('issue');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailLabel = useMemo(() => user?.email ?? 'sin correo', [user?.email]);

  useEffect(() => {
    if (!isOpen) return;
    setView(initialView ?? 'menu');
    setType(initialType ?? 'issue');
    setTitle('');
    setMessage('');
    setIsSubmitting(false);
  }, [isOpen, initialView, initialType]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const openForm = (nextType: SupportTicketType) => {
    setType(nextType);
    setView('form');
  };

  const openHelpCenter = () => {
    onClose();
    navigate('/help');
  };

  const handleSubmit = async () => {
    if (!user) {
      showToast('Inicia sesion para enviar el formulario.', 'warning');
      return;
    }
    const cleanTitle = title.trim();
    const cleanMessage = message.trim();
    if (cleanTitle.length < 4 || cleanMessage.length < 10) {
      showToast('Completa el titulo y detalle.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await createSupportTicket({
        uid: user.uid,
        email: user.email ?? null,
        type,
        title: cleanTitle,
        message: cleanMessage,
        context: buildContext(),
        appVersion: APP_VERSION,
      });
      showToast('Gracias, recibimos tu mensaje.', 'success');
      onClose();
    } catch (error) {
      console.error('Error creating support ticket:', error);
      showToast('No se pudo enviar. Intenta de nuevo.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl bg-[#121212] border border-neutral-800 rounded-t-3xl px-6 pt-4 pb-8 max-h-[85vh] overflow-y-auto animate-fade-up"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Ayuda y comentarios</h2>
            <p className="text-xs text-neutral-500">Cuentanos lo que necesitas</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/5 transition-colors"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {view === 'menu' ? (
          <div className="space-y-3">
            <button
              onClick={() => openForm('issue')}
              className="w-full flex items-center justify-between p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 rounded-full bg-neutral-900/80 border border-neutral-800 flex items-center justify-center text-rose-300">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <div className="font-medium">Reportar un problema</div>
                  <div className="text-xs text-neutral-500">Algo no funciona como esperabas</div>
                </div>
              </div>
              <span className="text-xs text-neutral-500">&gt;</span>
            </button>

            <button
              onClick={() => openForm('feature')}
              className="w-full flex items-center justify-between p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 rounded-full bg-neutral-900/80 border border-neutral-800 flex items-center justify-center text-amber-300">
                  <Lightbulb size={18} />
                </div>
                <div>
                  <div className="font-medium">Sugerir una mejora</div>
                  <div className="text-xs text-neutral-500">Comparte ideas para Vinctus</div>
                </div>
              </div>
              <span className="text-xs text-neutral-500">&gt;</span>
            </button>

            <button
              onClick={openHelpCenter}
              className="w-full flex items-center justify-between p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 rounded-full bg-neutral-900/80 border border-neutral-800 flex items-center justify-center text-sky-300">
                  <HelpCircle size={18} />
                </div>
                <div>
                  <div className="font-medium">Centro de ayuda (FAQ)</div>
                  <div className="text-xs text-neutral-500">Guias y respuestas rapidas</div>
                </div>
              </div>
              <span className="text-xs text-neutral-500">&gt;</span>
            </button>

            <button
              onClick={() => window.open(`mailto:${SUPPORT_EMAIL}`, '_blank')}
              className="w-full flex items-center justify-between p-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 rounded-full bg-neutral-900/80 border border-neutral-800 flex items-center justify-center text-emerald-300">
                  <Mail size={18} />
                </div>
                <div>
                  <div className="font-medium">Escribir por correo</div>
                  <div className="text-xs text-neutral-500">support@vinctus.app</div>
                </div>
              </div>
              <span className="text-xs text-neutral-500">&gt;</span>
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setView('menu')}
                className="text-xs uppercase tracking-widest text-neutral-500 hover:text-white transition-colors"
              >
                Volver
              </button>
              <span className="text-xs text-neutral-500">
                {type === 'issue' ? 'Reporte' : 'Sugerencia'}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                  Titulo
                </label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  className="w-full bg-neutral-900/60 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                  placeholder={
                    type === 'issue' ? 'Ej: No puedo enviar mensajes' : 'Ej: Agregar modo compacto'
                  }
                />
              </div>

              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">
                  Detalle
                </label>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  maxLength={2000}
                  className="w-full bg-neutral-900/60 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                  placeholder="Cuentanos que paso y en que pantalla."
                />
              </div>
            </div>

            <div className="text-xs text-neutral-500">
              Responderemos a: <span className="text-neutral-300">{emailLabel}</span>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full px-4 py-3 rounded-full bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportModal;
