# Revisión del módulo Grupos

Módulo revisado y corregido de extremo a extremo siguiendo el plan por módulos en [el documento general de revisión](revision-app-nativa.md), abarcando backend compartido (`firestore.rules`, `functions`, `shared/firestore-contract.json`), web (`src`) y app nativa iOS (`ios-native/VinctusNative`).

## Resumen de cambios implementados

### 1. Backend compartido (`firestore.rules`, `functions`, `shared/firestore-contract.json`)

- **Reconciliación transaccional de miembros y limpieza completa al borrar grupos (`functions/src/groupCounts.ts`, `functions/src/index.ts`)**:
  - Se sustituyó el contador delta (`deduplicatedIncrement` / `deduplicatedDecrement`) en `onGroupMemberCreated` y `onGroupMemberDeleted` por `reconcileGroupMemberCount`, que consulta directamente `members.count()` dentro de una transacción, evita el doble conteo cuando `createGroup` crea el grupo con `memberCount: 1` seguido de `members/{ownerId}` y evita resucitar grupos ya eliminados.
  - `ensureGroupConversationForMember` valida dentro de la transacción que sigan existiendo tanto `groups/{groupId}` como `groups/{groupId}/members/{uid}` antes de crear o actualizar `conversations/grp_{groupId}`.
  - `onGroupDeleted` ahora limpia de forma integral todos los miembros y sus índices `users/{uid}/memberships/{groupId}` (`cleanupDeletedGroupMembersAndMemberships`), las solicitudes `group_requests` (`cleanupDeletedGroupJoinRequests`), el chat grupal `conversations/grp_{groupId}` de forma recursiva y los prefijos de Storage (`conversationAttachment`, `groupIcon`).
- **Reglas de Firestore y contrato (`firestore.rules`, `shared/firestore-contract.json`)**:
  - `groups/{groupId}/members/{uid}` restringe `get` a estado propio (`isOwner(uid)`), grupos públicos, propietario o miembro activo (`isGroupMember(groupId)`), y restringe `list` de grupos privados únicamente a propietarios y miembros activos.
  - `isValidGroupCreate` exige `memberCount == 1` (o ausente) al crear, e `isValidGroupUpdate` retira `memberCount` de los campos editables por clientes para que sea mantenido exclusivamente en servidor.
  - `isValidGroupMemberCreate` valida claves exactas (`uid`, `groupId`, `role`, `joinedAt == request.time`), bloquea altas con usuarios bloqueados en grupos públicos u ofertas de propietario, e impide que el propietario se degrade o se elimine a sí mismo de `members`.
  - `users/{uid}/memberships/{groupId}` valida esquema estricto (`groupId`, `joinedAt`) en creación y actualización del propietario (`joinedAt is timestamp`, `groupId` inmutable).
  - `group_requests` bloquea solicitudes si existe bloqueo mutuo o membresía previa, exige `status == 'pending'` para responder, prohíbe aceptar ante bloqueo activo o grupo eliminado, y vincula `messageMaxLength` (`1000`) y `fromUserPhotoMaxLength` (`600`) en `shared/firestore-contract.json`.

### 2. Web (`src`)

- **Operaciones Firestore de grupos (`src/shared/lib/firestore/groups.ts`, `src/features/groups/api/types.ts`)**:
  - `addGroupMember` deja de incrementar `memberCount` desde cliente y omite lecturas no autorizadas sobre `users/{uid}/memberships/{groupId}` ajenos (restringido por reglas a `isOwner(uid)`).
  - `joinGroupWithSync` realiza comprobación idempotente antes de escribir `members` y `memberships` sin sobrescribir documentos existentes.
  - `sendGroupJoinRequest` verifica primero la membresía real en `groups/{groupId}/members/{fromUid}` y consulta únicamente solicitudes `status == 'pending'`, permitiendo volver a solicitar acceso tras haber salido de un grupo privado aun si existía una solicitud previa aceptada; además sanea `groupName`, `message`, `fromUserName` y `fromUserPhoto` conforme a `LIMITS.groupRequests`.
  - `acceptGroupJoinRequest` valida existencia del grupo, consulta solo `groups/{groupId}/members/{memberUid}` (evitando `PERMISSION_DENIED` al leer `memberships` de otro usuario) y escribe ambos documentos juntos cuando el usuario aún no es miembro.
