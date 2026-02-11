# Plan Operativo Semanal - Migracion iOS Nativa (SwiftUI)

Fecha base: 2026-02-11  
Horizonte: 26 semanas  
Objetivo: migrar Vinctus a iOS nativo sin romper produccion, reutilizando backend/compliance ya implementados.

## Decision de alcance (bloqueada)

1. Track de release mobile iOS: solo app nativa SwiftUI.
2. Track Capacitor: congelado para iOS release (se mantiene solo como referencia historica/fallback tecnico).
3. Web en Vercel continua activa para producto web, legal, soporte y landing.
4. Backend/compliance es compartido y reutilizable entre web e iOS nativa.
5. Cualquier reactivacion de release por Capacitor requiere RFC explicito y aprobacion de riesgo.

## 0) Reglas de seguridad (obligatorias)

1. No hay migracion "big bang"; se entrega por modulos.
2. Cualquier cambio de schema/contract requiere RFC y compatibilidad hacia atras.
3. Ninguna migracion destructiva en la misma release en que se activa un feature nuevo.
4. Todo feature nuevo iOS sale con flag apagado por defecto.
5. Rollback operativo es por flags/kill-switches server-side, no por "revert app store".
6. Todo flujo critico requiere prueba en staging antes de tocar produccion.
7. Operacion dual-run obligatoria: web y iOS nativa conviven durante toda la migracion con reglas de escritura compatibles.
8. Seguridad de cliente obligatoria: App Check (web + iOS) antes de abrir trafico amplio en produccion.
9. No se implementan features nuevas de release iOS en Capacitor durante este plan.

## 1) Definicion de Done (final de migracion)

1. Paridad funcional en auth, feed, posts, chat, groups, report/block, delete account, AI consent.
2. iOS nativa estable con crash-free alto en TestFlight.
3. Costos Firestore bajo control con metricas semanales.
4. App Store package completo sin placeholders.
5. Web en Vercel sigue operativa para legal/soporte/landing.

## 2) Metricas de control (semanales)

1. Crash-free sessions (beta): objetivo >= 99.5%.
2. p95 login: objetivo <= 2.5s.
3. p95 primer render feed: objetivo <= 3.5s en red normal.
4. Reads/user/day: no subir mas de +25% vs baseline aprobado.
5. Errores 5xx Functions criticas: <= 0.5%.
6. Delete account: 100% de casos de prueba completados sin residuos.
7. Alertas de costo: presupuesto diario en staging/prod con aviso automatico al superar 80% y 100%.

## 3) Artefactos de control (crear y mantener)

1. `docs/ios-contracts-v1.md` (contratos cliente-backend).
2. `docs/ios-risk-register.md` (riesgos y mitigaciones).
3. `docs/ios-weekly-status.md` (estado semanal).
4. `docs/ios-parity-matrix.md` (web vs iOS por feature).
5. `docs/ios-rollback-playbook.md` (kill switches y hotfix).
6. `docs/ios-contract-rfc-template.md` (plantilla obligatoria de cambios de contrato).
7. `docs/ios-contract-test-matrix.md` (matriz de pruebas de contrato por dominio).
8. `docs/ios-week2-hardening-checklist.md` (checklist operativo de hardening backend).
9. `docs/ios-payload-versioning-plan.md` (estrategia de versionado logico).
10. `docs/ios-app-check-rollout-plan.md` (rollout gradual App Check).

## 4) Plan semanal ejecutable

## Semana 0 - Post-pago Apple (arranque bloqueante)

Objetivo: dejar lista la infraestructura Apple para todo el track nativo.

Tareas:

1. Activar Apple Developer account y confirmar tipo de cuenta (individual/organization).
2. Definir y congelar bundle id final de la app nativa.
3. Crear App ID con capability Sign in with Apple.
4. Crear claves/certificados/profiles base para firma iOS.
5. Configurar Service ID/Key para SIWA y enlazar Firebase Auth provider.

Entregables:

1. Checklist Apple/Firebase en verde para SIWA.
2. Proyecto iOS firmando en dispositivo real.

Validacion:

1. Login Apple de prueba funcional en entorno dev/staging.
2. Build signed ejecutable en iPhone real.

Gate Go/No-Go:

1. No-Go de migracion iOS nativa productiva si Semana 0 no esta cerrada.

## Semana 1 - Gobernanza

Objetivo: cerrar base de migracion sin tocar funcionalidad productiva.

Tareas:

1. Crear rama `release/ios-native-migration`.
2. Congelar contratos actuales de Firestore/Functions.
3. Definir matriz de paridad por feature.
4. Crear risk register inicial.

Entregables:

1. `docs/ios-contracts-v1.md` (v1).
2. `docs/ios-parity-matrix.md` (v1).
3. `docs/ios-risk-register.md` (v1).

Validacion:

1. Repositorio sin cambios destructivos.
2. Checklist de contratos aprobado.

Gate Go/No-Go:

1. Go solo si contratos y parity matrix estan firmados.

## Semana 2 - Hardening backend I

Objetivo: asegurar compatibilidad para 2 clientes (web+iOS).

Tareas:

1. Revisar campos obligatorios/opcionales por coleccion critica.
2. Agregar tests de contrato para Functions clave.
3. Revisar reglas Firestore/Storage para casos iOS equivalentes.
4. Definir contrato versionado (DTO, defaults, deprecated fields).

Entregables:

1. Tests de contrato para publish/report/delete.
2. Actualizacion de `docs/ios-contracts-v1.md`.

Validacion:

1. `npm run test:rules`
2. `npm run test:delete-account:harness`

Gate Go/No-Go:

1. No-Go si falla cualquier test critico de auth/report/delete.

## Semana 3 - Hardening backend II

Objetivo: cerrar idempotencia y trazabilidad operativa.

Tareas:

1. Verificar idempotencia de operaciones criticas.
2. Definir versionado logico de payloads (compat hacia atras).
3. Activar monitoreo de errores Functions por dominio.
4. Habilitar App Check plan (web+iOS) en staging y checklist de rollout seguro.

Entregables:

1. Documento de idempotencia en `docs/ios-contracts-v1.md`.
2. Baseline de errores backend en `docs/ios-weekly-status.md`.

