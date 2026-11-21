import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SupportModal from '@/features/help/components/SupportModal';
import { LEGAL_COPY, LEGAL_LINKS } from '@/shared/constants';

type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'profile',
    question: '¿Cómo cambio mi foto o datos de perfil?',
    answer: 'Perfil > Editar > Guardar.',
  },
  {
    id: 'password',
    question: '¿Cómo recupero mi contraseña?',
    answer:
      "En el inicio de sesión toca 'Olvidé mi contraseña' y sigue las instrucciones del correo.",
  },
  {
    id: 'publish',
    question: '¿Por qué no puedo publicar o comentar?',
    answer:
      'Revisa tu conexión. Si persiste, cierra sesión y vuelve a entrar. Si aún falla, envía un reporte desde Ayuda y comentarios.',
  },
  {
    id: 'uploads',
    question: 'No puedo subir fotos o archivos, ¿qué hago?',
    answer: 'Verifica permisos de galería/cámara, el tamaño del archivo y tu conexión.',
  },
  {
    id: 'report',
    question: '¿Cómo reporto un usuario o contenido?',
    answer:
      "Si ves el botón '...', usa Reportar. Evaluamos los reportes según las Normas de la comunidad y podemos retirar contenido o limitar cuentas.",
  },
  {
    id: 'report-followup',
    question: '¿Qué pasa después de enviar un reporte?',
    answer:
      'Aplicamos revisión por prioridad. Casos de seguridad: <= 24h. Casos generales: <= 72h. Si falta contexto, soporte te contacta.',
  },
  {
    id: 'delete',
    question: '¿Cómo borro una publicación?',
    answer: "Abre tu publicación > '...' > Eliminar.",
  },
  {
    id: 'notifications',
    question: '¿Cómo funcionan las notificaciones?',
    answer: 'Ajustes > Notificaciones. Activa o desactiva por tipo.',
  },
  {
    id: 'delete-account',
    question: '¿Cómo elimino mi cuenta?',
    answer: 'Configuración > Privacidad y seguridad > Eliminar cuenta.',
  },
];

const HelpPage = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(FAQ_ITEMS[0]?.id ?? null);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return FAQ_ITEMS;
    return FAQ_ITEMS.filter((item) => {
      const haystack = `${item.question} ${item.answer}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query]);

  const toggleItem = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <div className="max-w-3xl mx-auto pb-20 fade-in">
        <header className="flex items-center gap-4 mb-8 sticky top-0 bg-bg/80 backdrop-blur-md py-4 z-10">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white/5 rounded-full transition-colors"
            aria-label="Volver"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">Centro de ayuda</h1>
            <p className="text-xs text-neutral-500">Respuestas rápidas para dudas comunes</p>
          </div>
        </header>

        <div className="space-y-8">
          <div className="flex items-center gap-3 bg-[#1A1A1A] border border-neutral-800 rounded-2xl px-4 py-3">
            <Search size={16} className="text-neutral-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar en el FAQ..."
              className="bg-transparent text-sm text-white placeholder:text-neutral-600 focus:outline-none w-full"
            />
          </div>

          <section className="space-y-3">
            {filteredItems.length === 0 ? (
              <div className="text-sm text-neutral-500 text-center py-6">
                No encontramos resultados.
              </div>
            ) : (
              filteredItems.map((item) => {
                const isOpen = openId === item.id;
                return (
                  <div
                    key={item.id}
                    className="bg-[#1A1A1A] border border-neutral-800 rounded-2xl overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left"
                    >
                      <span className="font-medium">{item.question}</span>
                      <ChevronDown
                        size={18}
                        className={`text-neutral-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 text-sm text-neutral-400">{item.answer}</div>
                    )}
                  </div>
                );
              })
            )}
          </section>

          <section className="bg-[#141414] border border-neutral-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">¿No encontraste tu respuesta?</h2>
              <p className="text-xs text-neutral-500">Contacta a soporte y revisamos tu caso.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsSupportOpen(true)}
              className="px-5 py-2 rounded-full bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors"
            >
              Contactar soporte
            </button>
          </section>

          <section className="bg-[#141414] border border-neutral-800 rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-semibold">Legal y seguridad</h2>
            <p className="text-xs text-neutral-500">
              Para privacidad, términos, normas de comunidad y seguridad usa estos enlaces
              oficiales.
            </p>
            <div className="flex flex-wrap gap-3 text-xs">
              <button
                type="button"
                onClick={() => navigate('/legal/privacy')}
                className="px-3 py-2 rounded-full border border-neutral-700 hover:border-neutral-500 transition-colors"
              >
                Política de privacidad
              </button>
              <button
                type="button"
                onClick={() => navigate('/legal/terms')}
                className="px-3 py-2 rounded-full border border-neutral-700 hover:border-neutral-500 transition-colors"
              >
                Términos de servicio
              </button>
              <button
                type="button"
                onClick={() => navigate('/legal/community-guidelines')}
                className="px-3 py-2 rounded-full border border-neutral-700 hover:border-neutral-500 transition-colors"
              >
                Community Guidelines
              </button>
              <a
                href={`mailto:${LEGAL_LINKS.supportEmail}`}
                className="px-3 py-2 rounded-full border border-neutral-700 hover:border-neutral-500 transition-colors"
              >
                Contacto: {LEGAL_LINKS.supportEmail}
              </a>
              <a
                href={LEGAL_LINKS.supportPublicUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-full border border-neutral-700 hover:border-neutral-500 transition-colors"
              >
                Centro de soporte
              </a>
              <a
                href={`mailto:${LEGAL_LINKS.securityEmail}`}
                className="px-3 py-2 rounded-full border border-red-500/40 text-red-200 hover:border-red-400 transition-colors"
              >
                Seguridad: {LEGAL_LINKS.securityEmail}
              </a>
            </div>
            <div className="text-xs text-neutral-500">{LEGAL_COPY.moderationSla}</div>
          </section>
        </div>
      </div>

      <SupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
        initialView="form"
        initialType="issue"
      />
    </>
  );
};

export default HelpPage;
