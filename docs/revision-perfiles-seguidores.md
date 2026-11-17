# Revisión del módulo Perfiles y seguidores

Módulo revisado y corregido de extremo a extremo siguiendo el plan por módulos en [el documento general de revisión](revision-app-nativa.md), abarcando backend compartido (`firestore.rules`, `functions`, `shared/firestore-contract.json`), web (`src`) y app nativa iOS (`ios-native/VinctusNative`).

## Resumen de cambios implementados

### 1. Backend compartido (`firestore.rules`, `functions`, `shared/firestore-contract.json`)

- **Reconciliación transaccional de contadores (`functions/src/followCounts.ts`, `functions/src/index.ts`)**:
  - Se sustituyó `deduplicatedUserCounterUpdate` basado en deltas por `reconcileUserFollowersCount` y `reconcileUserFollowingCount`, que cuentan directamente las subcolecciones `followers` y `following` dentro de una transacción.
  - Los eventos duplicados o fuera de orden dejan de producir deriva permanente en `followersCount` y `followingCount`, y los eventos tardíos de borrado ya no recrean documentos eliminados en `users` ni `users_public`.
  - `onFollowRequestUpdated` ahora valida en transacción (`acceptFollowRequestInTransaction`) que ambas cuentas sigan existiendo, que no haya bloqueo mutuo en `blockedUsers` y preserva el `createdAt` original si algún enlace ya existía; si detecta bloqueo activo, limpia la solicitud.
  - Se agregó el trigger `onUserBlockedCreated` (`cleanupFollowStateOnBlock`) para garantizar del lado servidor la limpieza simétrica de `followers`, `following` y `follow_requests` ante bloqueos aunque el cliente pierda conexión tras el primer lote.
- **Reglas de Firestore y contrato (`firestore.rules`, `shared/firestore-contract.json`)**:
  - `users` y `users_public` bloquean modificaciones de cliente sobre `followersCount`, `followingCount` y `postsCount`, y validan límites de longitud de perfil (`displayName`, `role`, `bio`, `location`, vinculados en `shared/firestore-contract.json`).
  - `canViewFollowLists` niega listas de seguidores/seguidos cuando existe bloqueo mutuo.
  - `follow_requests` niega creación/actualización con bloqueo mutuo y restringe transiciones (`pending -> accepted|declined` solo para `toUid`; retorno a `pending` para `fromUid` solo desde `declined`, o desde `accepted` cuando ya no existe el borde `followers`).
  - `followers` y `following` exigen existencia de perfil destino en `users_public` al seguir cuentas públicas, prohíben auto-seguimiento y bloqueos, e impiden mutar `createdAt` en actualizaciones idempotentes.
  - `blockedUsers` niega auto-bloqueo y exige esquema mínimo (`blockedUid`, `status == 'active'`, `blockedAt`).

### 2. Web (`src`)

- **Edición y foto de perfil (`EditProfileModal.tsx`, `ProfilePage.tsx`, `profile/api/types.ts`, `profile/api/mutations.ts`, `shared/lib/firestore/profile.ts`, `shared/lib/firestore/sharedTypes.ts`, `shared/lib/storage.ts`)**:
  - Permite limpiar explícitamente `bio`, `role` y `location` enviando `null` (en lugar de `undefined`), exige nombre no vacío y respeta límites de `LIMITS.profile` en el formulario y el esquema Zod.
  - `EditProfileModal` reinicia su estado de carga al cerrarse/reabrirse e ignora respuestas tardías al desmontar o cambiar de usuario, y `ProfilePage` lo monta solo mientras está abierto, evitando que al reabrir rápido se muestre o guarde texto obsoleto de la sesión anterior.
  - `uploadProfilePhoto` respeta el `contentType` real de la imagen comprimida (`image/webp`, `image/jpeg`, `image/png`, `image/gif`) en lugar de forzar `image/jpeg`.
- **Estado de seguimiento, perfil ajeno, búsqueda y listas (`shared/lib/firestore/follows.ts`, `UserProfilePage.tsx`, `FollowListPage.tsx`, `UserSearchPage.tsx`, `profile/api/queries.ts`)**:
  - `getFollowStatus` preserva solicitudes entrantes (`hasIncomingRequest` / `incomingRequestId`) aun cuando el usuario ya sigue al solicitante o cuando el perfil visitado es público.
  - `unfollowUser` limpia el documento `follow_requests/{fromUid}_{toUid}` aceptado anteriormente si existe, evitando residuos al volver a seguir.
  - `UserProfilePage` y `UserSearchPage` verifican `isUserBlocked`, preservan solicitudes entrantes, detectan `AppError` (`PERMISSION_DENIED`) ante cambios concurrentes de privacidad y evitan exponer falsos textos por defecto (`Nuevo miembro`, `Sin ubicación`, `Sin biografía aún.`) en perfiles ajenos sin campo público; `UserProfilePage` además permite desbloquear desde la vista y refresca contadores tras acciones.
  - `FollowListPage` filtra usuarios bloqueados de listas y solicitudes entrantes, muestra un mensaje específico ante listas privadas (`PERMISSION_DENIED`), expone error si falla la carga de solicitudes, ignora respuestas obsoletas al cambiar rápido de pestaña, deduplica filas paginadas y refleja de forma optimista al seguidor recién aceptado mientras termina la Cloud Function.
- **Portafolio / Contribuciones (`ContributionsSection.tsx`, `shared/lib/firestore/contributions.ts`, `profile/api/mutations.ts`)**:
  - Añade eliminación de contribuciones propias con borrado previo del archivo en Storage (paridad con iOS), límites de longitud de `LIMITS.contributions` y saneamiento de enlaces externos `http`/`https`.

### 3. App nativa iOS (`ios-native/VinctusNative`)

