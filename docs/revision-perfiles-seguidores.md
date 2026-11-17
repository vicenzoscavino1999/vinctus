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

- **Edición y foto de perfil (`EditProfileModal.tsx`, `profile/api/types.ts`, `profile/api/mutations.ts`, `shared/lib/firestore/profile.ts`, `shared/lib/firestore/sharedTypes.ts`, `shared/lib/storage.ts`)**:
  - Permite limpiar explícitamente `bio`, `role` y `location` enviando `null` (en lugar de `undefined`), exige nombre no vacío y respeta límites de `LIMITS.profile` en el formulario y el esquema Zod.
  - `uploadProfilePhoto` respeta el `contentType` real de la imagen comprimida (`image/webp`, `image/jpeg`, `image/png`, `image/gif`) en lugar de forzar `image/jpeg`.
- **Estado de seguimiento, perfil ajeno y listas (`shared/lib/firestore/follows.ts`, `UserProfilePage.tsx`, `FollowListPage.tsx`, `profile/api/queries.ts`)**:
  - `getFollowStatus` preserva solicitudes entrantes (`hasIncomingRequest` / `incomingRequestId`) aun cuando el usuario ya sigue al solicitante o cuando el perfil visitado es público.
  - `unfollowUser` limpia el documento `follow_requests/{fromUid}_{toUid}` aceptado anteriormente si existe, evitando residuos al volver a seguir.
  - `UserProfilePage` verifica `isUserBlocked` al cargar y permite desbloquear desde la vista, muestra los botones de aceptar/rechazar solicitud independientemente del seguimiento saliente, corrige el detección de `AppError` (`PERMISSION_DENIED`) al cambiar privacidad en paralelo, refresca contadores tras acciones y evita mostrar falsos textos por defecto (`Nuevo miembro`, `Sin ubicación`, `Sin biografía aún.`) en perfiles ajenos cuyos campos privados no están en `users_public`.
  - `FollowListPage` filtra usuarios bloqueados de listas y solicitudes entrantes, muestra un mensaje específico ante listas privadas (`PERMISSION_DENIED`), expone error si falla la carga de solicitudes, deduplica filas paginadas y refleja de forma optimista al seguidor recién aceptado mientras termina la Cloud Function.
- **Portafolio / Contribuciones (`ContributionsSection.tsx`, `shared/lib/firestore/contributions.ts`, `profile/api/mutations.ts`)**:
  - Añade eliminación de contribuciones propias con borrado previo del archivo en Storage (paridad con iOS), límites de longitud de `LIMITS.contributions` y saneamiento de enlaces externos `http`/`https`.

### 3. App nativa iOS (`ios-native/VinctusNative`)

- **Seguimiento confirmado y reintentos (`EngagementRepo.swift`, `EngagementViewModels.swift`, `EngagementViews.swift`)**:
  - `followStatus` consulta servidor (`.server`) tolerando solo `permissionDenied` y propagando fallos reales de red en lugar de ocultarlos como `.none`.
  - `follow` consulta `users_public.accountVisibility` en servidor antes de escribir, usa transacción en altas públicas para preservar `createdAt`, evita reescribir solicitudes ya pendientes y reintenta una vez si la privacidad cambió en paralelo.
  - `unfollow` contempla el caso concurrente en que una solicitud pendiente ya fue aceptada al momento de cancelar y limpia el documento `follow_requests` asociado al dejar de seguir.
  - `FollowViewModel` y `FollowButton` pasan a estado de error explícito con botón `Reintentar` cuando falla la carga inicial del estado.
- **Vistas de perfil y conexiones (`ProfileView.swift`, `ProfileViewModel.swift`, `ProfileHeaderViews.swift`, `ProfileConnectionViewModel.swift`, `FollowListViewModel.swift`, `FollowListView.swift`, `EditProfileSheet.swift`)**:
  - `ProfileView` separa la vista con `@StateObject` bajo `.id("\(authVM.currentUserID ?? "anon"):\(userID)")` para reiniciar estado al cambiar de cuenta o perfil, refresca contadores silenciosamente tras seguir/dejar de seguir o aceptar solicitud y oculta los textos por defecto `Nuevo miembro` / `Sin biografía aún.` en perfiles ajenos sin campo público.
  - `FollowListViewModel` y `FollowListView` muestran error explícito cuando falla `loadRequests` o el listado es privado, revierten la fila si falla `answer`, filtran usuarios bloqueados en solicitudes y deduplican la lista al aceptar.
  - `EditProfileSheet` muestra aviso de longitud cuando `displayName`, `role` o `location` superan su límite.

## Validación ejecutada

- Local (Windows):
  - `npm run contract:check` y `vitest` de contrato: `77/77` pruebas aprobadas.
  - `npm run functions:build` y `npm run test:api`: compilación limpia y `81/81` pruebas aprobadas (incluidas 4 nuevas en `functions/src/followCounts.test.ts`).
  - `eslint` sobre `src`, `functions`, `e2e`, `scripts`, `api` + `check:cycles` + `check:stubs` + `check:raw-onsnapshot` + `metrics:phase6:gate`: todo aprobado.
  - `npm run test:run`: `72` archivos / `516` pruebas aprobadas (incluidas `follows.test.ts` y `ProfileAndFollowFlows.test.tsx`).
  - `npm run build`: `tsc --noEmit` + `vite build` sin errores.
- En curso / pendiente de confirmación en GitHub Actions (`CI` + `iOS native`):
  - Reglas de Firestore (`firestore.rules.cases.ts`), triggers reales en emulador (`scripts/follow-counts.integration.test.mjs`), E2E Playwright (`e2e/profiles-followers.spec.ts`) y compilación/pruebas unitarias/integración de iOS en macOS.

## Pendiente para cierre definitivo del módulo

Siguiendo la [forma de trabajo acordada por módulo](revision-app-nativa.md#forma-de-trabajo-acordada-por-módulo), la casilla del módulo queda abierta hasta completar al final:

- **Despliegue coordinado**: `staging` con observación, despliegue conjunto de `firestore.rules` y nuevas/actualizadas Cloud Functions (`onUserFollowerCreated`, `onUserFollowerDeleted`, `onUserFollowingCreated`, `onUserFollowingDeleted`, `onFollowRequestUpdated`, `onUserBlockedCreated`), despliegue web a producción y nuevo build de TestFlight tras el cierre de implementación.
- **Pruebas manuales en iPhone real**: verificación end-to-end en dispositivo físico (edición y limpieza de perfil, subida de avatar, cuentas públicas/privadas, aceptación/rechazo de solicitudes, bloqueo y listas de seguidores/seguidos).
