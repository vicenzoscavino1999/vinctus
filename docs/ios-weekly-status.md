# iOS Migration Weekly Status

Estado: activo  
Inicio: 2026-02-11

## Template semanal (copiar por semana)

### Semana XX (YYYY-MM-DD a YYYY-MM-DD)

1. Objetivo de la semana:
2. Entregables comprometidos:
3. Entregables completados:
4. Gates (Go/No-Go):
5. Riesgos nuevos:
6. Bloqueos:
7. Metricas:
   - Crash-free:
   - p95 login:
   - p95 feed:
   - Reads/user/day:
   - Error rate Functions:
8. Decisiones tecnicas:
9. Proximo paso:

## Semana 1 (2026-02-11 a 2026-02-17)

1. Objetivo de la semana:
   - Cerrar artefactos base de gobernanza para migracion iOS nativa.
2. Entregables comprometidos:
   - `docs/ios-contracts-v1.md`
   - `docs/ios-risk-register.md`
   - `docs/ios-parity-matrix.md`
   - `docs/ios-rollback-playbook.md`
3. Entregables completados:
   - `docs/ios-native-migration-plan-operativo.md`
   - `docs/ios-contracts-v1.md`
   - `docs/ios-risk-register.md`
   - `docs/ios-parity-matrix.md`
   - `docs/ios-rollback-playbook.md`
4. Gates (Go/No-Go):
   - GO parcial: base documental y controles creados.
   - GO condicional para Semana 2: mantener freeze de contratos y no introducir cambios destructivos.
5. Riesgos nuevos:
   - Dual-run web+iOS puede generar divergencias si no se respeta contrato versionado.
   - Rollout de App Check puede bloquear trafico legitimo si no se hace gradual.
6. Bloqueos:
   - Membresia Apple Developer para cierre SIWA/APNs/TestFlight.
7. Metricas:
   - Compliance gate baseline: `npm run gate:appstore` -> PASS (modo baseline).
   - Compliance gate submit: `npm run gate:appstore:submit` -> FAIL esperado por SIWA/credenciales review.
   - Lint/typecheck/build web -> PASS.
   - `npm run test:rules` -> PASS (36 tests, auth/firestore/storage rules).
   - `npm run test:delete-account:harness` -> PASS (borrado + idempotencia verificados).
8. Decisiones tecnicas:
   - Se mantiene backend actual y se reescribe solo cliente iOS.
   - Se ejecuta dual-run controlado con feature flags y kill switches.
   - Review notes finales se generan desde env local (`REVIEW_PROD_*`) sin secretos en git.
9. Proximo paso:
   - Semana 2: endurecer contratos backend y pruebas de contrato por dominio critico.

## Semana 2 (2026-02-18 a 2026-02-24) - ejecucion anticipada completada

1. Objetivo de la semana:
   - Hardening backend de contratos para dual-run (web+iOS).
2. Entregables comprometidos:
   - `docs/ios-contract-rfc-template.md`
   - `docs/ios-contract-test-matrix.md`
   - `docs/ios-week2-hardening-checklist.md`
3. Entregables completados:
   - `docs/ios-contract-rfc-template.md`
   - `docs/ios-contract-test-matrix.md`
   - `docs/ios-week2-hardening-checklist.md`
4. Gates (Go/No-Go):
   - GO tecnico: checklist de hardening ejecutado en anticipado con P0 en verde.
   - GO condicional release: permanece bloqueo externo de Apple Developer para cierre SIWA/APNs/TestFlight.
5. Riesgos nuevos:
   - Ninguno adicional; usar `docs/ios-risk-register.md`.
6. Bloqueos:
   - Membresia Apple Developer sigue bloqueando cierre SIWA/APNs/TestFlight.
7. Metricas:
   - `npm run test:rules` -> PASS (36 tests).
   - `npm run test:delete-account:harness` -> PASS (delete + idempotencia).
   - `npm run gate:appstore` -> PASS baseline.
   - `npm run lint` -> PASS.
   - `npm run typecheck` -> PASS.
   - `npm run build` -> PASS.
8. Decisiones tecnicas:
   - Todo cambio de contrato nuevo debe iniciar por RFC.
9. Proximo paso:
   - Semana 3: cerrar versionado logico de payloads y plan de App Check en staging.

## Semana 3 (2026-02-25 a 2026-03-03) - preparado

