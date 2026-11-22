# Revisión del módulo Inteligencia artificial: chat y Arena

Módulo revisado y corregido de extremo a extremo siguiendo el plan por módulos en [el documento general de revisión](revision-app-nativa.md), abarcando backend compartido (`api/chat.ts`, `functions/src/arena/*`, `functions/src/arenaCounts.ts`, `firestore.rules`), web (`src`) y app nativa iOS (`ios-native/VinctusNative`).

## Resumen de cambios implementados

### 1. Backend compartido (`api/chat.ts`, `functions/`, `firestore.rules`, emuladores)

- **Endpoint de Chat IA (`api/chat.ts`, `api/chat.test.ts`)**:
  - Se añadió la cabecera `Allow: POST` en respuestas `405`.
  - Se implementó `trimChatHistory` en las 3 rutas de respuesta (acotando cada parte a `<= 2000` caracteres, `<= 20` mensajes, `<= 12000` caracteres totales e inicio obligatorio en turno `user`), corrigiendo el error `400` permanente en conversaciones largas o tras respuestas de OpenAI mayores a 2000 caracteres.
  - Se agregó `releaseImageGeneration(authUid, day)` vinculado al día UTC reservado (`reserveImageGeneration`) para reembolsar la cuota diaria de generación de imágenes si el proveedor upstream falla antes de devolver imagen, incluso cruzando medianoche UTC.
  - Se amplió `api/chat.test.ts` (28 pruebas) cubriendo `Allow: POST`, recorte de historial multi-turno con respuestas largas y reembolso de cuota ante fallo de OpenAI.
- **Arena IA (`functions/src/arena/guardrails.ts`, `helpers.ts`, `rateLimit.ts`, `createDebate.ts`, `arena.test.ts`)**:
  - `guardrails.ts`: normalización Unicode sin diacríticos (`stripDiacritics`) antes de evaluar frases bloqueadas y patrones prohibidos, más patrones bidireccionales para evitar evasiones con tildes o inversión del orden de palabras en español/inglés.
  - `helpers.ts`: nuevo módulo puro (importable desde Vitest raíz) corrigiendo mojibake UTF-8 y límites de palabra Unicode (`(?<![...])`) en detección de menciones/fuentes en español (`según`, `metaanálisis`, entidades acentuadas como `Álvarez 2024`), normalización limpia de bloques cercados con comillas (`normalizeTurnText`), clasificación de `503`/`overloaded`/`service unavailable`/timeouts como fallback a nivel de modelo para intentar el resto de modelos Gemini antes de conmutar a NVIDIA, y `classifyDebateGenerationError` para producir mensajes de error saneados en español.
  - `rateLimit.ts` y `createDebate.ts`: validación de longitud máxima `MAX_TOPIC_CHARS` **antes** de truncar (`sanitizeTopic`), timeout en `generateWithGeminiModel` (`RequestOptions.timeout`) y en `generateWithNvidiaModel` (`AbortController`), verificación de claves API y duplicado `clientDebateId` antes de consumir `checkRateLimit(uid)`, reembolso transaccional de cupo diario (`refundRateLimit(uid, dayKey)`) ante colisiones `already-exists` o fallo de generación, y escritura exclusiva del mensaje saneado en `arenaDebates/{id}.error` (enviando el detalle técnico solo a `functions.logger.error` para no filtrar respuestas crudas de proveedores en documentos públicos).
- **Contadores de Arena y pruebas de emulador/reglas (`functions/src/arenaCounts.ts`, `functions/src/index.ts`, `scripts/arena-counts.integration.test.mjs`, `scripts/seed.mjs`, `firestore.rules.cases.ts`)**:
  - Se reemplazó el incremento/decremento delta en `onArenaDebateLikeCreated` y `onArenaDebateLikeDeleted` por reconciliación transaccional vía `.count()` (`reconcileArenaDebateLikeCount`), omitiendo debates eliminados.
  - Se añadió la prueba unitaria `functions/src/arena/arena.test.ts` (7 pruebas) y la integración real con emuladores `scripts/arena-counts.integration.test.mjs` (verificando reconciliación exacta desde un `likesCount: 42` desfasado), conectada a `npm run test:post-counts:run`.
  - Se añadieron debates de prueba (`debate_seed_1` público con `sourceLinks` y `debate_seed_private_bob` privado) en `scripts/seed.mjs` y casos de reglas de privacidad/estado `running`/escritura server-only y consentimiento IA en `src/tests/firestore-rules/firestore.rules.cases.ts`.