Validacion:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`

Gate Go/No-Go:

1. Go solo si no hay regressions backend.

## Semana 4 - Base iOS nativa I

Objetivo: crear app iOS nativa base.

Tareas:

1. Crear proyecto Xcode (`VinctusNative`).
2. Configurar entornos `dev/staging/prod`.
3. Integrar Firebase SDK (Auth/Firestore/Functions/Storage).
4. Configurar arquitectura MVVM + repositorio base.

Entregables:

1. Proyecto iOS compilando en simulador.
2. `AuthRepo`, `FeedRepo` esqueletos.

Validacion:

1. Build local iOS sin errores.
2. Login tecnico contra entorno dev.

Gate Go/No-Go:

1. Go si app nativa abre y conecta Firebase.

## Semana 5 - Base iOS nativa II

Objetivo: shell navegable y base de componentes.

Tareas:

1. Implementar `TabView + NavigationStack`.
2. Design tokens y componentes base (buttons, inputs, cards, loader).
3. Logging base sin PII.

Entregables:

1. Shell navegable con placeholders reales de pantalla.
2. UI kit base SwiftUI.

Validacion:

1. Navegacion estable en simulador.
2. Lint/format iOS segun estandar del proyecto iOS.

Gate Go/No-Go:

1. No-Go si navegacion base no es estable.

## Semana 6 - Auth iOS I

Objetivo: login base productivo con cuenta Apple ya activa.

Tareas:

1. Email/password.
2. Google Sign-In nativo.
3. Persistencia de sesion y logout.
4. Verificar que estado de proveedor social permita SIWA en paridad la semana siguiente.

Entregables:

1. LoginView completa.
2. Manejo de errores de auth.

Validacion:

1. Login/logout en 2 dispositivos o simulador + dispositivo.
2. Sesion persiste tras reinicio.

Gate Go/No-Go:

1. Go si outcomes de auth son equivalentes a web.

## Semana 7 - Auth iOS II (Apple path)

Objetivo: cerrar Apple Sign-In productivo en nativo.

Tareas:

1. Integracion SIWA productiva (no mock, no modo preparado).
2. Pruebas de edge cases (cancel, relay email, relogin, unlink/relink).
3. Cobertura edge cases de auth.

Entregables:

1. Boton Apple y flujo integrado.
2. Checklist tecnico de Apple/Firebase.

Validacion:

1. Pruebas de inicio/cierre/sesion invalida.

Gate Go/No-Go:

1. No-Go para release iOS social si SIWA no esta en paridad con Google.

## Semana 8 - Compliance iOS I

Objetivo: legal y settings base en nativo.

Tareas:

1. Privacy/Terms/Support/Guidelines visibles.
2. Contacto soporte/seguridad.
3. Toggle consentimiento IA persistente server-side.

Entregables:

1. Settings legal/compliance.
2. Enlaces a URLs de Vercel.

Validacion:

1. Flujos legales navegables.
2. Consentimiento IA persiste tras relogin.

Gate Go/No-Go:

1. No-Go si falta transparencia legal in-app.

## Semana 9 - Compliance iOS II

Objetivo: delete account end-to-end desde iOS.

Tareas:

1. Integrar request/status delete account.
2. Confirmaciones UX y estados de proceso.
3. Verificar borrado en backend con evidencia.

Entregables:

1. Danger zone iOS completa.
2. Evidencia de borrado por casos de prueba.

Validacion:

1. Harness delete account y validacion manual en staging.

Gate Go/No-Go:

1. No-Go si queda data residual no esperada.

## Semana 10 - Read path I (Feed)

Objetivo: feed lectura eficiente.

Tareas:

1. FeedView con paginacion real.
2. Estados loading/vacio/error.
3. Estrategia de cache visual.

Entregables:

1. Feed navegable y usable.
2. Metricas de p95 feed.

Validacion:

1. Pruebas de scroll y paginacion.
2. Medicion de reads baseline.

Gate Go/No-Go:

1. No-Go si costos se disparan o paginacion falla.

## Semana 11 - Read path II (Profile/Discover)

Objetivo: lectura de perfil y descubrir con paridad.

Tareas:

1. Perfil propio/ajeno.
2. Discover lectura.
3. Manejo de errores de red.

Entregables:

1. ProfileView y DiscoverView funcionales.

Validacion:

1. Navegacion perfil->discover->detalle sin fallas.

Gate Go/No-Go:

1. Go con paridad funcional de lectura.

## Semana 12 - Read path III (Groups + offline base)

Objetivo: lectura de grupos y base offline.

Tareas:

1. Group detail lectura.
2. Politica offline para ultimos datos.
3. Reconexion limpia.

Entregables:

1. GroupView lectura.
2. Politica offline documentada.

Validacion:

1. Prueba modo avion (read cache).

Gate Go/No-Go:

1. No-Go si offline rompe flujos basicos.

## Semana 13 - Create path I (Post)

Objetivo: crear contenido basico.

Tareas:

1. Crear post texto.
2. Validaciones previas.
3. Idempotencia de publish.

Entregables:

1. CreatePostView base.

Validacion:

1. Crear post sin duplicados en reintentos.

Gate Go/No-Go:

1. No-Go si hay dupes de publicacion.

## Semana 14 - Create path II (Media/Comment)

Objetivo: media upload robusto + comentarios.

Tareas:

1. Camara/galeria nativa.
2. Compresion razonable.
3. Comentarios y acciones sociales.

Entregables:

1. Pipeline media estable.

Validacion:

1. Subida, cancelacion, retry y error path.

Gate Go/No-Go:

1. No-Go si media upload no es confiable.

## Semana 15 - Chat I

Objetivo: lista de conversaciones + chat 1:1.

Tareas:

1. Lista conversaciones.
2. Detalle 1:1.
3. Envio de mensajes baseline.

Entregables:

1. Chat 1:1 operativo.

Validacion:

1. Send/receive en tiempo real.

Gate Go/No-Go:

1. Go si chat 1:1 estable y dedupe correcto.

## Semana 16 - Chat II

Objetivo: chat grupal + optimizacion listeners.

Tareas:

1. Chat grupal.
2. Paginacion mensajes (latest N + older).
3. Limitar listeners simultaneos.

Entregables:

1. Chat grupal estable.
2. Politica listeners documentada.

Validacion:

1. Medir bateria/costos en staging.

Gate Go/No-Go:

1. No-Go si costos chat fuera de control.

## Semana 17 - Chat III (offline + safety)

Objetivo: cola local y controles de seguridad desde chat.

Tareas:

1. Cola local/reintentos.
2. Bloqueo y reporte desde chat.
3. Estados UX de envio pendiente/error.

Entregables:

1. Chat offline baseline.

Validacion:

1. Prueba cortar red y reconectar.

Gate Go/No-Go:

1. No-Go si se pierden mensajes o hay duplicados.

## Semana 18 - Moderacion I

Objetivo: reportes completos desde iOS.

Tareas:

1. Report post/comment/user/group.
2. Integracion con cola moderacion existente.
3. Copy alineado a guidelines.

Entregables:

1. Flujos de reporte completos.

Validacion:

1. Verificar ticket en cola por cada tipo.

Gate Go/No-Go:

1. No-Go si algun tipo de reporte no llega a cola.

## Semana 19 - Moderacion II

Objetivo: trust & safety visible para usuario.

Tareas:

1. Efectos de bloqueo/mute inmediatos.
2. Contacto seguridad visible.
3. Validar SLA operativo.

Entregables:

1. UX de seguridad cerrada.

Validacion:

1. Casos maliciosos basicos probados.

Gate Go/No-Go:

1. Go con 4 pilares UGC cubiertos.

## Semana 20 - IA nativa I

Objetivo: AI Chat nativo bajo consentimiento.

Tareas:

1. Integrar AI Chat iOS.
2. Gating por consentimiento.
3. Feature flag para kill switch.

Entregables:

1. AI Chat nativo con disclosure.

Validacion:

1. Sin consentimiento no hay uso IA.

Gate Go/No-Go:

1. No-Go si IA permite bypass de consentimiento.

## Semana 21 - IA nativa II

Objetivo: AI Arena + control de costos.

Tareas:

1. Integrar Arena nativa.
2. Rate limits y observabilidad costos.
3. Confirmar guardrails PII backend.

Entregables:

1. IA completa en iOS bajo flags.

Validacion:

1. Kill switch de IA operativo en <= 1 min.

Gate Go/No-Go:

1. No-Go si no existe apagado remoto confiable.

## Semana 22 - Push nativo

Objetivo: APNs + FCM estable.

Tareas:

1. Configurar APNs/FCM.
2. Registrar token por usuario.
3. Manejar permisos y fallback.
4. Ejecutar rollout de App Check en produccion con monitoreo de falsos positivos.

Entregables:

1. Push end-to-end en dispositivo real.

Validacion:

1. Recibir notificacion foreground/background.

Gate Go/No-Go:

1. No-Go si tokens no se asocian confiablemente.

## Semana 23 - Calidad iOS final

Objetivo: polish final para App Review.

Tareas:

1. Haptics en eventos clave.
2. Deep links/Universal Links.
3. Accesibilidad (VoiceOver, Dynamic Type, contraste).
4. Performance/memoria.

Entregables:

1. Reporte QA iOS final.

Validacion:

1. Smoke test en iPhone real con notch y sin notch.

Gate Go/No-Go:

1. No-Go si hay regressions de accesibilidad o estabilidad.

## Semana 24 - App Store Connect prep

Objetivo: paquete de submit listo.

Tareas:

1. Metadata final y capturas.
2. Age rating cuestionario real.
3. Privacy Nutrition Labels exactas.
4. Review notes y demo account productiva.

Entregables:

1. Submission kit completo.

Validacion:

1. `npm run gate:appstore:submit` en verde (lado web/compliance).

Gate Go/No-Go:

1. No-Go si hay placeholders o labels incompletos.

## Semana 25 - TestFlight

Objetivo: estabilizar build candidata.

Tareas:

1. Internal testing 48-72h.
2. Correccion blockers.
3. Revalidar flows criticos.

Entregables:

1. Build candidata RC.

Validacion:

1. Checklist smoke completa.

Gate Go/No-Go:

1. No-Go con crash blockers abiertos.

## Semana 26 - Submit y contingencia

Objetivo: envio a App Review y respuesta rapida.

Tareas:

1. Submit final.
2. Monitoreo de review feedback.
3. Ejecutar playbook de rechazo si aplica.

Entregables:

1. Registro de envio y estado de revision.
2. Plan de correccion <24h si hay rechazo.

Validacion:

1. Evidencia lista (video y capturas de flujos clave).

Gate Go/No-Go:

1. Go si checklist final 100% verde.

## 5) Checklist semanal recurrente (copiar en cada semana)

1. Paridad: actualizar `docs/ios-parity-matrix.md`.
2. Riesgos: actualizar `docs/ios-risk-register.md`.
3. Estado: actualizar `docs/ios-weekly-status.md`.
4. Validaciones backend/web:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
   - `npm run preflight:appstore -- --skip-url-checks`
   - `npm run gate:appstore`
5. Si hubo cambios en reglas/functions:
   - `npm run test:rules`
   - `npm run test:delete-account:harness`

## 6) Dependencias Apple Developer (deben quedar activas desde el inicio)

1. Sign in with Apple productivo completo.
2. APNs/push productivo.
3. Firma y distribucion TestFlight/App Store.
4. Validacion final real de submit en App Store Connect.

Nota operativa:

1. Si estas dependencias no estan activas, la migracion puede avanzar en UI/arquitectura, pero no puede cerrar release iOS real.