1. Objetivo de la semana:
   - Formalizar versionado de payloads y rollout de App Check.
2. Entregables comprometidos:
   - `docs/ios-payload-versioning-plan.md`
   - `docs/ios-app-check-rollout-plan.md`
   - `docs/app-store-privacy-age-rating-draft.md`
3. Entregables completados:
   - `docs/ios-payload-versioning-plan.md`
   - `docs/ios-app-check-rollout-plan.md`
   - `docs/app-store-privacy-age-rating-draft.md`
4. Gates (Go/No-Go):
   - GO de preparacion: artefactos creados y enlazados al plan maestro.
   - GO de ejecucion pendiente: aplicar en staging y medir falsos positivos.
5. Riesgos nuevos:
   - Ninguno adicional; riesgos App Check ya registrados como R-007.
6. Bloqueos:
   - El rollout final de iOS depende de app nativa operativa.
7. Metricas:
   - `npm run test:api` -> PASS (28 tests, contratos API incluyendo `api/chat`).
   - Implementacion App Check web -> completada (hook/env/tipado), rollout staging pendiente.
   - App Store preflight -> PASS con evidencia ampliada (ruta in-app Community Guidelines + permisos `Info.plist`).
   - App Store preflight -> merge de `.env.local + .env.example` para reducir falsos WARN de configuracion.
   - `npm run gate:appstore:submit` -> FAIL controlado con 2 bloqueos reales (SIWA habilitado + credenciales review productivas).
   - `npm run lint` -> PASS.
   - `npm run typecheck` -> PASS.
   - `npm run build` -> PASS.
   - `npm run gate:appstore` -> PASS baseline.
   - Pendiente de corrida de staging App Check (monitor mode + enforcement).
8. Decisiones tecnicas:
   - App Check se despliega por fases, nunca en big-bang de produccion.
9. Proximo paso:
   - Ejecutar Fase 0/1 de `docs/ios-app-check-rollout-plan.md` en staging.

## Actualizacion consolidada (2026-02-12)

1. Objetivo:
   - Reconciliar estado real vs estado documentado para evitar confusion en siguientes conversaciones.
2. Verificaciones ejecutadas:
   - `npm run validate` -> PASS.
   - `npm run preflight:appstore` -> PASS (44 PASS / 0 WARN / 0 FAIL).
   - `npm run gate:appstore:submit` -> PASS (17 PASS / 0 WARN / 0 FAIL).
   - `npm run test:rules` -> PASS (36 tests).
   - `npm run test:delete-account:harness` -> PASS.
3. Cambio de estado clave:
   - Membresia Apple Developer: activa.
   - Configuracion SIWA (Apple + Firebase): completada en baseline web/compliance.
4. Punto actual del plan:
   - Semanas 0-3: completadas en baseline.
   - Semana 4: COMPLETADA (base iOS nativa en Mac/Xcode + Firebase + login tecnico).
   - Semana 5: COMPLETADA (shell navegable + UI kit base + logging sin PII).
   - Siguiente fase activa: Semana 6 (auth productivo I).
5. Bloqueos reales vigentes:
   - Signing/provisioning y pruebas en iPhone real (SIWA nativo, push, camara, haptics).
   - Cierre manual App Store Connect (labels/age rating/screenshots/review notes finales).
   - App Check rollout en staging (sigue desactivado por defecto).
6. Proximo paso operativo:
   - Ejecutar Semana 6: Email/password + Google Sign-In nativo + persistencia de sesion.

## Actualizacion consolidada (2026-02-13)

1. Punto actual del plan:
   - Semana 6: COMPLETADA (auth productivo I).
   - Siguiente fase activa: Semana 7 (Apple Sign-In nativo).
2. Progreso Semana 6 (simulador, env `dev`):
   - Email/password: `Sign in` + `Create account` funcionando.
   - `Forgot password`: UI implementado.
   - Logout: funcionando (Ajustes -> Sign out).
   - Google Sign-In nativo: flujo iOS + Firebase Auth validado end-to-end (prompt sistema + selector de cuenta + retorno a app).
   - Firebase en app: `configured` en pantalla de auth.
   - Persistencia de sesion: validada tras `Stop -> Run`.
3. Pendiente Semana 6:
   - Sin pendientes funcionales para cierre de Semana 6.
4. Proximo paso operativo:
   - Iniciar Semana 7: Sign in with Apple nativo (productivo, no placeholder).

