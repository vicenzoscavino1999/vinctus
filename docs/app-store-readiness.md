# App Store Readiness Tracker - Vinctus

Fecha base: 2026-02-11
Ultima actualizacion: 2026-02-13
Objetivo: concentrar checklist por guideline de Apple y evidencia tecnica real.

## Punto actual del plan maestro (hoy)

- Semanas 0-13 de migracion iOS nativa: completadas.
- Semana activa: Semana 14 (Create path II: media/comment) en progreso.
- Fases App Store 1-5 (legal/auth/delete account/moderacion/IA): completadas en baseline funcional.
- Bloqueadores vigentes para cierre App Store:
  1. Entorno Mac + Xcode + firma real.
  2. Pruebas en iPhone real (SIWA nativo, push/camara/haptics, safe areas).
  3. Carga final en App Store Connect (privacy labels, age rating, screenshots, review notes finales).
  4. Rollout App Check en staging/produccion (pendiente por estrategia gradual).

## Estado global por fase

- Fase 1 (legal/transparencia): completo baseline.
- Fase 2 (Sign in with Apple): completo baseline (Apple Developer + Firebase + flag/app visibles).
- Fase 3 (delete account v2): completo baseline (job async + status + idempotencia/harness).
- Fase 4 (UGC moderation): completo baseline (filtro + reportes + cola + panel admin).
- Fase 5 (AI compliance): completo baseline (disclosure + consentimiento + enforcement backend).
- Fase 6+ (iOS nativa/App Store Connect): parcial (en progreso, depende de Mac/Xcode/TestFlight).

## Gate submit (estado automatizado actual)

Ultima corrida: 2026-02-12

1. `npm run validate` -> PASS.
2. `npm run preflight:appstore` -> PASS (`44 PASS / 0 WARN / 0 FAIL`).
3. `npm run gate:appstore:submit` -> PASS (`17 PASS / 0 WARN / 0 FAIL`).
4. `npm run test:rules` -> PASS (36 tests).
5. `npm run test:delete-account:harness` -> PASS.

Nota operativa:

- `docs/app-review-notes.generated.md` ya inyecta credenciales de review desde `.env.local`.
- Antes del submit final en App Store Connect, confirmar que las credenciales de review productivas sigan activas.

## Checklist por guideline

## 1.2 - User Generated Content

1. Filtro preventivo automatizado
   - Estado: completo baseline
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
   - Estado: completo baseline
   - Evidencia: `src/features/chat/api/mutations.ts`
6. Contacto visible para soporte/seguridad
   - Estado: completo baseline
   - Evidencia: `src/features/help/pages/HelpPage.tsx`, `src/shared/constants/legal.ts`
   - Nota: hoy se usa correo temporal personal; recomendado migrar luego a correo dedicado.

## 4.8 - Sign in with Apple

1. Apple login visible cuando hay social login
   - Estado: completo baseline
   - Evidencia: `src/app/providers/AuthContext.tsx`, `src/features/auth/components/LoginScreen.tsx`, `.env.local` (`VITE_ENABLE_APPLE_SIGN_IN=true`)
2. Config Apple Developer + Firebase provider
   - Estado: completo baseline
   - Evidencia: `docs/apple-sign-in-setup.md`
   - Pendiente de cierre iOS nativo: validar flujo final en build firmada de iPhone real.

## Delete account requirement (App Review policy)

1. Flujo in-app para solicitar borrado
   - Estado: completo baseline
   - Evidencia: `src/features/settings/components/DeleteAccountModal.tsx`, `src/features/settings/api/deleteAccount.ts`
2. Borrado efectivo de datos del usuario
   - Estado: completo baseline
   - Evidencia: `functions/src/deleteAccount.ts`
3. Idempotencia y prueba en emuladores
   - Estado: completo baseline
   - Evidencia: `scripts/delete-account-v2-harness.mjs`
4. Estado de borrado visible en UI
   - Estado: completo baseline
   - Evidencia: `src/features/settings/components/DeleteAccountModal.tsx` (polling `getAccountDeletionStatus`)

## Legal and transparency

1. Privacy Policy / Terms visibles in-app
   - Estado: completo baseline
   - Evidencia: `src/features/legal/pages/PrivacyPolicyPage.tsx`, `src/features/legal/pages/TermsOfServicePage.tsx`
2. URLs publicas productivas
   - Estado: completo baseline
   - Evidencia: `public/privacy.html`, `public/terms.html`, `public/community-guidelines.html`, `public/support.html`, `vercel.json`
3. Community Guidelines visibles
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
   - Evidencia: `api/chat.ts`, `functions/src/arena/createDebate.ts`

## 4.2 - Minimum functionality / app-like iOS

1. Capacitor + iOS project base
   - Estado: completo baseline
   - Evidencia: `capacitor.config.ts`, `ios/`, `docs/capacitor-ios-setup.md`
2. Plugins nativos (push/camera/haptics)
   - Estado: completo baseline
   - Evidencia: `src/shared/lib/native/pushNotifications.ts`, `src/shared/lib/native/camera.ts`, `src/shared/lib/native/haptics.ts`, `src/features/settings/pages/SettingsPage.tsx`
3. Permisos iOS declarados en Info.plist
   - Estado: completo baseline
   - Evidencia: `ios/App/App/Info.plist` (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`, `NSMicrophoneUsageDescription`)
4. Evidencia UX nativa estable
   - Estado: parcial
   - Bloqueo: pruebas en iPhone real y firma Xcode
5. UX offline basica
   - Estado: completo baseline
   - Evidencia: `src/app/routes/AppLayout.tsx` (banner global "Sin conexion")

## App Store Connect package

1. Metadata draft
   - Estado: completo baseline
   - Evidencia: `docs/app-store-metadata-draft.md`
2. Review notes draft + generated
   - Estado: completo baseline
   - Evidencia: `docs/app-review-notes-draft.md`, `docs/app-review-notes.generated.md`
3. Demo account
   - Estado: parcial-alto
   - Evidencia: `scripts/seed-app-review.mjs`, `docs/app-review-demo-account.md`
   - Pendiente: crear/confirmar credenciales finales de review en entorno productivo al cierre.
4. Privacy labels + age rating
   - Estado: parcial-alto
   - Evidencia: `docs/app-store-privacy-age-rating-draft.md`
   - Pendiente: carga final en App Store Connect con build real.
5. Submission checklist operativo
   - Estado: completo baseline
   - Evidencia: `docs/app-store-submission-checklist.md`, `scripts/app-store-preflight.mjs`
6. Review package compilado
   - Estado: completo baseline
   - Evidencia: `scripts/build-app-review-package.mjs`, `docs/app-review-package.generated.md`
7. Gate automatizado de release
   - Estado: completo baseline
   - Evidencia: `scripts/app-store-release-gate.mjs`, `package.json` (`gate:appstore`, `gate:appstore:submit`)
