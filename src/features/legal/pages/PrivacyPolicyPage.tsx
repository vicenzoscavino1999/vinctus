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
          <h1 className="text-2xl font-semibold">Política de privacidad</h1>
          <p className="text-xs text-neutral-500">Actualizado: {LEGAL_COPY.lastUpdated}</p>
        </div>
      </header>

      <article className="space-y-6 text-sm text-neutral-300 leading-7">
        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">1. Datos que recopilamos</h2>
          <p>
            Recopilamos datos de cuenta (correo, uid, nombre de perfil), contenido que publicas o
            envías (incluyendo mensajes, notas de voz y archivos adjuntos), metadatos de uso y
            registros técnicos de seguridad necesarios para operar Vinctus. No vendemos tus datos ni
            rastreamos tu actividad en otras apps.
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">2. Para qué usamos los datos</h2>
          <p>
            Usamos los datos para autenticación, funcionamiento de la red social, prevención de
            abuso, moderación, soporte y mejora operativa. En iPhone solo pedimos acceso al
            micrófono cuando grabas una nota de voz y a tus fotos cuando eliges adjuntarlas.
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">3. Proveedores externos</h2>
          <p>
            Operamos sobre Google Firebase y Vercel para autenticación, base de datos,
            almacenamiento y APIs. {LEGAL_COPY.aiDisclosure}
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-white">
            4. Retención, menores y eliminación de cuenta
          </h2>
          <p>
            Vinctus no está dirigido a menores de 13 años (o la edad mínima legal de tu país).
            Puedes solicitar la eliminación de tu cuenta desde Configuración &gt; Privacidad y
            seguridad (o en la app iOS desde Perfil &gt; Ajustes &gt; Zona de riesgo). El borrado
            inicia de inmediato y se completa en un máximo de 30 días.
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
          Ver versión pública
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
