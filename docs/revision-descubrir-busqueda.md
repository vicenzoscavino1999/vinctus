# Revisión del módulo Descubrir y búsqueda

Módulo revisado y corregido de extremo a extremo siguiendo el plan por módulos en [el documento general de revisión](revision-app-nativa.md), abarcando backend compartido (`api/`, `firestore.rules`), web (`src`) y app nativa iOS (`ios-native/VinctusNative`).

## Resumen de cambios implementados

### 1. Backend compartido (`api/`, `firestore.rules`)

- **API de Descubrir (`api/discover.ts`)**:
  - Se reemplazó `decodeXmlEntities` por `decodeHtmlEntities` (entidades nombradas, decimales `&#NNN;` y hexadecimales `&#xHHH;` acotadas al rango Unicode `<= 0x10ffff`) aplicado sobre arXiv XML, títulos y extractos de Wikipedia REST/Action API, títulos de Hacker News y Open Library.
  - Se añadió `isSafeHttpUrl` para validar enlaces, fotos y miniaturas (`http://` / `https://`) en arXiv, Wikipedia, Hacker News, iNaturalist e iTunes, rechazo estricto de parámetros `limit` no enteros (`!/^\d+$/`) y cabecera `Allow: GET` en respuestas `405`.
  - En `fetchHackerNews`, se migró de `Promise.all` a `Promise.allSettled`, filtrando ítems nulos o no objeto devueltos por Hacker News y validando enlaces con respaldo a `news.ycombinator.com/item?id=...`.
  - En `fetchOpenLibrary`, se validó `typeof work.cover_id === 'number' && Number.isFinite(coverId) && coverId > 0` para evitar URLs rotas de portada (`.../0-M.jpg`), se normalizó el prefijo de `work.key` y se añadió respaldo `book-<index>` cuando falta `key`.
- **APIs de YouTube (`api/youtube-search.ts`, `api/youtube.ts`, `api/youtube-shorts.ts`)**:
  - Se añadió `decodeHtmlEntities` (con límite Unicode `<= 0x10ffff`) + `normalizeDecodedString` para decodificar entidades HTML devueltas por YouTube Data API v3 (`&amp;`, `&quot;`, `&#39;`, etc.) en `title`, `description` y `channelTitle`, además de validación estricta de `limit` entero en `youtube-search` y `youtube-shorts`.
- **Reglas de Firestore (`firestore.rules`)**:
  - Se endureció `match /users/{uid}/savedCategories/{categoryId}` para exigir `isValidFollowedCategoryCreate(categoryId)` al crear y claves estrictas + `createdAt` inmutable al actualizar, alineándolo con `followedCategories`.

### 2. Web (`src`)

- **Cliente directo, hook y guardado idempotente (`src/shared/lib/api.ts`, `src/shared/hooks/useApiContent.ts`, `src/shared/lib/firestore/savedItems.ts`)**:
  - `src/shared/lib/api.ts` incorpora paridad en el cliente directo: `decodeHtmlEntities`, `withEllipsis`, `isSafeHttpUrl`, `MUSIC_QUERY_MAP` en `fetchMusicInfoDirect`, `encodeURIComponent` en arXiv/OpenLibrary/iNaturalist, `Promise.allSettled` + filtro de nulos + validación de URL en Hacker News, y guarda de `cover_id > 0` en Open Library.
  - `useApiContent` expone `retry: () => void`, limpia `data`/`error` cuando `apiSource` es `null` e inicializa `loading` según `Boolean(apiSource)`.
  - `saveCategoryWithSync` y `followCategoryWithSync` verifican existencia previa mediante `getDoc` antes de `batch.set` para preservar `createdAt` en reintentos idempotentes bajo reglas estrictas.
- **Descubrir (`src/features/discover/pages/DiscoverPage.tsx`, `ApiContentCard.tsx`, `CategoryCard.tsx`)**:
  - El buscador principal (`"Buscar intereses o grupos..."`) filtra tanto categorías (insensible a acentos sobre `id`, `label`, `description` y subgrupos) como grupos recomendados derivados de `allGroups` (respetando `searchQuery`, `filters.category` y `filters.sortBy`) preservando otros parámetros de consulta al editar o limpiar `q`.
  - `rankedTrendCategories` respeta el orden seleccionado (`alphabetical`, `popular`, `recent`) y aplica el puntaje de tendencias únicamente cuando `filters.sortBy === 'relevance'`.
  - Se añadió botón para limpiar búsqueda (`Limpiar búsqueda`), botones `Reintentar` en previews fallidos, grupos y debates de Arena, `Promise.allSettled` al cargar estados de unión a grupos, validación `isSafeHttpUrl` en previews, enlaces de Arena y modal de YouTube (`role="dialog"` / `aria-modal="true"`), botón de restablecer búsqueda de YouTube y guardas de montaje/secuencia (`isMountedRef`, `communityRequestSeqRef`, `youtubeRequestSeqRef`) en cargas iniciales y paginadas de comunidad y YouTube.
  - `ApiContentCard` y `CategoryCard` validan `^https?://` en enlaces e imágenes (`cover`, `thumbnail`, `photo`) antes de abrir/renderizar y aplican `e.preventDefault()` con la tecla Espacio en `onKeyDown`.
