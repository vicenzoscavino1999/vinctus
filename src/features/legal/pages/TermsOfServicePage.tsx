import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LEGAL_COPY, LEGAL_LINKS } from '@/shared/constants';

const TermsOfServicePage = () => {
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
          <h1 className="text-2xl font-semibold">Terminos de servicio</h1>
          <p className="text-xs text-neutral-500">Actualizado: {LEGAL_COPY.lastUpdated}</p>
        </div>
      </header>

      <article className="space-y-6 text-sm text-neutral-300 leading-7">
        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">1. Uso aceptable</h2>
          <p>
            No esta permitido contenido ilegal, acoso, spam, fraude, suplantacion de identidad o
            material sexual con menores. Vinctus puede suspender cuentas por incumplimiento.
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">2. Contenido generado por usuarios</h2>
          <p>
            Puedes reportar y bloquear usuarios. Conservamos mecanismos de moderacion y podemos
            retirar contenido objetable para proteger la comunidad.
          </p>
          <p>{LEGAL_COPY.moderationSla}</p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">3. Cuenta y seguridad</h2>
          <p>
            Eres responsable de la actividad de tu cuenta y de mantener seguras tus credenciales.
            Debes informar accesos no autorizados al soporte oficial.
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">4. IA y terceros</h2>
          <p>{LEGAL_COPY.aiDisclosure}</p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">5. Contacto y soporte</h2>
          <p>
            Soporte general:{' '}
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
          href={LEGAL_LINKS.termsOfServicePublicUrl}
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

export default TermsOfServicePage;
