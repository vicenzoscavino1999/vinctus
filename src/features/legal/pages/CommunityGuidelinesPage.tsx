import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LEGAL_COPY, LEGAL_LINKS } from '@/shared/constants';

const CommunityGuidelinesPage = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto pb-24 fade-in">
      <header className="flex items-center gap-4 mb-8 sticky top-0 bg-bg/85 backdrop-blur-md py-4 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-white/5 rounded-full transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-semibold">Community Guidelines</h1>
          <p className="text-xs text-neutral-500">Actualizado: {LEGAL_COPY.lastUpdated}</p>
        </div>
      </header>

      <article className="space-y-6 text-sm text-neutral-300 leading-7">
        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">1. Respeto y seguridad</h2>
          <p>No permitimos acoso, amenazas, doxxing, extorsion ni contenido de odio.</p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">2. Contenido prohibido</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Contenido ilegal o de explotacion sexual de menores.</li>
            <li>Fraude, phishing, suplantacion de identidad y estafas.</li>
            <li>Spam masivo o manipulacion coordinada.</li>
          </ul>
        </section>

        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">3. Reportes y moderacion</h2>
          <p>
            Puedes reportar usuarios, grupos, posts y comentarios desde la app. Evaluamos segun
            prioridad y podemos retirar contenido o limitar cuentas.
          </p>
          <p>{LEGAL_COPY.moderationSla}</p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">4. Cumplimiento</h2>
          <p>
            Las reincidencias o infracciones graves pueden terminar en suspension o bloqueo
            permanente.
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">5. Contacto de seguridad</h2>
          <p>
            Soporte:{' '}
            <a
              className="text-amber-300 hover:text-amber-200 underline"
              href={`mailto:${LEGAL_LINKS.supportEmail}`}
            >
              {LEGAL_LINKS.supportEmail}
            </a>
            . Seguridad y abuso:{' '}
            <a
              className="text-red-300 hover:text-red-200 underline"
              href={`mailto:${LEGAL_LINKS.securityEmail}`}
            >
              {LEGAL_LINKS.securityEmail}
            </a>
            .
          </p>
        </section>
      </article>

      <div className="mt-8">
        <a
          href={LEGAL_LINKS.communityGuidelinesPublicUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-400 hover:text-white transition-colors"
        >
          Ver version publica
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
};

export default CommunityGuidelinesPage;