### 2. Web (`src`)

- **Consentimiento IA aislado por cuenta (`src/shared/lib/aiConsent.ts`, `SettingsPage.tsx`, `AIChatPage.tsx`, `ArenaPage.tsx`)**:
  - Se acotó la caché local por usuario (`vinctus:ai-consent:v2:${uid}`) eliminando la fuga de consentimiento entre cuentas distintas en un mismo navegador, conservando compatibilidad legacy cuando se llama sin `uid`.
  - En `SettingsPage.tsx`, `AIChatPage.tsx` y `ArenaPage.tsx` se sincroniza el consentimiento por `user.uid` sin otorgamiento optimista previo a Firestore, con banners de error y botón `Reintentar` ante fallos de lectura/escritura y bloqueo de clics concurrentes.
- **Chat IA (`src/shared/lib/aiChat.ts`, `src/features/ai/pages/AIChatPage.tsx`, `src/features/ai/components/AIModeTabs.tsx`)**:
  - `aiChat.ts` exporta `trimChatHistory`, recorta el historial antes de enviar a `/api/chat`, valida que `image` cumpla `^data:image\/(png|jpeg|webp);base64,` y protege frente a payloads malformados.
  - `AIChatPage.tsx` aísla `AIChatSession` por `key={user?.uid ?? 'anon'}`, añade límite `maxLength` + contador, rechazo de imágenes de `0` bytes, limpieza de `imageError` al alternar modo, guarda `imageReadSeqRef` para descartar lecturas `FileReader` obsoletas, bloqueo de controles OpenAI/imagen/micrófono sin consentimiento, botón `Nueva conversación`, guardas `isMountedRef` + `conversationSeqRef` y tilde corregida (`"Conversación IA"`) en `AIModeTabs.tsx`.
- **Arena IA y Debates guardados (`src/shared/lib/firestore/arenaEngagement.ts`, `savedItems.ts`, `src/features/arena/`, `src/features/profile/pages/ProfilePage.tsx`)**:
  - `likeArenaDebateWithSync` y `saveArenaDebateWithSync` operan con `runTransaction` comprobando existencia previa para preservar `createdAt` inmutable en reintentos idempotentes; `isArenaDebateLiked` e `isArenaDebateSaved` leen estado fresco del servidor (`getDocFromServer`).
  - `createDebate` configura `{ timeout: 300_000 }` en `httpsCallable` (alineado al timeout de 300 s de la Cloud Function, evitando cortes prematuros a los 70 s por defecto del SDK) y traduce `functions/deadline-exceeded`.
  - `subscribeToDebate` realiza un preflight con `getDoc` antes de abrir el stream `onSnapshot`, y `ArenaPage.tsx` condiciona `subscribeToTurns`, `isArenaDebateLiked` e `isArenaDebateSaved` a `accessibleDebateId`; esto evita un crash interno de Firebase JS SDK 12.6.0 (`FIRESTORE INTERNAL ASSERTION FAILED: ca9/b815`) al abrir enlaces a debates privados ajenos y navegar de vuelta.
  - `ArenaPage.tsx` + `DebateViewer.tsx` + `TopicInput.tsx`: sesión aislada por `key={userId ?? 'anon'}`, distinción explícita entre estado cargando y debate inexistente/privado (`"Este debate no existe o no tienes acceso para verlo."` + `"Volver a Arena"`), selector de visibilidad (`Público` / `Privado`), render seguro `http(s)` de `sourceLinks`, `usageError` con `Reintentar`, accesibilidad (`aria-label` / `aria-pressed`) y guardas contra doble clic en like/guardado.
  - `ProfilePage.tsx`: sección `Debates Guardados` con guarda de secuencia `savedDebatesSeqRef` y botón `Reintentar` ante errores de carga.
