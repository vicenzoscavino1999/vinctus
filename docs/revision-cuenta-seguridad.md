# Revisión del módulo Cuenta y seguridad

Módulo revisado y corregido de extremo a extremo siguiendo el plan por módulos en [el documento general de revisión](revision-app-nativa.md), abarcando backend compartido (`firestore.rules`, `storage.rules`, `functions/`), web (`src`) y app nativa iOS (`ios-native/VinctusNative`).

## Resumen de cambios implementados

### 1. Backend compartido (`firestore.rules`, `storage.rules`, `functions/`, emuladores)

- **Bloqueos en Firestore y Storage (`firestore.rules`, `storage.rules`, `functions/src/followCounts.ts`)**:
  - Se añadieron comprobaciones `!isConversationBlocked(...)` en `isValidFriendRequestCreate`, `isValidFriendRequestUpdate`, `isValidCollaborationRequestCreate`, `isValidCollaborationRequestUpdate` e `isValidNotificationCreate`.
  - Se añadió `isDirectConversationDataBlocked(convData)` en `firestore.rules` y `storage.rules` para impedir actualizaciones sobre `conversations/{conversationId}`, escrituras en `conversations/{conversationId}/typing/{uid}` y subidas de adjuntos/miniaturas a Storage en DMs bloqueados.
  - Se amplió `cleanupFollowStateOnBlock` (`onUserBlockedCreated`) para eliminar también `friend_requests` en ambas direcciones y los índices `users/{uid}/directConversations/{dmId}` de ambos participantes.
- **Denuncias y moderación (`firestore.rules`, `functions/src/moderation.ts`, `functions/src/moderationActions.ts`, `functions/src/index.ts`)**:
  - Se endureció `isValidUserReportCreate` prohibiendo auto-denuncias (`data.reportedUid != request.auth.uid`) y acotando longitudes (`reportedUid <= 128`, `conversationId <= 240`).
  - Se exportaron `NON_USER_REPORT_IDS`, `inferQueueSource`, `inferQueuePriority` e `inferReportTargetType` en `functions/src/moderation.ts` para preservar `source: 'auto_moderation'` en reportes automáticos, escalar prioridad según `autoAction` (`removed` -> `high`, `flagged` -> `medium`) y clasificar denuncias de perfil sin `conversationId` como `targetType: 'user'`.
  - Se mejoró `clearLastMessagePreview` para limpiar vistas previas tanto por texto crudo/recortado como por `clientCreatedAt` (cubriendo mensajes solo con adjuntos), y se añadió `deleteMessageMedia` para borrar adjuntos y miniaturas en Storage al eliminar mensajes en `moderationTakeAction` y `onMessageCreatedModeration`.
- **Eliminación de cuenta (`functions/src/deleteAccount.ts`, `functions/src/deleteAccountHelpers.ts`)**:
  - Se aprovisionaron `onDeletionJobCreated` y `onDeletionJobUpdated` con `.runWith({ timeoutSeconds: 540, memory: '1GB' })`.
  - Se incorporó recuperación de jobs atascados en `processing` (`STALE_PROCESSING_MS = 15 min`) y saneado de `lastError` visible al cliente (`sanitizeDeletionErrorMessage` / `GENERIC_DELETION_FAILURE_MESSAGE`).
  - Se corrigió `deleteOwnedGroups` para limpiar membresías de otros miembros y `group_requests` **antes** de `db.recursiveDelete(groupDoc.ref)`.
  - Se completó la limpieza de `deleteOwnedArenaDebates` (eliminando referencias ajenas en `savedArenaDebates` y `likedArenaDebates`), `deleteDirectConversations` (borrando `users/{uid}/directConversations/{dmId}` de ambos lados), `deleteMessagesBySender` (limpiando `lastMessage` en conversaciones grupales restantes mediante `clearLastMessagePreview`), `deleteAiImageUsage` (`aiImageUsage/{day}/users/{uid}`) y registro saneado de fallo en `deleteUserAccount`.
- **Pruebas backend, reglas y emuladores**:
  - Ampliadas `functions/src/followCounts.test.ts` y `functions/src/moderation.test.ts`, y creada `functions/src/deleteAccountHelpers.test.ts`.
  - Ampliadas `src/tests/firestore-rules/firestore.rules.cases.ts` (auto-denuncia, límites de `reports`, `app_admins`, `moderation_queue`, `support_tickets` y bloqueos en solicitudes/notificaciones/DM/`typing`) y `src/tests/storage-rules/storage.rules.cases.ts` (denegación de adjuntos/miniaturas en DM bloqueado).
  - Creada `scripts/account-security.integration.test.mjs` conectada a `npm run test:post-counts:run` verificando en emuladores reales `onUserBlockedCreated`, `onReportCreatedQueue`, `moderationTakeAction` (eliminación de mensaje+adjunto+preview, suspensión/reactivación y rechazo a no-admin), `revokeUserSessions` y `requestAccountDeletion` extremo a extremo con borrado del usuario en Auth.

### 2. Web (`src`)