- **Vistas y formularios (`GroupDetailContainer.tsx`, `GroupDetailView.tsx`, `CreateGroupModal.tsx`, `GroupEditPage.tsx`, `DiscoverPage.tsx`, `NotificationsPage.tsx`)**:
  - `src/features/groups/api/queries.ts` expone `getBlockedUsers` para filtrar usuarios bloqueados de forma uniforme dentro del módulo.
  - `GroupDetailContainer` y `GroupDetailView` ocultan el listado y vista previa de publicaciones/miembros en grupos privados cuando el visitante aún no pertenece al grupo (`isPrivateLocked`), evitan lecturas denegadas de miembros/contadores antes de validar estado, filtran usuarios bloqueados en `topMembers` y en `GroupMembersPanel` (cuando no es propietario), aíslan fallos por perfil en `topMembers` con `.catch(() => null)` incluyendo `photoURL`, habilitan avatares y apertura de perfil (`onOpenMember`), protegen `GroupMembersPanel` contra respuestas tardías (`membersSeqRef`), sincronizan `topMembers` al cambiar roles, expulsar o salir, desbloquean la unión directa si un grupo con solicitud `pending` cambia a `public`, y manejan cambios concurrentes de visibilidad (`AppError` `PERMISSION_DENIED`).
  - `CreateGroupModal` habilita scroll vertical en viewports pequeños, filtra usuarios bloqueados en el selector inicial, limpia solicitudes de `getFollowing` al cerrar/cambiar usuario y usa `Promise.allSettled` para los miembros iniciales.
  - `GroupEditPage` depende de `user?.uid` (no de la referencia `user`) para no perder ediciones en curso y permite retirar el ícono actual (`Quitar icono`).
  - `DiscoverPage` reinicia `groupJoinStatusMap` al cambiar de usuario, muestra un mensaje específico ante `PERMISSION_DENIED` y permite unirse si una solicitud `pending` previa pertenece a un grupo ya `public`.
  - `NotificationsPage` filtra solicitudes entrantes de usuarios bloqueados y muestra errores claros ante `PERMISSION_DENIED` o grupo inexistente en `handleGroupAccept`.

### 3. App nativa iOS (`ios-native/VinctusNative`)

- **Repositorio de grupos (`GroupsRepo.swift`)**:
  - `fetchGroupDetail` tolera `permissionDenied` al consultar miembros de un grupo privado sin bloquear los metadatos ni publicaciones públicas permitidas, y `fetchMemberProfiles` resuelve perfiles por miembro sin abortar si un participante carece de documento público legible.
  - `getDocumentsWithFallback` y `getDocumentWithFallback` propagan `permissionDenied` en lugar de caer a `.cache` local, impidiendo fugas de miembros en caché tras revocaciones o en grupos privados.
  - `joinGroup` usa `db.runTransaction` verificando `visibility` e idempotencia antes de escribir `members` y `memberships`.
  - `membershipStatus` prioriza servidor (`.server`) sobre `status == "pending"` sin ocultar cache obsoleta tras rechazos o salidas, y `requestToJoin` impide solicitudes cuando ya es propietario/miembro (`GroupsRepoError.alreadyMember`) y acota `fromUserPhoto` a `Limits.GroupRequests.fromUserPhotoMaxLength`.
- **ViewModels y vistas (`GroupViewModel.swift`, `GroupView.swift`, `GroupCard.swift`, `EditGroupSheet.swift`)**:
  - `GroupCardViewModel.loadStatus` y `GroupDetailViewModel.loadMembership` limpian su estado cuando `uid == nil`.
  - `GroupCardViewModel.join`, `GroupDetailViewModel.performMembershipAction`, `GroupCard` y `GroupView` permiten unirse inmediatamente cuando un grupo privado con solicitud `.pending` previa cambia a `.public`, manteniendo bloqueado el botón en `Pendiente` mientras siga siendo privado.
  - `GroupView` recarga datos y membresía ante cambios de cuenta (`.task(id: "\(groupID):\(currentUserID ?? "anon")")`), filtra usuarios bloqueados en `topMembers` antes de evaluar el estado vacío y muestra avisos explícitos de grupo privado cuando `!isJoined`.
  - `EditGroupSheet` y `EditGroupViewModel` añaden opción `Quitar ícono` (`removeIcon()`) y contador de caracteres para el nombre (`GroupUpdate.nameLimit`).

