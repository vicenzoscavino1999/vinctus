# Revisión del módulo Historias

Módulo revisado y corregido de extremo a extremo siguiendo el plan por módulos en [el documento general de revisión](revision-app-nativa.md), abarcando backend compartido (`firestore.rules`, `storage.rules`, `functions`, `shared/firestore-contract.json`), web (`src`) y app nativa iOS (`ios-native/VinctusNative`).

## Resumen de cambios implementados

### 1. Backend compartido (`firestore.rules`, `storage.rules`, `functions`, `shared/firestore-contract.json`)

- **Contrato compartido (`shared/firestore-contract.json`)**:
  - Se incorporaron los límites `stories.photoURLMaxLength` (600), `stories.mediaUrlMaxLength` (1000) y `stories.mediaPathMaxLength` (600) junto con `ownerNameMaxLength` (80), regenerando `src/shared/lib/firestore/firestoreContract.ts`, `api/lib/firestoreContract.ts`, `functions/src/firestoreContract.ts` e `ios-native/VinctusNative/Sources/Shared/FirestoreContract.swift`.
- **Reglas de Firestore y Storage (`firestore.rules`, `storage.rules`)**:
  - `isValidStoryOwnerSnapshot` valida `photoURL <= 600`; `isValidStoryCreate(storyId)` exige longitudes máximas de URL/ruta y vincula `mediaPath` a `stories/<auth.uid>/<storyId>/original/[^/]+` y `thumbPath` a `stories/<auth.uid>/<storyId>/thumb/[^/]+`.
  - `match /stories/{storyId}` exige en `allow read` que no exista bloqueo mutuo (`!isConversationBlocked(request.auth.uid, resource.data.ownerId)`).
  - En `storage.rules`, `canReadStoryMedia` añade verificación de seguidor (`isFollower`, alineado con `firestore.rules`) y rechazo por bloqueo (`isBlockedBetween`).
- **Limpieza automática en Cloud Functions (`functions/src/storyCleanup.ts`, `functions/src/followCounts.ts`, `functions/src/index.ts`)**:
  - Se agregó `onStoryDeleted` (`cleanupDeletedStoryMedia` / `getOwnedStoryStoragePrefix`) para eliminar todas las versiones de archivos bajo `stories/{ownerId}/{storyId}/` cuando se elimina una historia (por el autor, moderación o expiración TTL).
  - `cleanupFollowStateOnBlock` limpia además los índices simétricos `users/{uid}/friends/{blockedUid}` al bloquear a un usuario.

### 2. Web (`src`)

- **Storage, Firestore y mutaciones (`src/shared/lib/storage.ts`, `src/shared/lib/firestore/stories.ts`, `src/shared/lib/firestore/reports.ts`, `src/features/posts/api/types.ts`, `src/features/posts/api/mutations.ts`)**:
  - `src/shared/lib/storage.ts` exporta `deleteStoryFiles`, y tanto `uploadStoryImage` como `uploadStoryVideo` conservan el tipo MIME validado de imagen o video en lugar de forzar `'image/jpeg'` / `'video/mp4'`.
  - `src/shared/lib/firestore/stories.ts` añade `sanitizeStoryOwnerName`, `sanitizeStoryOwnerPhoto` y `deleteStory`; `src/shared/lib/firestore/reports.ts` incorpora `createStoryReport` (`conversationId: story_<storyId>`).
  - `src/features/posts/api/types.ts` y `mutations.ts` alinean `createStoryInputSchema` con `LIMITS.stories` y añaden mutaciones validadas para `deleteStory`, `createStoryReport` y `blockUser`.
- **Hook de carga (`src/features/posts/hooks/useStories.ts`)**:
  - Consulta `getBlockedUsers`, excluye UID bloqueados de `relationshipOwnerIds` y de los resultados combinados, conserva visible `error` cuando `hadFailure && realItemsCount === 0` aun si existen Shorts de respaldo, y añade `thumbPath`, `removeStory` y `excludeOwner`.
- **Compositor, visor y widget (`StoryComposerModal.tsx`, `StoryViewerModal.tsx`, `StoriesWidget.tsx`)**:
  - `StoryComposerModal` corrige la dependencia `draft` en efecto, restablece `isMountedRef.current` al montar el efecto (compatible con React `<StrictMode>`), protege frente a selecciones concurrentes/desmontaje/cambio de cuenta, bloquea cerrar mientras `isUploading`, valida MIME de video contra `STORAGE_CONTENT_TYPES.video`, normaliza `ownerName`/`ownerPhoto`, borra objetos huérfanos en Storage si falla `createStory` y añade `role="dialog"`.
  - `StoryViewerModal` incorpora confirmación de `Eliminar historia` para historias propias (cerrando al eliminar la última del grupo o manteniendo el visor abierto si falla), menú `Más opciones` en historias ajenas (`Denunciar historia` con `ContentReportModal` y confirmación de `Bloquear` + `onClose`), pausa de temporizador y video ante diálogos/menús/pestaña oculta, guarda de teclado en inputs/diálogos, `<video key poster>`, respaldo `onError` y `role="dialog"`.
  - `StoriesWidget` conecta `viewerGroups` en vivo, vistas por `uid` en `sessionStorage` (`seenByUser`), estado de compositor/visor acotado al `user?.uid` activo (sin efectos síncronos sobre estado), `handleDeleteStory`, `handleReportStory` y `handleBlockUser`.