- **Acceso y recuperación (`src/app/providers/AuthContext.tsx`, `LoginScreen.tsx`, `PasswordResetActionScreen.tsx`)**:
  - `AuthContext`: normalización con `.trim()` en correos, supresión de `auth/user-not-found` en `resetPassword` (evitando enumeración de cuentas), envío best-effort de `sendEmailVerification` en `signUpWithEmail` para no interrumpir el bootstrap del perfil, límite de 120 caracteres en `displayName` y traducción de `auth/user-token-expired` y `auth/requires-recent-login`.
  - `LoginScreen`: guardas contra doble envío, limpieza de `successMessage` al editar el correo en recuperación, validaciones inline de celular (9 dígitos) y código SMS (6 dígitos), y `maxLength={120}` en nombre.
  - `PasswordResetActionScreen`: verificación inmediata de `oobCode` al montar (`verifyPasswordResetCode`), rechazo inmediato de enlaces inválidos/expirados antes de mostrar el formulario, correo resuelto en cabecera y manejo de `auth/user-disabled`.
- **Privacidad, usuarios bloqueados, sesiones y notificaciones (`src/shared/lib/firestore/profile.ts`, `src/features/settings/`)**:
  - `getUserSettings` propaga errores reales de Firestore en lugar de devolver valores por defecto (evitando mostrar como pública una cuenta privada cuando falla la lectura).
  - `SettingsPrivacySecurityPage`: estado de error con botón `Reintentar` sin renderizar switches falsos, nueva sección **Usuarios bloqueados** (`getBlockedUsersProfiles` / `unblockBlockedUser` con carga, vacío, error+reintento y guarda contra doble clic) y confirmación explícita antes de `revokeUserSessions`.
  - `SettingsNotificationsPage`: estado de error con `Reintentar` y guarda contra cargas obsoletas.
- **Perfiles, chat, moderación y eliminación de cuenta**:
  - `UserProfilePage` + `src/features/profile/api/`: nuevas acciones de **Bloquear** (con modal de confirmación) y **Reportar** (`reportUserProfile` + `ContentReportModal`), y mensaje diferenciado `"Has bloqueado a este usuario"` en lugar de `"Cuenta privada"`.
  - `ConversationDetailsPage`: reemplazo de iconos corruptos por `Ban`/`ShieldOff` de Lucide y guardas contra desmontaje y doble clic.
  - `ModerationQueuePage`: preservación de `item.reviewNote` al resolver/descartar sin editar la nota, pestañas de filtro por estado, badge `Auto-moderación`, botón `Reintentar`, guarda `loadSeqRef`, dependencia estable por `user?.uid` y ocultamiento de `"Suspender usuario"` sobre la propia cuenta.
  - `DeleteAccountModal` + `SettingsPage`: reinicio limpio al cerrar o cambiar `user?.uid`, guarda de secuencia, transición limpia a `completed` cuando el polling recibe `unauthenticated`/`user-token-expired` tras borrarse la cuenta en Auth, botón `"Actualizar estado"`, cierre con `Escape` y toast de error si falla `signOut`.
- **Pruebas web y E2E**:
  - Ampliadas `src/app/providers/AuthContext.test.tsx`, `src/features/profile/components/ProfileAndFollowFlows.test.tsx` y `src/test/setup.ts`.
  - Creadas `src/features/auth/components/PasswordResetActionScreen.test.tsx`, `src/features/settings/pages/SettingsPrivacySecurityPage.test.tsx`, `src/features/settings/components/DeleteAccountModal.test.tsx`, `src/features/moderation/pages/ModerationQueuePage.test.tsx` y el flujo E2E `e2e/account-security.spec.ts` (3 escenarios `@smoke`: login inválido + recuperación sin enumeración, denuncia/bloqueo en perfil + desbloqueo y toggle `Cuenta privada` persistido en Ajustes, y registro efímero + solicitud de eliminación con confirmación `ELIMINAR`).

### 3. App nativa iOS (`ios-native/VinctusNative`)

- **Privacidad, sesiones y eliminación de cuenta (`Sources/Settings/AccountSecurityRepo.swift`, `Sources/App/AppRepos.swift`, `Sources/Settings/SettingsViewModel.swift`, `SettingsView.swift`)**:
  - Nuevo `AccountSecurityRepo` / `FirebaseAccountSecurityRepo` con lectura de visibilidad, actualización atómica en lote (`users` y `users_public`) y revocación remota `revokeUserSessions`.
  - `SettingsViewModel` / `SettingsView`: toggle `Cuenta privada` con rollback y reintento ante error de carga, `Cambiar contraseña`, `Cerrar sesión en otros dispositivos` con diálogo de confirmación, contadores `deletionGeneration`/`privacyGeneration`, guarda `isSubmittingDeletionRequest` contra doble toque, `nonisolated static func isUnauthenticatedError` para transicionar el polling silencioso a `.completed` cuando el servidor elimina el usuario en Auth, y mapeo en español de errores de Functions.