## Validación ejecutada

- **Local (Windows)**:
  - `npx tsc --noEmit`, `npx eslint ...`, `npm run contract:check`, `npm run check:cycles`, `npm run check:stubs`, `npm run check:raw-onsnapshot`, `npm run functions:build` y `npm run build`: todo aprobado.
  - `npm run test:run`: `74` archivos / `528` pruebas web aprobadas (incluidas `src/shared/lib/firestore/groups.test.ts`, `src/features/groups/api/queries.test.ts` y `src/features/groups/components/GroupDetailView.test.tsx`).
  - `npm run test:api`: `12` archivos / `84` pruebas API/Functions aprobadas (incluidas 3 en `functions/src/groupCounts.test.ts`).
- **GitHub Actions `CI` (`44330224661`, commit `338ac9d`)**:
  - `lint`, `typecheck`, `cost-gates`, `build`, `lhci`: todos en verde.
  - `test`: `74` archivos / `528` pruebas web y `12` archivos / `84` pruebas API/Functions aprobadas.
  - `rules`: `3` archivos / `84` pruebas de reglas Firestore/Storage aprobadas (incluyendo reglas de visibilidad de miembros privados, bloqueo, inmutabilidad de `memberCount` y flujo completo de `group_requests` en `src/tests/firestore-rules/firestore.rules.cases.ts`).
  - `post-counts`: `14/14` aprobadas en `test:post-counts` (incluida integración real en emuladores `scripts/group-counts.integration.test.mjs`) y `13/13` en `test:post-reads`.
  - `e2e`: `13 passed (4.1m)` en Chromium contra emuladores Firebase (incluido `@smoke grupo privado: editar, ocultar miembros a externos, solicitar, aprobar, salir y volver a solicitar` en `e2e/groups.spec.ts`).
  - También queda revalidada `CI` sobre el commit documental final en la rama `fix/groups`.
- **GitHub Actions `iOS native` (`44330224612` PR y `44330211624` push, commit `338ac9d`) — `success`**:
  - `ios-native`: compilación `ReleaseProd` + suite unitaria (`xcodebuild test`, incluyendo nuevas pruebas en `GroupsTests.swift` y `GroupCardTests.swift`) aprobadas.
  - `ios-native-integration`: `passed: 36 failed: 0` contra emuladores Firebase (`GroupsAndCollectionsIntegrationTests` valida idempotencia al unirse, lectura privada como usuario externo sin error ni caché filtrada, aceptación de solicitud, bloqueo de re-solicitud siendo miembro y nueva solicitud tras salir; la ejecución de `push` quedó verde al relanzar el job afectado por un timeout `DEADLINE EXCEEDED` transitorio del emulador de Functions).
- **GitHub Actions `iOS screenshots` (`44330210645`, commit `338ac9d`) — `success`**.

## Pendiente para cierre definitivo del módulo

Siguiendo la [forma de trabajo acordada por módulo](revision-app-nativa.md#forma-de-trabajo-acordada-por-módulo), la casilla del módulo queda abierta hasta completar al final:

- **Despliegue coordinado**: `staging` con observación, despliegue conjunto de `firestore.rules`, `firestore.indexes.json` y nuevas/actualizadas Cloud Functions (`onGroupMemberCreated`, `onGroupMemberDeleted`, `onGroupDeleted`), migración/reconciliación de datos históricos de `memberCount` (`functions/scripts/backfill-counters.js`) si aplica, despliegue web a producción y nuevo build de TestFlight tras cerrar el código de módulos.
- **Pruebas manuales en iPhone real**: verificación end-to-end en dispositivo físico (exploración y apertura de grupos públicos/privados, unirse, solicitar acceso, salir, chat grupal, edición de grupo/ícono/visibilidad y ocultamiento de contenido bloqueado/privado).