### 3. App nativa iOS (`ios-native/VinctusNative`)

- **Repositorio (`Sources/Stories/StoriesRepo.swift`)**:
  - Excluye `blockedUsers` antes de consultar `storiesOf`, filtra `expiresAt > now`, valida `ownerSnapshot.photoURL` HTTP(S) <= 600 caracteres (`Limits.Stories.photoURLMaxLength`), valida tamaño mediante `StorageMaxBytes.image`, y elimina el archivo en Storage si falla `storyRef.setData`.
- **ViewModel y vistas (`StoriesViewModel.swift`, `StoriesViews.swift`, `StoryViewer.swift`, `YouTubeEmbedView.swift`, `ModerationViews.swift`)**:
  - `StoriesViewModel` añade `sessionGeneration`, `reset()`, `excludeOwner(_:)`, `delete(_:) -> Bool` con actualización local inmediata y error en fallo, y `!group.stories.isEmpty` en `isSeen`.
  - `StoriesViews` usa `.task(id: authVM.currentUserID ?? "anon")`, reinicia compositor/visor/ViewModel al cerrar sesión o cambiar de cuenta y captura `isPublishing` antes del label de `PhotosPicker` para evitar advertencias de concurrencia en `@Sendable`.
  - `YouTubeEmbedView` genera página en blanco cuando el `videoID` saneado está vacío.
  - `ModerationViews` y `StoryViewer` sustituyen el gesto de pausa pegajoso por `onInteractionChange` en `ModerationMenu`, mantienen abierto `StoryViewer` con alerta si falla `vm.delete` y limpian `AVPlayer` al cancelar o desaparecer.

## Validación ejecutada

- **Local (Windows)**:
  - `npm run contract:check`, `npm run functions:build`, `npm run typecheck`, `npx eslint src functions e2e scripts api` (0 errores, 0 advertencias), `npm run check:cycles`, `npm run check:stubs`, `npm run check:raw-onsnapshot` y `npm run build`: todo aprobado.
  - `npm run test:run`: `76` archivos / `540` pruebas web aprobadas (incluidas `src/features/posts/api/mutations.test.ts`, `src/features/posts/hooks/useStories.test.tsx`, `src/features/posts/components/StoryComposerModal.test.tsx` y `src/features/posts/components/StoryViewerModal.test.tsx`).
  - `npm run test:api`: `13` archivos / `87` pruebas API/Functions aprobadas (incluidas 3 en `functions/src/storyCleanup.test.ts` y 4 en `functions/src/followCounts.test.ts`).
- **GitHub Actions `CI` (`44389259896` en commit `028766d`)**:
  - `lint`, `typecheck`, `cost-gates`, `test`, `build`, `lhci`: todos en verde.
  - `rules`: `3` archivos / `87` pruebas de reglas Firestore/Storage aprobadas (`src/tests/firestore-rules/firestore.rules.cases.ts`, `post-access.rules.cases.ts` y `storage.rules.cases.ts`).
  - `post-counts`: `15/15` aprobadas en `test:post-counts` (incluida integración con emuladores `scripts/story-cleanup.integration.test.mjs`) y `13/13` en `test:post-reads`.
  - `e2e`: `14 passed (3.9m)` en Chromium contra emuladores Firebase (incluido `@smoke publicar historia, ver como seguidor, reportar, bloquear y eliminar propia` en `e2e/stories.spec.ts`).
  - También se revalida `CI` sobre el commit documental final en la rama `fix/stories`.
- **GitHub Actions `iOS native` (`44389260284`, PR sobre commit `028766d`) — `success`**:
  - `ios-native`: compilación `ReleaseProd` + suite unitaria (`xcodebuild test`, incluidas `StoriesTests` en `Tests/StoriesCollectionsTests.swift`) aprobadas.
  - `ios-native-integration`: `passed: 37 failed: 0` contra emuladores Firebase (incluida `StoriesIntegrationTests.testPublishStoryVisibleToFollowerHiddenAfterBlockAndDeletedByOwner` en `IntegrationTests/StoriesIntegrationTests.swift`).
- **GitHub Actions `iOS screenshots` (`44395674952`, rama `fix/stories` en commit `028766d`) — `success`**.

## Pendiente para cierre definitivo del módulo

Siguiendo la [forma de trabajo acordada por módulo](revision-app-nativa.md#forma-de-trabajo-acordada-por-módulo), la casilla del módulo queda abierta hasta completar al final:

- **Despliegue coordinado**: `staging` con observación, despliegue conjunto de `firestore.rules`, `storage.rules` y Cloud Functions (`onStoryDeleted`, `onUserBlockedCreated`), configuración de política TTL en Firestore para `stories.expiresAt` si aplica, despliegue web a producción y nuevo build de TestFlight tras cerrar el código de módulos.
- **Pruebas manuales en iPhone real**: verificación en dispositivo físico (publicación de foto desde fototeca, visualización de historias de seguidos y YouTube Shorts, denuncia, bloqueo y ocultamiento inmediato, eliminación de historia propia y expiración a 24 horas).
