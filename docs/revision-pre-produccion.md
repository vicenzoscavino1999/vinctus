# Revisión transversal pre-producción (PR #128)

Estado: **implementación y CI en verde** (pendiente despliegue coordinado y validación en dispositivo real).  
Rama / PR: `fix/pre-prod-hardening` -> `fix/account-security` ([PR #128](https://github.com/vicenzoscavino1999/vinctus/pull/128)).  
Commit de código verificado: `d8706f0`.

Esta revisión cubre los **4 frentes transversales** fuera de los 10 módulos principales antes de pasar a producción (`vinctus-daf32` / `vinctus.vercel.app`).

---

## 1. Features web extra (`notifications`, `projects`, `collaborations`, `events`, `help`, `legal` y `public/*.html`)

### Hallazgos y correcciones aplicadas

- **Bandeja de notificaciones (`src/features/notifications/pages/NotificationsPage.tsx`)**:
  - Se filtran usuarios bloqueados (`getBlockedUsers`) en **todas** las vistas: solicitudes de colaboración, solicitudes de seguimiento, solicitudes de grupo y feed de actividad (antes solo se filtraban solicitudes de grupo).
  - Se agregó bloqueo anti doble clic (`collabActionLoading`) en aceptar/rechazar solicitudes de colaboración y manejo separado de `getOrCreateDirectConversation` para que, si aún no existe seguimiento/amistad mutua, la solicitud aceptada se retire de la lista con un aviso claro en lugar de fallar en pantalla.
  - Se añadieron guardas de secuencia monotónica por loader (`requestsSeqRef`, `groupSeqRef`, `followSeqRef`, `activitySeqRef`), dependencias estables por `user?.uid`, limpieza completa al cerrar sesión y botones de **Reintentar** ante errores.
- **Proyectos, colaboraciones y encuentros (`src/features/projects/pages/ProjectsPage.tsx`, `src/features/collaborations/`, `src/features/events/`)**:
  - Filtrado de colaboraciones y encuentros de usuarios bloqueados, reinicio de `requestedIds` al cambiar de cuenta, guardas de secuencia y botones de **Reintentar**.
  - `ProjectsPage` deja de llamar a `getEventAttendeeCount` cuando no hay sesión autenticada (las reglas de `events/{eventId}/attendees` requieren `isAuthenticated()`) y evita reintentos en bucle usando `Promise.allSettled` + seguimiento de IDs consultados.
  - `EventDetailModal`: reemplazo de `window.confirm` bloqueante por confirmación inline, control de **Aforo completo** según `capacity`, scroll interno en viewports pequeños y cierre seguro con `Escape`.
  - `CreateEventModal`: limpieza de mensajes de error técnicos (ya no expone avisos internos sobre reglas de Firestore).
  - `CollaborationDetailModal`, `CreateCollaborationModal`, `CollaborationRequestModal`: scroll `max-h-[90vh]`, cierre con `Escape`, `role="dialog" aria-modal="true"`, recorte de `fromUserName` a 80 caracteres y mensajes amigables ante `PERMISSION_DENIED`.
  - Alineación de esquemas Zod con `firestore.rules`: `events` (`city <= 80`, `venue <= 120`), `collaborations` (`fromUserName <= 80`), `help` (`appVersion <= 40`).
- **Reglas de Firestore (`firestore.rules`)**:
  - `isValidCollaborationRequestUpdate()` ahora exige `resource.data.status == 'pending'` (impide revertir solicitudes ya decididas) y exige `!isConversationBlocked(...)` solo al aceptar (`status == 'accepted'`), permitiendo rechazar solicitudes pendientes de usuarios bloqueados y eliminar colaboraciones sin fallo de lote.
  - Se acotó la longitud de `coverUrl` en `events` y `fromUserPhoto` en `collaboration_requests` (`<= 600`).
- **Ayuda, legal y páginas estáticas (`src/features/help/`, `src/features/legal/`, `src/shared/constants/legal.ts`, `public/privacy.html`)**:
  - **Corrección crítica para App Store Review en `public/privacy.html`**: se corrigió la contradicción que afirmaba que la app de iPhone no accedía al micrófono (cuando `Info.plist` declara `NSMicrophoneUsageDescription` para notas de voz en el chat), detallando además el acceso bajo demanda a fototeca y el uso opcional de OpenAI en el chat web.
  - Sincronización de las páginas React internas (`/legal/privacy`, `/legal/terms`, `/legal/community-guidelines`) con `public/*.html` (edad mínima 13+, retención `<= 30 días`, permisos de iOS, SLA de moderación y ortografía en español).
  - `LEGAL_LINKS` usa rutas relativas del mismo origen (`/privacy.html`, `/terms.html`, `/community-guidelines.html`, `/support.html`) como fallback cuando no se definen variables `VITE_*_URL`, evitando enlaces rotos entre staging, previews y producción.
  - `HelpPage` navega internamente a `/legal/privacy`, `/legal/terms` y `/legal/community-guidelines`, corrige la ruta del FAQ de eliminación de cuenta y agrega `aria-expanded`.
  - `SupportModal`: reemplaza `window.open('mailto:...', '_blank')` por enlaces `<a href="mailto:...">`, actualiza `APP_VERSION` de `v0.0.2-alpha` a `web-1.0.0` y bloquea cierre accidental durante el envío.

---

## 2. Firebase App Check en iOS nativo (modo monitoreo)

- Se agregó el producto `FirebaseAppCheck` a `ios-native/VinctusNative/project.yml` (sin nuevas descargas SPM: `app-check` 11.2.0 ya estaba fijado en `Package.resolved`).
- Se creó `ios-native/VinctusNative/Sources/App/AppCheckBootstrap.swift`, invocado en `FirebaseBootstrap.configureIfPossible()` **antes** de `FirebaseApp.configure(options:)` únicamente cuando existe un `GoogleService-Info*.plist` válido (dejando los emuladores de `VinctusNativeIntegrationTests` y las corridas demo sin plist 100% intactos).
- Claves añadidas en `ios-native/VinctusNative/Resources/Info.plist`:
  - `VINCTUS_ENABLE_APP_CHECK = true`
  - `VINCTUS_APP_CHECK_PROVIDER = auto`
- Resolución en modo `auto`:
  - `DEBUG` o Simulator -> `AppCheckDebugProvider`.
  - Dispositivo real en `Release` -> `DeviceCheckProvider` (no requiere entitlements extra ni regenerar el provisioning profile `Vinctus AppStore CI`).
  - Ruta lista para escalar a `AppAttestProvider` (con fallback automático a `DeviceCheckProvider`) al definir `VINCTUS_APP_CHECK_PROVIDER = appAttest` una vez habilitado App Attest en Apple Developer Portal y en `VinctusNative.entitlements`.
- Adjunto **best-effort** del encabezado `X-Firebase-AppCheck` en `readPostMedia` tanto en iOS (`ProtectedPostMedia.swift`) como en web (`src/shared/lib/protected-post-media.ts`), sin bloquear descargas si el token no está disponible en modo monitoreo.
- **Recordatorio obligatorio**: **no activar Enforcement** en Firebase Console (`vinctus-staging` ni `vinctus-daf32`) hasta verificar tráfico verificado de web + iOS en el panel de métricas de App Check (ver [ios-app-check-rollout-plan.md](ios-app-check-rollout-plan.md)).

---

## 3. Rescate selectivo de `origin/testflight/vinctus-staging` y estabilidad de `ChatUITests`

### Cambios rescatados (seguros para producción)

- `.vercelignore`: excluye `.env*`, `**/.env*`, `**/*-debug.log`, `.firebase` y `.claude`.
- `public/icon-512.png`: reemplazado el archivo anterior (que era un JPEG de 1024×1024 renombrado a `.png`) por un PNG real de 512×512 válido para PWA y `apple-touch-icon`.
- `functions/src/arena/createDebate.ts`: vincula `secrets: ['GEMINI_API_KEY']` para usar Google Cloud Secret Manager en lugar de `.env` en texto plano.
  - **Acción previa obligatoria antes de desplegar Functions en `vinctus-daf32`**: ejecutar `firebase functions:secrets:set GEMINI_API_KEY --project vinctus-daf32`.
- Infraestructura multi-entorno de TestFlight (aislada por `AppEnvironment.current == .staging` y `release_target=staging`): `.github/workflows/ios-native.yml`, `scripts/release-ios-testflight.sh`, `project.yml` (`ReleaseStaging`), `FirebaseBootstrap.swift`, `AuthGateView.swift`, `LegalConfig.swift` y `docs/testflight-sin-mac.md`.
- `vercel.json`: rescatado `"git": { "deploymentEnabled": { "testflight/vinctus-staging": false } }` **manteniendo intactos** los rewrites de producción hacia `https://vinctus-daf32.firebaseapp.com`.

### Corrección del fallo en `iOS screenshots` (`44835633335`)

- Diagnóstico forense de la evidencia exportada (`chat-ui-evidence`): en `ChatUITests/testVoiceRecordingProducesAnAttachmentForPreview()`, el toque inicial sobre `"Grabar nota de voz"` (área de 23×27.7 pt) se perdió durante la animación de cierre de la barra inferior tras navegar desde la lista; ni SpringBoard ni `Terminar` llegaron a mostrarse.
- Corrección:
  - En `ConversationView.swift` se amplió el área táctil mínima de los botones de micrófono y adjuntos a `36×36` con `.contentShape(Rectangle())`.
  - En `ChatUITests.swift` se espera a que la barra de pestañas desaparezca (`Perfil` inexistente) y a que el botón de micrófono sea `hittable` y `enabled`, con reintento único seguro si el toque coincide con el final de la transición y soporte ampliado de etiquetas de alerta de permisos.

---

## 4. Seguridad Web/PWA (`vercel.json`, `index.html`, `vite.config.ts`, `api.ts`)

- Se agregó una cabecera `Content-Security-Policy` en `vercel.json` compatible con Firebase Auth/Firestore/Storage/Functions, Google/Apple Sign-In, reCAPTCHA/App Check, `heic2any` (jsDelivr + Web Workers `blob:`), Google Fonts, embeds de YouTube y Google Maps (`EventDetailModal`) y APIs de Descubrir, sin `'unsafe-inline'` ni `'unsafe-eval'` en `script-src`.
- Se eliminó el manejador inline `onload="this.media='all'"` de `index.html` para compatibilidad estricta con `script-src`.
- Se eliminó la regla obsoleta de Workbox para `api.allorigins.win` en `vite.config.ts` y el proxy CORS de terceros por defecto en `src/shared/lib/api.ts` (quedando solo opt-in mediante `VITE_CORS_PROXY` para desarrollo local).
- Se amplió `navigateFallbackDenylist` en `vite.config.ts` para excluir `/api/*` y las páginas legales estáticas (`/privacy`, `/terms`, `/community-guidelines`, `/support`) del fallback SPA del Service Worker.

---

## 5. Verificación automatizada (commit `d8706f0`)

- **Local**:
  - `npm.cmd run functions:build`, `npm.cmd run typecheck`, `npx.cmd eslint src functions e2e scripts api`, `check:cycles`, `check:stubs`, `check:raw-onsnapshot`, `contract:check`: **PASS**.
  - `npm.cmd run test:api`: **16 archivos / 113 pruebas** en verde.
  - `npm.cmd run test:run`: **86 archivos / 579 pruebas** en verde (incluye nuevas suites `NotificationsPage.test.tsx`, `ProjectsPage.test.tsx`, `SupportModal.test.tsx` y cobertura de `X-Firebase-AppCheck` en `protected-post-media.test.ts`).
  - `npm.cmd run build`, `node scripts/app-store-preflight.mjs --skip-url-checks` (`PASS: 34 | WARN: 1 | FAIL: 0`), `npm.cmd run preflight:appcheck` (`PASS: 2 | WARN: 1 | FAIL: 0`): **PASS**.
- **GitHub Actions y Vercel en PR #128 (`d8706f0`)**:
  - `CI` (`44916643247`): **PASS** (`lint`, `typecheck`, `cost-gates`, `test`, `rules` **3 archivos / 95 pruebas**, `post-counts`, `build`, `e2e` **20 passed**, `lhci`).
  - `iOS native` PR (`44916643270`) y push (`44916639307`): **PASS** (`ReleaseProd` con `FirebaseAppCheck`, unit tests con `AppCheckBootstrapTests`, e `ios-native-integration` **passed: 45, failed: 0**).
  - `iOS screenshots` (`44916639285`): **PASS** (`ChatUITests` **3 passed / 0 failed** en `iPhone 17 Pro` iOS 26.4.1 + 13 capturas).
  - `Vercel` Preview: **PASS**.
