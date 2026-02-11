# App Store Readiness Tracker - Vinctus

Fecha base: 2026-02-11
Objetivo: concentrar checklist por guideline de Apple y evidencia tecnica.

## Estado global

- Fase 1 (legal/transparencia): avanzado
- Fase 2 (Apple Sign-In): parcial (codigo listo, falta config Apple/Firebase)
- Fase 3 (delete account v2): avanzado baseline (job + harness + UI con estado y polling)
- Fase 4 (UGC moderation): avanzado baseline (filtro cliente/server + SLA + reportes user/group/post/comment + cola + panel admin minimo)
- Fase 5 (AI compliance): avanzado baseline (disclosure + consentimiento local/server + enforcement backend)
- Fase 6+ (iOS nativa/ASC): parcial baseline (track iOS nativa activo; track Capacitor congelado para release, falta firma/APNs/TestFlight)

## Gate submit (estado actual automatizado)

- Ultima referencia: `npm run gate:appstore:submit`
- Resultado: FAIL controlado con 2 bloqueos reales restantes (sin warnings)

1. `Submit mode requires Apple Sign-In enabled` (`VITE_ENABLE_APPLE_SIGN_IN=true` solo cuando SIWA este operativo en Apple/Firebase).
2. `Generated review artifacts contain placeholders` (definir `REVIEW_PROD_EMAIL` + `REVIEW_PROD_PASSWORD` y regenerar `npm run review:package`).

## Checklist por guideline

## 1.2 - User Generated Content

1. Filtro preventivo automatizado
   - Estado: parcial-alto
   - Evidencia: `src/shared/lib/contentModeration.ts`, `functions/src/moderation.ts`, `functions/src/index.ts`
2. Reporte de abuso
   - Estado: completo baseline
   - Evidencia: `src/features/chat/components/GroupReportModal.tsx`, `src/features/chat/pages/ConversationDetailsPage.tsx`, `src/features/posts/components/PostCommentsModal.tsx`, `src/features/posts/components/ContentReportModal.tsx`, `src/shared/lib/firestore/reports.ts`
3. Cola de moderacion operativa
   - Estado: completo baseline
   - Evidencia: `functions/src/index.ts` (`onReportCreatedQueue`)
4. Panel de moderacion admin
   - Estado: completo baseline
   - Evidencia: `src/features/moderation/pages/ModerationQueuePage.tsx`, `src/features/moderation/api/queries.ts`, `src/features/moderation/api/mutations.ts`, `firestore.rules`
   - Operacion: crear `app_admins/{uid}` en Firestore para habilitar acceso al panel `/moderation`
5. Bloqueo de usuarios
   - Estado: completo
   - Evidencia: `src/features/chat/api/mutations.ts`
6. Contacto visible para soporte/seguridad
   - Estado: completo
   - Evidencia: `src/features/help/pages/HelpPage.tsx`, `src/shared/constants/legal.ts`

## 4.8 - Sign in with Apple

1. Apple login visible en iOS cuando hay social login
   - Estado: parcial
   - Evidencia: `src/app/providers/AuthContext.tsx`, `src/features/auth/components/LoginScreen.tsx`
2. Config Apple Developer + Firebase provider
   - Estado: pendiente
   - Bloqueo: membresia Apple Developer activa
   - Guia: `docs/apple-sign-in-setup.md`

## Delete account requirement (App Review policy)

1. Flujo in-app para solicitar borrado
   - Estado: completo baseline
   - Evidencia: `src/features/settings/components/DeleteAccountModal.tsx`, `src/features/settings/api/deleteAccount.ts`
2. Borrado efectivo de datos del usuario
   - Estado: parcial-alto
   - Evidencia: `functions/src/deleteAccount.ts`
   - Avance: borrado recursivo de recursos propios (`posts`, `events`, `stories`) + limpieza de referencias de terceros (`users/*/savedPosts`, `users/*/likes`) y subcolecciones huérfanas
3. Idempotencia y prueba en emuladores
   - Estado: completo baseline
   - Evidencia: `scripts/delete-account-v2-harness.mjs`
   - Cobertura: incluye comentarios/likes de terceros sobre posts del usuario y subcolecciones de eventos/conversaciones
4. Estado de borrado visible en UI
   - Estado: completo baseline
   - Evidencia: `src/features/settings/components/DeleteAccountModal.tsx` (polling `getAccountDeletionStatus`)

## Legal and transparency

1. Privacy Policy / Terms visibles in-app
   - Estado: completo
   - Evidencia: `src/features/legal/pages/PrivacyPolicyPage.tsx`, `src/features/legal/pages/TermsOfServicePage.tsx`
   - Avance: login incluye links publicos a privacy/terms/community/support para transparencia pre-auth (`src/features/auth/components/LoginScreen.tsx`)