- **Acceso y recuperación (`Sources/Auth/AuthRepo.swift`, `AuthViewModel.swift`, `AuthGateView.swift`, `AuthSheets.swift`, `AgeAssurance.swift`)**:
  - `createAccount` configura `languageCode = "es"` y envía `sendEmailVerification()` en modo best-effort.
  - `AuthViewModel` / `AuthGateView` / `AuthSheets`: estado `isSubmitting` contra doble envío, validación cliente previa de correo/contraseña, bandera `isSigningOut` para no mostrar banner de cierre forzado en cierre voluntario, cancelación de `profileBootstrapTask`, exposición de `currentUserEmail`, traducción de `.userTokenExpired`/`.requiresRecentLogin`, limpieza de errores y bloqueo de entrada en `PasswordResetSheet`, y preferencia por escena `foregroundActive` en `AgeAssurance`.
- **Bloqueos y denuncias (`Sources/Moderation/ModerationRepo.swift`, `ModerationViewModels.swift`, `ModerationViews.swift`, `Sources/App/MainTabView.swift`)**:
  - Guardia `cannotReportSelf`, presupuesto exacto de caracteres `ReportFields.maxUserDetailsLength(for:)` alineado a `fitsRules`, `BlockedUsersStore.refresh(for:)` con limpieza al cerrar sesión + `lastLoadError` + guarda de generación, e indicador de carga / error / `Reintentar` en `BlockedUsersView`.
- **Pruebas iOS**:
  - Creados `Tests/Fakes/FakeAuthRepo.swift`, `Tests/Fakes/FakeAccountSecurityRepos.swift`, `Tests/AccountSecurityTests.swift` (`AccountSecurityAuthTests`, `AccountSecurityModerationTests`, `AccountSecuritySettingsTests`) y `IntegrationTests/AccountSecurityIntegrationTests.swift` (visibilidad sincronizada + `revokeUserSessions`, rechazo de auto-denuncia y de subida en Storage para DM bloqueado, y ciclo completo de solicitud + polling de eliminación de cuenta contra los emuladores reales).

## Validación ejecutada

- **Local (Windows)**:
  - `npm run functions:build`, `npm run typecheck`, `npx eslint src functions e2e scripts api` (0 errores, 0 advertencias), `npm run check:cycles`, `npm run check:stubs`, `npm run check:raw-onsnapshot`, `npm run contract:check` y `npm run build`: todo aprobado.
  - `npm run test:run`: `83` archivos / `569` pruebas web aprobadas.
  - `npm run test:api`: `16` archivos / `112` pruebas API/Functions aprobadas (incluidas `deleteAccountHelpers.test.ts`, `followCounts.test.ts` y `moderation.test.ts`).
- **GitHub Actions `CI` (`44604170417` en commit `6716a88`) — `success`**:
  - `lint`, `typecheck`, `cost-gates`, `test` (`83` archivos / `569` web + `16` archivos / `112` API/Functions), `build`, `lhci`: todos en verde.
  - `rules`: `3` archivos / `94` pruebas de reglas Firestore/Storage aprobadas.
  - `post-counts`: `21/21` aprobadas en `test:post-counts` (incluida `scripts/account-security.integration.test.mjs`) y `13/13` en `test:post-reads`.
  - `e2e`: `20 passed (5.6m)` en Chromium contra emuladores Firebase (incluidos los 3 flujos `@smoke` de `e2e/account-security.spec.ts`).
  - También se revalida `CI` sobre el commit documental final en la rama `fix/account-security`.
- **GitHub Actions `iOS native` (`44604170326` PR en commit `6716a88`) — `success`**:
  - `ios-native`: compilación `ReleaseProd` + suite unitaria (`xcodebuild test`, incluida `AccountSecurityTests`) aprobadas.
  - `ios-native-integration`: `passed: 45 failed: 0` contra emuladores Firebase (incluida `AccountSecurityIntegrationTests`).
- **GitHub Actions `iOS screenshots` (`44604064275`, rama `fix/account-security` en commit `6716a88`) — `success`**.
- **Vercel Preview**: despliegue completado en verde.

## Pendiente para cierre definitivo del módulo

Siguiendo la [forma de trabajo acordada por módulo](revision-app-nativa.md#forma-de-trabajo-acordada-por-módulo), la casilla del módulo queda abierta hasta completar al final:

- **Despliegue coordinado**: `staging` con observación, despliegue de `firestore.rules`, `storage.rules`, Cloud Functions (`onUserBlockedCreated`, `onReportCreatedQueue`, `onMessageCreatedModeration`, `moderationTakeAction`, `revokeUserSessions`, `requestAccountDeletion`, `getAccountDeletionStatus`, `deleteUserAccount`, `onDeletionJobCreated`, `onDeletionJobUpdated`), despliegue web a producción y nuevo build de TestFlight tras cerrar la etapa de código.
- **Pruebas manuales en iPhone real y proveedores reales**: entrega real de correos de verificación y recuperación de contraseña (y apertura del enlace `oobCode` en web), acceso con Google y Sign in with Apple (incluida la revocación real del token de Apple al eliminar cuenta), acceso por SMS con reCAPTCHA real en web, verificación de `DeclaredAgeRange` en iOS 26.2+ y comprobación física de cierre de sesión en otros dispositivos y eliminación definitiva de cuenta de prueba.