- **Detalle de categoría (`src/features/discover/pages/CategoryPage.tsx`)**:
  - Se acotó la selección de subgrupo al `category.id` activo sin efectos síncronos de estado, se limpia el estado de comunidades/biblioteca al cambiar de categoría, se sustituyó `window.location.reload()` por `retry` de `useApiContent`, se evita superponer `ErrorState` con el skeleton durante recargas, se añadieron botones `Reintentar` en errores de comunidades y biblioteca, se ocultan aportes de usuarios bloqueados (`getBlockedUsers`) y se validan `item.link` y `item.fileUrl` con `isSafeHttpUrl`.
- **Búsqueda de personas y grupos (`src/features/discover/pages/UserSearchPage.tsx`)**:
  - Se corrigió el texto corrupto `'Necesitas iniciar sesi??n'`, se filtran usuarios bloqueados en sugeridos y resultados (con margen de lectura suficiente), se añadieron `Reintentar` en errores de sugeridos y búsqueda, botón `Limpiar búsqueda`, etiquetas accesibles (`aria-label`) y navegación por teclado en tarjetas de usuario, actualización real de seguimiento mediante `getFollowStatus` al aceptar solicitudes, validación `http(s)` de avatares/íconos y sección de resultados de `Grupos` (insensible a acentos sobre nombre, descripción, `categoryId` y etiqueta de categoría, visible independientemente de errores de búsqueda de usuarios).

### 3. App nativa iOS (`ios-native/VinctusNative`)

- **Repositorio y modelos (`Sources/Discover/DiscoverRepo.swift`, `SampleDiscoverRepo.swift`, `Sources/Profile/ProfileContentRepo.swift`)**:
  - Se añadieron `DiscoverSubgroup`, `DiscoverCategory` (las 6 categorías alineadas con Web con búsqueda insensible a acentos), `DiscoverLiveItem` y `DiscoverLibraryItem`.
  - `FirebaseDiscoverRepo` evita el fallback silencioso a `.cache` ante `FirestoreValue.isPermissionDenied(error)` en `fetchRecentUsers` y `searchUsers`, e implementa `fetchLiveContent` (consumiendo `/api/discover` con decodificación para las 6 fuentes y `safeHTTPURL`), `fetchCategoryGroups` y `fetchCategoryLibrary`.
  - `FirebaseProfileContentRepo.setCategoryFollowed` comprueba existencia previa del documento para ser idempotente bajo las reglas estrictas de `createdAt`.
- **ViewModels y vistas (`DiscoverViewModel.swift`, `DiscoverCategoryView.swift`, `DiscoverView.swift`, `ConnectionsSearchView.swift`, `DiscoverComponents.swift`, `GroupViewModel.swift`, `GroupsListView.swift`, `MainTabView.swift`)**:
  - `DiscoverViewModel` incorpora `sessionGeneration`, `searchGeneration`, `reset()`, `refreshSearchNow()` y cancelación en `retryCurrentState()` para descartar respuestas obsoletas o de sesiones cerradas.
  - Se creó `DiscoverCategoryView` + `DiscoverCategoryViewModel` con pestañas `En Vivo`, `Comunidades` y `Biblioteca`, selector de subgrupos con guarda de generación, seguimiento de categoría, apertura segura de enlaces, reintentos independientes por sección y ocultamiento de bloqueados en Biblioteca.
  - `DiscoverView` reemplaza las 3 tarjetas estáticas de tendencia por las 6 categorías reales ordenadas por actividad real y navegables a `DiscoverCategoryView`, filtra sin acentos categorías, grupos y personas sugeridas desde el buscador principal, muestra errores con `Reintentar` y limpia `discoverQuery`, `vm` y `suggestedGroups` al cerrar sesión.
  - `ConnectionsSearchView` filtra usuarios bloqueados antes de comprobar estado vacío (evitando encabezados vacíos), elimina el parpadeo simultáneo de `"Sin resultados"` mientras busca (`vm.isSearching`), amplía el catálogo de grupos buscables a 50, limpia `vm` y `suggestedGroups` al cerrar sesión, refresca `refreshSearchNow()` + grupos cuando hay búsqueda activa y muestra sugerencia con 1 carácter.
  - `GroupSuggestionsViewModel` incorpora `reset()` y filtrado insensible a acentos (incluyendo título de categoría) junto con el buscador integrado en `GroupsListView`; `DiscoverAvatarView` valida URLs con `safeHTTPURL`; `MainTabView` pasa `profileContentRepo` a `DiscoverView` y refresca `BlockedUsersStore` con `.task(id: authVM.currentUserID)`.