2. URLs publicas productivas
   - Estado: parcial-alto
   - Evidencia: `public/privacy.html`, `public/terms.html`, `public/community-guidelines.html`, `public/support.html`, `vercel.json`
3. Community Guidelines
   - Estado: completo baseline
   - Evidencia: `src/features/legal/pages/CommunityGuidelinesPage.tsx`, `src/features/settings/pages/SettingsPage.tsx`, `src/features/help/pages/HelpPage.tsx`, `public/community-guidelines.html`

## AI transparency

1. Disclosure de proveedor y datos
   - Estado: completo baseline
   - Evidencia: `src/shared/constants/legal.ts`, `src/features/ai/pages/AIChatPage.tsx`, `src/features/arena/pages/ArenaPage.tsx`
2. Consentimiento explicito
   - Estado: completo baseline
   - Evidencia: `src/shared/lib/aiConsent.ts`, `src/shared/lib/firestore/aiConsent.ts`, `src/features/settings/pages/SettingsPage.tsx`
3. Opt-out persistente server-side
   - Estado: completo baseline
   - Evidencia: `src/features/settings/api/aiConsent.ts`, `api/chat.ts`, `functions/src/arena/createDebate.ts`
4. Sanitizacion PII antes de enviar texto a proveedores IA
   - Estado: completo baseline
   - Evidencia: `api/chat.ts` (redaccion email/telefono en message + history), `functions/src/arena/createDebate.ts` (redaccion topic)

## 4.2 - Minimum functionality / app-like iOS

1. Capacitor + iOS project
   - Estado: completo baseline
   - Evidencia: `capacitor.config.ts`, `ios/`, `docs/capacitor-ios-setup.md`
2. Plugins nativos (push/camera/haptics)
   - Estado: completo baseline
   - Evidencia: `src/shared/lib/native/pushNotifications.ts`, `src/shared/lib/native/camera.ts`, `src/shared/lib/native/haptics.ts`, `src/features/settings/pages/SettingsPage.tsx`
3. Permisos iOS declarados en Info.plist
   - Estado: completo baseline
   - Evidencia: `ios/App/App/Info.plist` (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`, `NSMicrophoneUsageDescription`)
4. Evidencia de UX nativa estable
   - Estado: parcial
   - Bloqueo: pruebas en iPhone real y firma Xcode
   - Avance: safe-area hardening ampliado en overlays/modales principales de auth/chat/collab/collections/events/groups/posts/profile/discover, incluido panel de filtros (`src/features/discover/components/SearchFilters.tsx`)
   - Avance: accesibilidad baseline en botones icon-only de cierre/eliminacion con `aria-label` en modales principales y back actions clave (`src/features/settings/pages/SettingsPage.tsx`)
5. UX offline basica
   - Estado: completo baseline
   - Evidencia: `src/app/routes/AppLayout.tsx` (banner global "Sin conexion" con `online/offline events` y `aria-live`)

## App Store Connect package

1. Metadata draft
   - Estado: completo baseline
   - Evidencia: `docs/app-store-metadata-draft.md`
2. Review notes draft
   - Estado: completo baseline
   - Evidencia: `docs/app-review-notes-draft.md` (template), `docs/app-review-notes.generated.md` (render local con `REVIEW_PROD_*`)
3. Demo account
   - Estado: parcial-alto
   - Evidencia: `scripts/seed-app-review.mjs`, `package.json` (`seed:app-review`, `seed:app-review:emulators`), `docs/app-review-demo-account.md`
   - Pendiente: crear credenciales reales de review en entorno productivo antes de submit
4. Privacy labels + age rating
   - Estado: parcial-alto
   - Evidencia: `docs/app-store-privacy-age-rating-draft.md`
   - Pendiente: cargar respuestas finales directamente en App Store Connect con build real
5. Submission checklist operativo
   - Estado: completo baseline
   - Evidencia: `docs/app-store-submission-checklist.md`, `scripts/app-store-preflight.mjs`, `package.json` (`preflight:appstore`)
6. Review package compilado
   - Estado: completo baseline
   - Evidencia: `scripts/build-app-review-package.mjs`, `package.json` (`review:package`), `docs/app-review-package.generated.md`, `docs/app-review-notes.generated.md`
7. Gate automatizado de release
   - Estado: completo baseline
   - Evidencia: `scripts/app-store-release-gate.mjs`, `package.json` (`gate:appstore`, `gate:appstore:submit`)