- **Pruebas web**:
  - Ampliadas `src/shared/lib/aiConsent.test.ts`, `src/shared/lib/aiChat.test.ts`, `src/features/ai/pages/AIChatPage.test.tsx`, `src/features/arena/api/queries.test.ts`, `src/features/arena/api/mutations.test.ts`.
  - Creadas `src/features/arena/pages/ArenaPage.test.tsx` y el flujo E2E `e2e/ai-arena.spec.ts` (`@smoke consentimiento IA aislado por cuenta, AI Chat con acción createGroup y Arena con likes/guardado y privacidad`).

### 3. App nativa iOS (`ios-native/VinctusNative`) y estabilidad CI

- **Consentimiento IA (`Sources/AI/AIConsentViewModel.swift`, `AIConsentGate.swift`, `Sources/Settings/SettingsViewModel.swift`)**:
  - Contadores de generación (`loadGeneration` / `consentGeneration`) y limpieza inmediata al cambiar de cuenta o cerrar sesión, descartando respuestas tardías de usuarios previos y evitando fugas de estado concedido entre sesiones.
  - Botón `Reintentar` en `AIConsentGate` ante fallos de lectura y bloqueo contra toques concurrentes en `SettingsViewModel.toggleAIConsent`.
- **Chat IA y Arena (`Sources/AI/AIRepo.swift`, `AIChatView.swift`, `ArenaView.swift`)**:
  - `FirebaseAIRepo.trimmedHistory` normaliza roles, recorta partes individuales a `maxMessageLength` (2000), elimina vacíos, acota a 20 mensajes / 12000 caracteres y garantiza inicio con turno `user`.
  - `AIChatMessage` y `FirebaseAIRepo.decodeChatResponse` decodifican `action: { type: "createGroup", groupId }` sin serializar `groupID` de vuelta en el historial, permitiendo abrir el grupo creado directamente con `NavigationLink("Ver grupo") { GroupView(...) }` desde `AIChatBubble`.
  - `AIChatViewModel` / `AIChatView`: `sessionGeneration`, botón de barra `Nueva conversación`, reinicio automático al cambiar `authVM.currentUserID`, contador de caracteres y rollback que no sobrescribe texto nuevo si falla el envío anterior.
  - `FirebaseAIRepo.createDebate`: envía `clientDebateId` estable por intento para idempotencia.
  - `ArenaViewModel` / `ArenaView`: validación de longitud mínima (`minTopicLength = 5`) y máxima (`maxTopicLength`), bloqueo de controles mientras genera, captura de `selectedA`/`selectedB` al iniciar `createNow()`, reinicio por sesión, contador de caracteres y botón `Reintentar` si falla la carga inicial de personalidades.
- **Debates guardados y lecturas (`Sources/Profile/ProfileContentRepo.swift`, `ProfileSectionViewModels.swift`, `ProfileSavedSections.swift`, `Sources/Feed/PostReadClient.swift`, `.github/workflows/ios-native.yml`)**:
  - `FirebaseProfileContentRepo.saveDebate`: escritura idempotente que conserva `createdAt` inmutable y acota `personaA`/`personaB` a `Limits.SavedArenaDebates.personaMaxLength` (80).
  - `SavedDebatesViewModel` y `ProfileSavedDebatesSection`: recarga aislada por sesión con `.task(id: authVM.currentUserID)`, `loadGeneration` + `reset()`, bloqueo contra doble toque (`removingIDs`) con rollback sin resucitar borrados concurrentes, botón `Reintentar` ante error de carga e indicación inline si falla un borrado sin ocultar la lista.
  - `DebateTurnsViewModel` y `SavedDebateView`: limpian `errorMessage`, permiten `Reintentar` al cargar turnos y muestran estado vacío explícito si un debate guardado no tiene turnos disponibles.
  - Se elevó `FUNCTIONS_DISCOVERY_TIMEOUT: 60000` en `.github/workflows/ios-native.yml` y `timeoutInterval = 45` en `PostReadClient.swift` para dar margen a arranques en frío de `readPosts` en el emulador de Functions en macOS CI.