## Actualizacion consolidada (2026-02-13, cierre Semana 7)

1. Punto actual del plan:
   - Semana 7: COMPLETADA (Apple Sign-In nativo).
   - Siguiente fase activa: Semana 8 (compliance iOS I).
2. Progreso Semana 7:
   - Boton Apple nativo habilitado en login (`SignInWithAppleButton`).
   - Nonce + SHA-256 implementados para flujo Firebase (`AuthGateView`).
   - Integracion Firebase Auth `apple.com` en repositorio (`AuthRepo`, `AuthViewModel`).
   - Manejo de cancelacion de flujo Apple sin bloquear login (`Apple Sign-In canceled`).
   - Flujo SIWA validado en simulador (inicio, retorno a app, sesion activa).
   - Persistencia de sesion validada tras reinicio (`Stop -> Run`).
   - Logout validado (Ajustes -> Sign out).
3. Pendiente Semana 7:
   - Sin pendientes bloqueantes para cierre de la semana.
   - Pruebas de edge cases en dispositivo real (relay email, relogin, unlink/relink) movidas a hardening operativo de Semana 8+.
4. Proximo paso operativo:
   - Iniciar Semana 8: legal/compliance in-app + consentimiento IA persistente.

## Actualizacion consolidada (2026-02-13, cierre Semana 8)

1. Punto actual del plan:
   - Semana 8: COMPLETADA (compliance iOS I).
2. Avance implementado:
   - `Settings` ahora incluye seccion legal con links a Privacy/Terms/Community Guidelines/Support.
   - Contacto visible por email para soporte y seguridad.
   - Toggle de consentimiento IA conectado a Firestore (`users/{uid}.settings.ai`), con lectura y escritura server-side.
   - Estado de consentimiento (`Aceptado`/`Pendiente`) visible en pantalla.
3. Evidencia tecnica:
   - `ios-native/VinctusNative/Sources/SettingsView.swift`
   - `ios-native/VinctusNative/Sources/SettingsViewModel.swift`
   - `ios-native/VinctusNative/Sources/AIConsentRepo.swift`
   - `ios-native/VinctusNative/Sources/LegalConfig.swift`
4. Validacion tecnica:
   - `./scripts/run-ios-dev.sh` -> PASS (build/install/launch en simulador).
5. Pendiente para cierre Semana 8:
   - Sin pendientes bloqueantes para cierre de la semana.
6. Proximo paso operativo:
   - Iniciar Semana 9: delete account end-to-end en iOS (Compliance II).

## Actualizacion consolidada (2026-02-13, inicio Semana 9)

1. Punto actual del plan:
   - Semana 9: EN PROGRESO (Compliance iOS II: delete account).
2. Avance implementado:
   - Nuevo repositorio iOS para Functions de delete account (`requestAccountDeletion`, `getAccountDeletionStatus`, fallback `deleteUserAccount`).
   - `Settings` incorpora `Zona de riesgo` con:
     - estado de borrado (`not_requested/queued/processing/completed/failed`);
     - confirmacion por texto (`ELIMINAR`);
     - refresh manual + polling automatico durante `queued/processing`;
     - accion de cierre de sesion cuando aplica.
3. Evidencia tecnica:
   - `ios-native/VinctusNative/Sources/DeleteAccountRepo.swift`
   - `ios-native/VinctusNative/Sources/SettingsViewModel.swift`
   - `ios-native/VinctusNative/Sources/SettingsView.swift`
4. Validacion tecnica:
   - `./scripts/run-ios-dev.sh` -> PASS (build/install/launch en simulador).
5. Pendiente para cierre Semana 9:
   - Validar en simulador/dispositivo flujo completo de solicitud y evolucion de estado.
   - Verificar evidencia backend de borrado sin residuos (harness + validacion manual).
6. Proximo paso operativo:
   - Cerrar validacion funcional de Semana 9 y pasar a Semana 10 (Read path I: Feed).

## Actualizacion consolidada (2026-02-13, cierre Semana 9)

1. Punto actual del plan:
   - Semana 9: COMPLETADA (Compliance iOS II: delete account).
   - Siguiente fase activa: Semana 10 (Read path I: Feed).
2. Resultado funcional:
   - Flujo iOS de delete account funcionando en Settings/Danger Zone:
     - solicitud de borrado;
     - seguimiento de estado (`not_requested`, `queued`, `processing`, `completed`, `failed`);
     - fallback legacy (`deleteUserAccount`);
     - cierre de sesion cuando aplica.
