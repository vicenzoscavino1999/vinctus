import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SupportModal from '@/shared/ui/SupportModal';

type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'profile',
    question: 'Como cambio mi foto o datos de perfil?',
    answer: 'Perfil > Editar > Guardar.',
  },
  {
    id: 'password',
    question: 'Como recupero mi contrasena?',
    answer: "En el login toca 'Olvide mi contrasena' y sigue el correo.",
  },
  {
    id: 'publish',
    question: 'Por que no puedo publicar o comentar?',
    answer:
      'Revisa tu conexion. Si persiste, cierra sesion y vuelve a entrar. Si aun falla, envia un reporte desde Ayuda y comentarios.',
  },
  {
    id: 'uploads',
    question: 'No puedo subir fotos o archivos, que hago?',
    answer: 'Verifica permisos de galeria/camara, el tamano del archivo y tu conexion.',
  },
  {
    id: 'report',
    question: 'Como reporto un usuario o contenido?',
    answer:
      "Si ves el boton '...', usa Reportar. Si no aparece, envianos un ticket desde Ayuda y comentarios.",
  },
  {
    id: 'delete',
    question: 'Como borro una publicacion?',
    answer: "Abre tu publicacion > '...' > Eliminar.",
  },
  {
    id: 'notifications',
    question: 'Como funcionan las notificaciones?',
    answer: 'Ajustes > Notificaciones. Activa o desactiva por tipo.',
  },
  {
    id: 'delete-account',
    question: 'Como elimino mi cuenta?',
    answer: 'Si aun no existe esa opcion, solicita eliminacion desde Ayuda y comentarios.',
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
            <p className="text-xs text-neutral-500">Respuestas rapidas para dudas comunes</p>
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
                      onClick={() => toggleItem(item.id)}
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
              <h2 className="text-lg font-semibold">No encontraste tu respuesta?</h2>
              <p className="text-xs text-neutral-500">Contacta soporte y revisamos tu caso.</p>
            </div>
            <button
              onClick={() => setIsSupportOpen(true)}
              className="px-5 py-2 rounded-full bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors"
            >
              Contactar soporte
            </button>
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