## Validación ejecutada

- **Local (Windows)**:
  - `npm run contract:check`, `npm run functions:build`, `npm run typecheck`, `npx eslint src functions e2e scripts api` (0 errores, 0 advertencias), `npm run check:cycles`, `npm run check:stubs`, `npm run check:raw-onsnapshot` y `npm run build`: todo aprobado.
  - `npm run test:run`: `77` archivos / `547` pruebas web aprobadas (incluidas `src/shared/lib/api.test.ts`, `src/shared/hooks/useApiContent.test.ts` y `src/features/discover/pages/DiscoverAndSearchFlows.test.tsx`).
  - `npm run test:api`: `13` archivos / `93` pruebas API/Functions aprobadas (incluidas `api/discover.test.ts`, `api/youtube-search.test.ts`, `api/youtube.test.ts` y `api/youtube-shorts.test.ts`).
- **GitHub Actions `CI` (`44441136993` en commit `a4a2c60`)**:
  - `lint`, `typecheck`, `cost-gates`, `test` (`77` archivos / `547` web + `13` archivos / `93` API), `build`, `lhci`: todos en verde.
  - `rules`: `3` archivos / `88` pruebas de reglas Firestore/Storage aprobadas (incluida la cobertura de `savedCategories` en `src/tests/firestore-rules/firestore.rules.cases.ts`).
  - `post-counts`: `15/15` aprobadas en `test:post-counts` y `13/13` en `test:post-reads`.
  - `e2e`: `15 passed (4.6m)` en Chromium contra emuladores Firebase (incluido `@smoke filtrar intereses y grupos en Discover, explorar categoria y ocultar bloqueados en busqueda` en `e2e/discover-search.spec.ts`).
  - También se revalida `CI` sobre el commit documental final en la rama `fix/discover-search`.
- **GitHub Actions `iOS native` (`44441137039` PR y `44441130455` push, sobre commit `a4a2c60`) — `success`**:
  - `ios-native`: compilación `ReleaseProd` + suite unitaria (`xcodebuild test`, incluidas `GroupSuggestionsViewModelTests`, `DiscoverViewModelTests`, `DiscoverLiveDecodingTests` y `DiscoverCategoryViewModelTests` en `Tests/DiscoverAndAITests.swift`) aprobadas sin advertencias en los archivos modificados.
  - `ios-native-integration`: `passed: 38 failed: 0` contra emuladores Firebase (incluida `DiscoverSearchIntegrationTests.testDiscoverUsersCategoryGroupsLibraryAndIdempotentCategoryFollow` en `IntegrationTests/DiscoverSearchIntegrationTests.swift`).
- **GitHub Actions `iOS screenshots` (`44441130498`, rama `fix/discover-search` en commit `a4a2c60`) — `success`**.

## Pendiente para cierre definitivo del módulo

Siguiendo la [forma de trabajo acordada por módulo](revision-app-nativa.md#forma-de-trabajo-acordada-por-módulo), la casilla del módulo queda abierta hasta completar al final:

- **Despliegue coordinado**: `staging` con observación, despliegue de `firestore.rules` y endpoints actualizados en Vercel (`/api/discover`, `/api/youtube-search`, `/api/youtube`, `/api/youtube-shorts`), despliegue web a producción y nuevo build de TestFlight tras cerrar el código de módulos.
- **Pruebas manuales en iPhone real**: verificación en dispositivo físico (búsqueda de intereses/grupos/personas en Discover y Buscar, navegación a las 6 categorías con pestañas En Vivo/Comunidades/Biblioteca, seguimiento de categoría, ocultamiento de bloqueados y apertura segura de enlaces externos).