3. Evidencia tecnica:
   - `ios-native/VinctusNative/Sources/DeleteAccountRepo.swift`
   - `ios-native/VinctusNative/Sources/SettingsViewModel.swift`
   - `ios-native/VinctusNative/Sources/SettingsView.swift`
4. Validacion tecnica:
   - `./scripts/run-ios-dev.sh` -> PASS (build/install/launch).
5. Nota operativa:
   - Dependencia local resuelta: instalado JDK 21 para emuladores Firebase.
   - `npm run test:delete-account:harness` -> PASS en este host.
6. Proximo paso operativo:
   - Iniciar Semana 10: feed read path con paginacion/estados y control de costo de reads.

## Actualizacion consolidada (2026-02-13, inicio Semana 10)

1. Punto actual del plan:
   - Semana 10: EN PROGRESO (Read path I: Feed).
2. Avance implementado:
   - `FeedRepo` migrado a paginacion por cursor (`createdAt + documentID`) con `limit + 1`.
   - `FeedViewModel` ahora maneja estados separados:
     - carga inicial;
     - refresh;
     - carga de siguiente pagina;
     - error de paginacion.
   - `FeedView` actualizado con:
     - skeleton inicial;
     - estado vacio;
     - estado error con reintento;
     - carga incremental al llegar al final;
     - indicador visual cuando datos provienen de cache.
3. Evidencia tecnica:
   - `ios-native/VinctusNative/Sources/FeedRepo.swift`
   - `ios-native/VinctusNative/Sources/FeedViewModel.swift`
   - `ios-native/VinctusNative/Sources/FeedView.swift`
4. Validacion tecnica:
   - `./scripts/run-ios-dev.sh` -> PASS (build/install/launch).
5. Pendiente para cierre Semana 10:
   - Validar scroll largo y transicion entre paginas en simulador/dispositivo.
   - Medir baseline de reads por usuario para control de costo.
6. Proximo paso operativo:
   - Cerrar Semana 10 con evidencia funcional y pasar a Semana 11 (Profile/Discover read path).

## Actualizacion consolidada (2026-02-13, cierre Semana 10)

1. Punto actual del plan:
   - Semana 10: COMPLETADA (Read path I: Feed).
   - Siguiente fase activa: Semana 11 (Read path II: Profile/Discover).
2. Resultado funcional:
   - Feed nativo con paginacion operativa y estados robustos:
     - carga inicial + skeleton;
     - estado vacio;
     - estado error con reintento;
     - carga incremental al final;
     - pull-to-refresh funcional;
     - banner de cache cuando aplica.
3. Ajustes tecnicos de cierre:
   - Fix de scroll infinito via footer trigger adicional de paginacion.
   - Fix de refresh/top spacing migrando el feed a `List` con `.refreshable`.
   - Cursor de paginacion estable basado en `QueryDocumentSnapshot`.
4. Evidencia tecnica:
   - `ios-native/VinctusNative/Sources/FeedRepo.swift`
   - `ios-native/VinctusNative/Sources/FeedViewModel.swift`
   - `ios-native/VinctusNative/Sources/FeedView.swift`
5. Validacion tecnica:
   - `./scripts/run-ios-dev.sh` -> PASS (build/install/launch).
   - Validacion manual de QA iOS -> PASS (confirmada por usuario).
6. Proximo paso operativo:
   - Iniciar Semana 11: read path de Profile/Discover.

## Actualizacion consolidada (2026-02-13, inicio Semana 11)

1. Punto actual del plan:
   - Semana 11: EN PROGRESO (Read path II: Profile/Discover).
2. Avance implementado:
   - Repositorio de perfil con fallback `users -> users_public` para soportar casos de permisos.
   - Discover nativo con:
     - sugeridos recientes (`users_public` por `updatedAt`);
     - busqueda por prefijo (`displayNameLowercase`);
     - estados loading/vacio/error y retry.
   - Navegacion de perfil integrada en:
     - tab Discover;
     - autor desde cada card de Feed.