- **Pruebas iOS**:
  - Ampliadas `Tests/VinctusNativeTests.swift`, `Tests/DiscoverAndAITests.swift` y `Tests/ProfileSectionsTests.swift` (`AIConsentViewModelTests`, `SettingsAIConsentViewModelTests`, `AIChatResponseDecodingTests`, `AIChatViewModelTests`, `ArenaViewModelTests`, `SavedDebatesViewModelTests`) junto con `Tests/Fakes/FakeAIRepo.swift`.
  - Creada `IntegrationTests/AIIntegrationTests.swift` contra los emuladores reales de Auth, Firestore y Functions (`testAIConsentRoundTripAndCrossUserPrivacy`, `testArenaPersonasAndUsageCallablesWorkAgainstFunctionsEmulator`, `testSavedDebateIsIdempotentAndArenaServerCollectionsRejectClientWrites`).

## Validación ejecutada

- **Local (Windows)**:
  - `npm run contract:check`, `npm run functions:build`, `npm run typecheck`, `npx eslint src functions e2e scripts api` (0 errores, 0 advertencias), `npm run check:cycles`, `npm run check:stubs`, `npm run check:raw-onsnapshot` y `npm run build`: todo aprobado.
  - `npm run test:run`: `79` archivos / `560` pruebas web aprobadas.
  - `npm run test:api`: `15` archivos / `107` pruebas API/Functions aprobadas (incluidas `api/chat.test.ts` y `functions/src/arena/arena.test.ts`).
- **GitHub Actions `CI` (`44587045685` en commit `06dc337`, segunda pasada) — `success`**:
  - `lint`, `typecheck`, `cost-gates`, `test` (`79` archivos / `560` web + `15` archivos / `107` API/Functions), `build`, `lhci`: todos en verde.
  - `rules`: `3` archivos / `91` pruebas de reglas Firestore/Storage aprobadas.
  - `post-counts`: `17/17` aprobadas en `test:post-counts` (incluida `scripts/arena-counts.integration.test.mjs`) y `13/13` en `test:post-reads`.
  - `e2e`: `17 passed (5.2m)` en Chromium contra emuladores Firebase (incluido `@smoke consentimiento IA aislado por cuenta, AI Chat con acción createGroup y Arena con likes/guardado y privacidad` en `e2e/ai-arena.spec.ts`).
  - También se revalida `CI` sobre el commit documental final en la rama `fix/ai-arena`.
- **GitHub Actions `iOS native` (`44587031192` push y `44587045553` PR en commit `06dc337`) — `success`**:
  - `ios-native`: compilación `ReleaseProd` + suite unitaria (`xcodebuild test`) aprobadas.
  - `ios-native-integration`: `passed: 42 failed: 0` en ambas ejecuciones contra emuladores Firebase (incluida `AIIntegrationTests`).
- **GitHub Actions `iOS screenshots` (`44587030990`, rama `fix/ai-arena` en commit `06dc337`) — `success`**.
- **Vercel Preview**: despliegue completado en verde.

## Pendiente para cierre definitivo del módulo

Siguiendo la [forma de trabajo acordada por módulo](revision-app-nativa.md#forma-de-trabajo-acordada-por-módulo), la casilla del módulo queda abierta hasta completar al final:

- **Despliegue coordinado**: `staging` con observación, despliegue de `api/chat.ts` (Vercel), Cloud Functions (`createDebate`, `getArenaUsage`, `getArenaPersonas`, `onArenaDebateLikeCreated`, `onArenaDebateLikeDeleted`), despliegue web a producción y nuevo build de TestFlight tras cerrar el código de módulos.
- **Pruebas manuales en iPhone real**: verificación en dispositivo físico con claves reales de Gemini/NVIDIA/OpenAI (otorgar/retirar consentimiento IA en Ajustes y puerta de acceso, multi-turno largo en Chat IA, creación de grupo desde el chat y apertura de `Ver grupo`, generación y guardado de debate en Arena IA, visualización de turnos guardados desde el perfil y reporte de respuestas IA).
