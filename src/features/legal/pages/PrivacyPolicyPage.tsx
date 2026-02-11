import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LEGAL_COPY, LEGAL_LINKS } from '@/shared/constants';

const PrivacyPolicyPage = () => {
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
          <h1 className="text-2xl font-semibold">Politica de privacidad</h1>
          <p className="text-xs text-neutral-500">Actualizado: {LEGAL_COPY.lastUpdated}</p>
        </div>
      </header>

      <article className="space-y-6 text-sm text-neutral-300 leading-7">
        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">1. Datos que recopilamos</h2>
          <p>
            Recopilamos datos de cuenta (correo, uid, nombre de perfil), contenido que publicas,
            metadatos de uso y datos tecnicos de seguridad necesarios para operar Vinctus.
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">2. Para que usamos los datos</h2>
          <p>
            Usamos los datos para autenticacion, funcionamiento de la red social, prevencion de
            abuso, soporte, analitica operativa y mejora de funciones.
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">3. Proveedores externos</h2>
          <p>
            Parte del servicio usa proveedores externos para IA y almacenamiento.{' '}
            {LEGAL_COPY.aiDisclosure}
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">4. Eliminacion de cuenta</h2>
          <p>
            Puedes solicitar la eliminacion de tu cuenta desde Configuracion. Eliminamos o
            anonimamos datos de acuerdo con obligaciones legales aplicables.
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">5. Contacto</h2>
          <p>
            Para privacidad o ejercicio de derechos puedes escribir a{' '}
            <a
              className="text-amber-300 hover:text-amber-200 underline"
              href={`mailto:${LEGAL_LINKS.supportEmail}`}
            >
              {LEGAL_LINKS.supportEmail}
            </a>
            . Para incidentes de seguridad usa{' '}
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
          href={LEGAL_LINKS.privacyPolicyPublicUrl}
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

export default PrivacyPolicyPage;