3. Evidencia tecnica:
   - `ios-native/VinctusNative/Sources/ProfileRepo.swift`
   - `ios-native/VinctusNative/Sources/ProfileViewModel.swift`
   - `ios-native/VinctusNative/Sources/ProfileView.swift`
   - `ios-native/VinctusNative/Sources/DiscoverRepo.swift`
   - `ios-native/VinctusNative/Sources/DiscoverViewModel.swift`
   - `ios-native/VinctusNative/Sources/DiscoverView.swift`
   - `ios-native/VinctusNative/Sources/MainTabView.swift`
   - `ios-native/VinctusNative/Sources/FeedView.swift`
4. Validacion tecnica:
   - Regeneracion de proyecto: `xcodegen generate`.
   - `./scripts/run-ios-dev.sh` -> PASS (build/install/launch).
5. Pendiente para cierre Semana 11:
   - QA manual de flujo completo: Discover -> Perfil ajeno, Feed -> Perfil autor, Mi perfil.
   - Confirmar estados de error/cache en red inestable.
6. Proximo paso operativo:
   - Cerrar Semana 11 con evidencia funcional y pasar a Semana 12 (Groups + offline base).

## Actualizacion consolidada (2026-02-13, cierre Semana 11)

1. Punto actual del plan:
   - Semana 11: COMPLETADA (Read path II: Profile/Discover).
   - Siguiente fase activa: Semana 12 (Read path III: Groups + offline base).
2. Resultado funcional:
   - Discover operativo con sugeridos + busqueda por prefijo.
   - Perfil propio y ajeno operativo.
   - Navegacion estable:
     - Discover -> perfil;
     - Feed (autor) -> perfil.
3. Evidencia tecnica:
   - `ios-native/VinctusNative/Sources/ProfileRepo.swift`
   - `ios-native/VinctusNative/Sources/ProfileViewModel.swift`
   - `ios-native/VinctusNative/Sources/ProfileView.swift`
   - `ios-native/VinctusNative/Sources/DiscoverRepo.swift`
   - `ios-native/VinctusNative/Sources/DiscoverViewModel.swift`
   - `ios-native/VinctusNative/Sources/DiscoverView.swift`
   - `ios-native/VinctusNative/Sources/MainTabView.swift`
   - `ios-native/VinctusNative/Sources/FeedView.swift`
4. Validacion tecnica:
   - `xcodegen generate` -> PASS.
   - `./scripts/run-ios-dev.sh` -> PASS (build/install/launch).
   - Validacion manual QA iOS (usuario): PASS.
5. Proximo paso operativo:
   - Iniciar Semana 12: read path de Groups + base offline.

## Actualizacion consolidada (2026-02-13, inicio Semana 12)

1. Punto actual del plan:
   - Semana 12: EN PROGRESO (Read path III: Groups + offline base).
2. Avance implementado:
   - Repositorio de grupos con lectura server-first y fallback a cache (`groups`, `posts`, `members`).
   - Lista de grupos y detalle de grupo en iOS con estados loading/vacio/error/retry.
   - Indicadores de estado online/offline y origen de datos (cache).
   - Reconexion automatica para refrescar datos al volver red.
   - Entrada a Groups integrada desde Discover (`Explorar grupos`).
3. Evidencia tecnica:
   - `ios-native/VinctusNative/Sources/GroupsRepo.swift`
   - `ios-native/VinctusNative/Sources/GroupViewModel.swift`
   - `ios-native/VinctusNative/Sources/GroupView.swift`
   - `ios-native/VinctusNative/Sources/ConnectivityMonitor.swift`
   - `ios-native/VinctusNative/Sources/DiscoverView.swift`
   - `ios-native/VinctusNative/Sources/MainTabView.swift`
4. Validacion tecnica:
   - Regeneracion de proyecto: `xcodegen generate`.
   - `./scripts/run-ios-dev.sh` -> PASS (build/install/launch).
5. Pendiente para cierre Semana 12:
   - QA manual de modo avion en Groups (lista y detalle).
   - Verificar reconexion y banner de cache en transicion offline -> online.
6. Proximo paso operativo:
   - Cerrar Semana 12 y pasar a Semana 13 (Create path I: Post).

## Actualizacion consolidada (2026-02-13, inicio tecnico Semana 13)

1. Punto actual del plan:
   - Semana 12 sigue EN PROGRESO (QA offline/reconexion pendiente de cierre).
   - Semana 13 iniciada en paralelo tecnico para Create path I.