- **Seguimiento confirmado y reintentos (`EngagementRepo.swift`, `EngagementViewModels.swift`, `EngagementViews.swift`)**:
  - `followStatus` consulta servidor (`.server`) tolerando solo `permissionDenied` y propagando fallos reales de red en lugar de ocultarlos como `.none`.
  - `follow` consulta `users_public.accountVisibility` en servidor antes de escribir, usa transacción en altas públicas para preservar `createdAt`, evita reescribir solicitudes ya pendientes y reintenta una vez si la privacidad cambió en paralelo.
  - `unfollow` contempla el caso concurrente en que una solicitud pendiente ya fue aceptada al momento de cancelar y limpia el documento `follow_requests` asociado al dejar de seguir.
  - `FollowViewModel` y `FollowButton` pasan a estado de error explícito con botón `Reintentar` cuando falla la carga inicial del estado.
- **Vistas de perfil, contribuciones y conexiones (`ProfileView.swift`, `ProfileViewModel.swift`, `ProfileHeaderViews.swift`, `ProfileConnectionViewModel.swift`, `ProfileWorkSections.swift`, `ProfileContentRepo.swift`, `FollowListViewModel.swift`, `FollowListView.swift`, `EditProfileSheet.swift`)**:
  - `ProfileView` separa la vista con `@StateObject` bajo `.id("\(authVM.currentUserID ?? "anon"):\(userID)")` para reiniciar estado al cambiar de cuenta o perfil, impide abrir listas de seguimiento si el perfil visitado está bloqueado, refresca contadores silenciosamente tras seguir/dejar de seguir o aceptar solicitud y oculta los textos por defecto `Nuevo miembro` / `Sin biografía aún.` en perfiles ajenos sin campo público.
  - `ProfileContributionsSection` solo abre enlaces `http`/`https` y `FirebaseProfileContentRepo.deleteContribution` limpia el adjunto asociado en Storage antes de borrar el documento en Firestore (paridad con web).
  - `FollowListViewModel` y `FollowListView` muestran error explícito cuando falla `loadRequests` o el listado es privado, revierten la fila si falla `answer`, filtran usuarios bloqueados en solicitudes y deduplican la lista al aceptar.
  - `EditProfileSheet` muestra aviso de longitud cuando `displayName`, `role` o `location` superan su límite.

## Validación ejecutada

- **Local (Windows)** tras la última corrección de código (`299b764`):
  - `npx tsc --noEmit`, `eslint src functions e2e scripts api`, `npm run contract:check`, `check:cycles`, `check:stubs`, `check:raw-onsnapshot` y `npm run build`: todo aprobado (`dist` + PWA).
  - `npm run test:run`: `72` archivos / `518` pruebas aprobadas (incluidas `follows.test.ts` y `ProfileAndFollowFlows.test.tsx`).
  - `npm run functions:build` y `npm run test:api`: `11` archivos / `81` pruebas aprobadas.
- **GitHub Actions `CI` (`44111671324`, commit `299b764`) — `success`**:
  - `cost-gates`, `lint`, `typecheck`, `build`, `lhci`: todos en verde.
  - `test`: `72` archivos / `518` pruebas web (`npm run test:run`) y `11` archivos / `81` pruebas API/Functions (`npm run test:api`, incluidas 4 en `functions/src/followCounts.test.ts`).
  - `rules`: `3` archivos / `83` pruebas de reglas Firestore/Storage aprobadas (`firestore.rules.cases.ts`).
  - `post-counts`: `13/13` aprobadas en `test:post-counts` (incluidos triggers reales de seguidores/bloqueos en `scripts/follow-counts.integration.test.mjs`) y `13/13` en `test:post-reads`.
  - `e2e`: `12 passed (3.3m)` en Chromium contra emuladores Firebase sin reintentos ni `flaky` (incluido `@smoke editar perfil con limpieza de bio y flujo seguir/dejar de seguir` en `e2e/profiles-followers.spec.ts`).
- **GitHub Actions `iOS native` (`44111654860`, intento 2 sobre commit `299b764`) — `success`**:
  - `ios-native`: compilación `ReleaseProd` + suite unitaria (`xcodebuild test`, incluida `testSafeWebURLOnlyAllowsHTTPAndHTTPS`) en macOS aprobadas.
  - `ios-native-integration`: `passed: 35 failed: 0` contra emuladores Firebase (`SocialIntegrationTests`, `ProfileAndPostsIntegrationTests`, `GroupsAndCollectionsIntegrationTests`, `PostDraftIntegrationTests`, etc.; el primer intento falló de forma transitoria en `PostDraftIntegrationTests` con `client is offline` y aprobó limpio en el relanzamiento sin cambios de código).
- **GitHub Actions `iOS screenshots` (`44020660770`, commit `cfc12cc`) — `success`**:
  - Capturas visuales iOS generadas sin errores.

## Pendiente para cierre definitivo del módulo

Siguiendo la [forma de trabajo acordada por módulo](revision-app-nativa.md#forma-de-trabajo-acordada-por-módulo), la casilla del módulo queda abierta hasta completar al final:

- **Despliegue coordinado**: `staging` con observación, despliegue conjunto de `firestore.rules` y nuevas/actualizadas Cloud Functions (`onUserFollowerCreated`, `onUserFollowerDeleted`, `onUserFollowingCreated`, `onUserFollowingDeleted`, `onFollowRequestUpdated`, `onUserBlockedCreated`), despliegue web a producción y nuevo build de TestFlight tras el cierre de implementación.
- **Pruebas manuales en iPhone real**: verificación end-to-end en dispositivo físico (edición y limpieza de perfil, subida de avatar, cuentas públicas/privadas, aceptación/rechazo de solicitudes, bloqueo y listas de seguidores/seguidos).