2. Avance implementado en Semana 13:
   - Nuevo create repo para publicar texto en `posts` con flujo compatible de reglas (`uploading -> ready`).
   - Validaciones cliente:
     - texto obligatorio;
     - maximo 5000 caracteres.
   - Guardas anti-duplicado:
     - bloqueo de envio concurrente;
     - reuso de `postId` para reintentos del mismo borrador.
   - Nueva pantalla `Crear` conectada al `TabView`.
3. Evidencia tecnica:
   - `ios-native/VinctusNative/Sources/CreatePostRepo.swift`
   - `ios-native/VinctusNative/Sources/CreatePostViewModel.swift`
   - `ios-native/VinctusNative/Sources/CreatePostView.swift`
   - `ios-native/VinctusNative/Sources/MainTabView.swift`
4. Validacion tecnica:
   - `xcodegen generate` -> PASS.
   - `./scripts/run-ios-dev.sh` -> PASS (build/install/launch).
5. Pendiente para cierre Semana 13:
   - QA manual de publicacion real en Firestore desde simulador.
   - Confirmar comportamiento de reintento ante fallo de red.
6. Proximo paso operativo:
   - Completar QA de Semana 12 (offline/reconexion) y cierre funcional de Semana 13 (crear post texto).

## Actualizacion consolidada (2026-02-13, cierre Semana 12)

1. Punto actual del plan:
   - Semana 12: COMPLETADA (Read path III: Groups + offline base).
2. Resultado funcional:
   - Lista y detalle de grupos funcionando.
   - Fallback de cache local activo en modo offline.
   - Refresco por reconexion implementado.
3. Evidencia tecnica:
   - `ios-native/VinctusNative/Sources/GroupsRepo.swift`
   - `ios-native/VinctusNative/Sources/GroupViewModel.swift`
   - `ios-native/VinctusNative/Sources/GroupView.swift`
   - `ios-native/VinctusNative/Sources/ConnectivityMonitor.swift`
4. Validacion tecnica:
   - `./scripts/run-ios-dev.sh` -> PASS (build/install/launch).
   - Validacion manual QA iOS (usuario): PASS.
5. Proximo paso operativo:
   - Cerrar Semana 13 y arrancar Semana 14.

## Actualizacion consolidada (2026-02-13, cierre Semana 13)

1. Punto actual del plan:
   - Semana 13: COMPLETADA (Create path I: Post texto).
2. Resultado funcional:
   - Tab `Crear` activo en shell.
   - Publicacion de texto operativa en Firestore.
   - Guardas anti-duplicado aplicadas (bloqueo de envio concurrente + reuso de `postId` en reintentos).
3. Evidencia tecnica:
   - `ios-native/VinctusNative/Sources/CreatePostRepo.swift`
   - `ios-native/VinctusNative/Sources/CreatePostViewModel.swift`
   - `ios-native/VinctusNative/Sources/CreatePostView.swift`
   - `ios-native/VinctusNative/Sources/MainTabView.swift`
4. Validacion tecnica:
   - `./scripts/run-ios-dev.sh` -> PASS (build/install/launch).
   - Validacion manual QA iOS (usuario): PASS.
5. Proximo paso operativo:
   - Iniciar Semana 14 (comentarios + media).

## Actualizacion consolidada (2026-02-13, inicio Semana 14)

1. Punto actual del plan:
   - Semana 14: EN PROGRESO (Create path II: media/comment).
2. Avance implementado:
   - Comentarios nativos integrados en iOS:
     - lectura de comentarios por post;
     - creacion de comentarios con snapshot de autor;
     - detalle de post accesible desde Feed (`Ver detalle` / icono de comentario).
   - Composer de comentarios con validaciones de longitud (<=1000).
3. Evidencia tecnica:
   - `ios-native/VinctusNative/Sources/PostCommentsRepo.swift`
   - `ios-native/VinctusNative/Sources/PostDetailViewModel.swift`
   - `ios-native/VinctusNative/Sources/PostDetailView.swift`
   - `ios-native/VinctusNative/Sources/FeedView.swift`
4. Validacion tecnica:
   - `xcodegen generate` -> PASS.
   - `./scripts/run-ios-dev.sh` -> PASS (build/install/launch).
5. Pendiente para cierre Semana 14:
   - QA manual comentario real (crear + refrescar + contador).
   - Iniciar media upload nativo (camara/galeria + pipeline).
6. Proximo paso operativo:
   - Cerrar bloque de comentarios y avanzar a media upload.
