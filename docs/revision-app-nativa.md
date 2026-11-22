# Revisión de Vinctus: app nativa y web

Este archivo conserva el avance por módulos. A partir de conversaciones, revisar cada función en la app de iPhone (`ios-native/VinctusNative`) y en la web (`src`) antes de pasar a la siguiente. Una casilla marcada indica revisión y pruebas automatizadas para el alcance descrito; no implica publicación ni validación completa en un teléfono físico.

## Lista de módulos

- [x] Conversaciones de la app nativa: revisión, correcciones y pruebas automatizadas.
- [x] Conversaciones de la web: correcciones y validación local con Firebase y navegador.
- [ ] Publicaciones / Comunidad — implementación y CI completadas en ambas versiones ([PR #120](https://github.com/vicenzoscavino1999/vinctus/pull/120)); pendiente despliegue coordinado y prueba en iPhone real.
- [ ] Perfiles y seguidores — implementación y CI completadas en ambas versiones ([PR #121](https://github.com/vicenzoscavino1999/vinctus/pull/121), [detalle](revision-perfiles-seguidores.md)); pendiente despliegue coordinado y prueba en iPhone real.
- [ ] Grupos — implementación y CI completadas en ambas versiones ([PR #122](https://github.com/vicenzoscavino1999/vinctus/pull/122), [detalle](revision-grupos.md)); pendiente despliegue coordinado y prueba en iPhone real.
- [ ] Historias — implementación y CI completadas en ambas versiones ([PR #123](https://github.com/vicenzoscavino1999/vinctus/pull/123), [detalle](revision-historias.md)); pendiente despliegue coordinado y prueba en iPhone real.
- [ ] Descubrir y búsqueda — implementación y CI completadas en ambas versiones ([PR #124](https://github.com/vicenzoscavino1999/vinctus/pull/124), [detalle](revision-descubrir-busqueda.md)); pendiente despliegue coordinado y prueba en iPhone real.
- [ ] Colecciones — implementación y CI completadas en ambas versiones ([PR #125](https://github.com/vicenzoscavino1999/vinctus/pull/125), [detalle](revision-colecciones.md)); pendiente despliegue coordinado y prueba en iPhone real.
- [ ] Inteligencia artificial: chat y Arena — implementación y CI completadas en ambas versiones ([PR #126](https://github.com/vicenzoscavino1999/vinctus/pull/126), [detalle](revision-ia-arena.md)); pendiente despliegue coordinado y prueba en iPhone real.
- [ ] Cuenta y seguridad: acceso, recuperación, bloqueos, denuncias y eliminación de cuenta — implementación y CI completadas en ambas versiones ([PR #127](https://github.com/vicenzoscavino1999/vinctus/pull/127), [detalle](revision-cuenta-seguridad.md)); pendiente despliegue coordinado y prueba en iPhone real.
- [ ] Hardening transversal pre-producción (features web extra, App Check iOS en modo monitoreo, rescate de `staging` + `ChatUITests`, CSP/PWA) — implementación y CI completadas ([PR #128](https://github.com/vicenzoscavino1999/vinctus/pull/128), [detalle](revision-pre-produccion.md)); pendiente despliegue coordinado y prueba en iPhone real.

## Forma de trabajo acordada por módulo

Por indicación del propietario (16 de noviembre de 2026), mientras el despliegue en nube y la verificación en iPhone físico quedan pospuestos para la etapa final a cargo del propietario, el desarrollo avanza **módulo por módulo** siguiendo el orden de la lista anterior:

- **Alcance por módulo**: cada funcionalidad se revisa, corrige y prueba de extremo a extremo tanto en la **web (`src`)** como en la **app nativa (`ios-native/VinctusNative`)**, incluyendo `functions`, reglas (`firestore.rules`, `storage.rules`) y `shared/firestore-contract.json` cuando corresponda.
- **Separación de estado**: al terminar cada módulo se deja documentado y verificado por separado qué corresponde a:
  1. **Implementación y pruebas automatizadas** (suite local + CI completa de web e iOS en GitHub Actions).
  2. **Despliegue coordinado** (`staging` aislado con observación de 24–48 h, reglas, índices/TTL, Cloud Functions, migraciones de datos existentes, producción web y nuevo build de TestFlight).
  3. **Pruebas en iPhone real**.
- **Criterio de casillas y ramas**: las casillas cuyos despliegues o pruebas físicas en iPhone sigan pendientes no se marcan como cierre total del módulo. Cada módulo nuevo se trabaja en una rama y PR borrador apilados sobre el módulo anterior para mantener diffs limpios sin fusionar a `main` antes del despliegue coordinado.
- **Fase final**: una vez completada la revisión por módulos en código y CI, el propietario se encargará del aprovisionamiento de credenciales/staging, despliegues coordinados, migraciones, subida a TestFlight y pruebas físicas en iPhone. Ver la guía operativa consolidada en [plan-despliegue-coordinado.md](plan-despliegue-coordinado.md).

## Conversaciones nativas

Cambios en el [PR #119](https://github.com/vicenzoscavino1999/vinctus/pull/119): historial paginado, desplazamiento con mensajes nuevos, conservación de conversaciones ante errores de listeners, lecturas visibles con la app activa, protección frente a respuestas tardías, conservación del borrador y adjuntos, y reintentos con el mismo identificador. También se incorporaron fotos, videos, grabación de voz, vistas previas y progreso de subida, y se corrigió la barra inferior que tapaba el compositor.

En `cb9653e` pasaron compilación ReleaseProd, pruebas unitarias, 23 pruebas de integración con Firebase y tres pruebas de interfaz. La ampliación de compatibilidad añade fixtures compartidos con la web y una prueba de reproducción con AVPlayer de WAV y MP4; consultar el PR para los resultados de CI del último commit.

## Conversaciones web y compatibilidad

La revisión confirmó que el hilo web ocultaba adjuntos y el compositor solo enviaba texto. También se corrigieron la pérdida de borradores ante errores, la generación de identificadores diferentes en reintentos automáticos, la lectura basada únicamente en abrir el chat, los límites de 50 conversaciones y las respuestas tardías.

Funciones incorporadas o corregidas:

- Selección de fotos, videos, audio y documentos compatibles con las reglas compartidas; hasta diez adjuntos por mensaje.
- Reproducción de audio y video en el hilo, imágenes junto con su texto y enlaces seguros para abrir archivos. Los errores de reproducción ofrecen el enlace como alternativa.
- Notas de voz web de hasta cinco minutos, preparadas como WAV PCM mono a 16 kHz para su reproducción nativa. El micrófono se libera al terminar, cancelar o salir del componente.
- Borradores y envíos fallidos separados por cuenta y conversación; bloqueo de doble envío, identificadores y rutas de subida estables y reutilización de adjuntos ya subidos al reintentar.
- Confirmación de la lectura visible con la ventana activa, avance monotónico y protección frente a respuestas de sesiones anteriores.
- Historial con cursor de fecha e ID, conservación de la ventana abierta, manejo de cachés parciales, carga de mensajes anteriores y conservación de la posición de lectura.
- Protección de la lista ante errores y eliminación del límite que ocultaba conversaciones antiguas.
- Identificación de participantes cuyos UID contienen guiones bajos.
- Configuración de Firestore Lite para usar también el emulador en las pruebas locales.

Validación local de esta ampliación:

- [x] TypeScript, lint de archivos modificados y compilación de producción.
- [x] Más de 400 pruebas unitarias de la web; umbrales de cobertura aprobados. Incluyen la pausa del reproductor al salir del chat o pasar a segundo plano.
- [x] Contrato generado actualizado, dependencias sin ciclos y guardrail de listeners.
- [x] Navegador y Firebase local: foto PNG, video MP4 y audio WAV enviados y recibidos entre dos cuentas, con imagen y metadatos de reproducción válidos.
- [x] Grabación real mediante MediaRecorder con entrada de micrófono sintética de Chromium, preparación WAV y envío sin texto.
- [x] Pérdida de conexión, conservación de un borrador nuevo, reintento sin duplicados y recuperación del borrador al volver al chat.
- [x] Historial de 105 mensajes con fechas iguales: dos páginas anteriores sin perder ni duplicar filas.

Las pruebas usan `Tests/Fixtures/chat-interop.json` y `chat-video.mp4` de la app nativa. La web compara su codificación WAV con el fixture exacto; el test nativo comprueba los campos compartidos y que AVPlayer reconoce ambos archivos. Estos fixtures cubren formatos comunes; los códecs y permisos de un dispositivo real requieren la comprobación siguiente.

## Pendiente en un iPhone real

- [ ] Reproducción audible y grabación de notas de voz en ambas versiones.
- [ ] Selección y reproducción de videos reales de la fototeca, especialmente MOV/HEVC.
- [ ] Llamadas, cambios de salida de audio y paso a segundo plano.
- [ ] Revisión de permisos de micrófono y selección de archivos en Safari.

## Backend y despliegues

Ambas versiones comparten Firebase y el contrato de mensajes. Video y audio conservan `kind=file`; el contenido MIME determina el reproductor. Los controles web y Swift son implementaciones separadas y necesitan pruebas por plataforma.

Las reglas de Storage se desplegaron en producción (`vinctus-daf32`) el 12 de noviembre de 2026, a las 23:03 UTC, con copia previa de las reglas anteriores. Se verificó que Storage y Firestore activos coincidían con el repositorio. Límites: fotos y audio de menos de 10 MB, videos de menos de 25 MB; hasta diez adjuntos por mensaje. Esta ampliación web no requiere otro cambio de reglas.

Los cambios de la app y de la web se mantienen en el PR; comprobar su estado antes de publicar. La validación local no equivale a un despliegue web de producción ni a una versión de App Store.

Estado de publicación al 13 de noviembre: [candidato web y resultados de release](release-conversaciones-2026-11-12.md). El candidato web compiló con configuración de producción sin cambiar el dominio público. Falta completar el staging aislado y sus 24 horas de observación exigidas por el runbook. **Vinctus 1.0.0 (2) ya fue firmada y subida a TestFlight desde una Mac de GitHub**; Apple la procesó y habilitó para pruebas internas en el grupo **Vinctus QA**. La [guía de TestFlight sin Mac propia](testflight-sin-mac.md) conserva la configuración. La instalación y prueba física siguen pendientes; no se envió la app a revisión pública.

## Publicaciones / Comunidad: revisión en curso

El propietario autorizó avanzar con este módulo mientras siguen pendientes la
instalación de TestFlight y las pruebas físicas de Conversaciones. Los cambios de
esta etapa se separan en `fix/posts-community`, a partir de `fix/ios-conversations`.

Revisar en ambas versiones:

1. Crear una publicación y comprobar el feed, el perfil y el grupo correspondiente.
2. Likes, comentarios y contadores.
3. Paginación, conexión lenta, errores y reintentos.
4. Permisos y visibilidad.
5. Comparar las capacidades de adjuntos. La segunda etapa añade fotos, videos,
   documentos y YouTube al publicador nativo y comprueba la recuperación de
   subidas parciales. La validación automatizada pasó; falta la prueba física.

Primera etapa: envío fiable de comentarios en ambas versiones, aislamiento del
panel web por cuenta/publicación, conservación de borradores nativos y protección
del feed nativo ante páginas antiguas que terminan después de actualizar. Consultar
[la revisión de Publicaciones](revision-publicaciones-comunidad.md) para el alcance,
los resultados de las pruebas y el trabajo que queda. El módulo sigue abierto.

La segunda etapa cubre creación y adjuntos en ambas versiones, con IDs/rutas
estables y protección de publicaciones ya confirmadas. La web tiene 438 pruebas
aprobadas y un flujo de navegador que recupera una subida parcial sin duplicar
el post ni sobrescribir la imagen. La compilación, las pruebas unitarias y 26
pruebas de integración nativas de esta ampliación pasaron en CI; también pasó la
CI web completa con tres flujos smoke. Todavía no se publicó una versión nueva.

La tercera etapa añade comentarios nativos recientes con páginas de 20 y reintentos
que conservan el historial. Corrige además el contador de publicaciones del servidor:
los archivos pendientes o fallidos ya no cuentan y los eventos repetidos o tardíos
reconcilian el estado actual. Pasaron las tres pruebas nuevas con Functions locales
y en CI, la CI web completa, ReleaseProd, las pruebas unitarias y 27 pruebas de
integración nativas. La prueba nueva recorre 105 comentarios de la misma fecha,
con borrado del cursor e inserción entre páginas. Los cambios del servidor y su
índice todavía no están desplegados; tampoco se subió otra versión a TestFlight.

La cuarta etapa revisa likes y guardados en web e iOS: consulta confirmada de
estado, bloqueo de doble toque, reintento del mismo valor y conservación de las
fechas. Ambas versiones incorporan la lista paginada de publicaciones guardadas
en el perfil propio. Pasaron 462 pruebas web con cobertura, 65 API/backend,
la CI web completa con cuatro flujos smoke, ReleaseProd, las pruebas unitarias
y 29 pruebas de integración nativas. El recorrido de navegador recupera commits
aceptados cuya respuesta se pierde, conserva fechas y comprueba la lista del
perfil, la recarga y otra cuenta. Los controles de Descubrir y la visibilidad
siguen pendientes. Los cambios
continúan en el PR; no se desplegaron ni se subió otro build de TestFlight.

La quinta etapa corrige el backend compartido de likes, comentarios y karma:
reconcilia los totales actuales, evita puntos duplicados por eventos tardíos y
no recrea perfiles eliminados. Corrige el mapa de karma por categoría que leen
ambas versiones y conserva el karma histórico al borrar una publicación.
Incluye una auditoría acotada de solo lectura; no reconstruye puntos históricos
sobrescritos ni aplica reparaciones generales. No modifica el código iOS: sigue
vigente la validación nativa de la cuarta etapa. Consultar la revisión de
Publicaciones para los resultados del backend y del navegador. El despliegue
y la comprobación en dispositivo siguen pendientes.

La sexta etapa exige permisos de escritura en el servidor compartido: membresía
real para publicar en grupos, post publicado y ausencia de bloqueos para nuevas
interacciones. Conserva la retirada de reacciones propias tras un bloqueo o un
borrado y añade pruebas de integración nativas para estos permisos. La privacidad
de lectura del feed y de los adjuntos sigue pendiente; esta etapa no convierte
las publicaciones de grupos privados en contenido confidencial. Las reglas
continúan sin desplegarse.

La séptima etapa adapta las lecturas de publicaciones y comentarios a un servicio
compartido que aplica privacidad de cuentas, membresía real y bloqueos. La web y
la app nativa usan cursores opacos y descargan adjuntos con autorización por cada
parte, sin entregar enlaces públicos. Incluye migración de enlaces antiguos y
fragmentos de notificaciones. Las pruebas locales y la CI se documentan en el
PR; la protección no está activa en producción hasta completar el despliegue
coordinado y la migración. El módulo y la prueba en iPhone real siguen abiertos.

La octava etapa corrige los likes y guardados de publicaciones en Descubrir web:
lectura confirmada por post, total sin contar dos veces el like propio y reintentos
del mismo valor después de perder una confirmación. Se valida un post fuera de
los primeros 50 índices, su recarga y otra cuenta. En iOS se revisaron las acciones
equivalentes del feed/detalle, que ya usan consultas individuales y conservan la
validación nativa anterior; Descubrir nativo aún no incluye publicaciones. No se
modifica Swift en esta etapa ni se publica otra versión.

La novena etapa añade recuperación local de borradores en web e iOS, con copias
duraderas de adjuntos e identificador de envío guardado antes de publicar. Los
borradores se separan por cuenta/grupo y conservan los cambios nuevos mientras
otro envío termina. Incluye descarte explícito, errores de guardado visibles y
protección frente a editores antiguos. Una integración nativa recupera un post
aceptado cuya respuesta se perdió y comprueba que el reintento conserva el objeto
y las fechas. Consultar el PR para la compilación y las pruebas nativas de esta
etapa. Son borradores de cada dispositivo; no se sincronizan entre web e iPhone.

La décima etapa incorpora la política y limpieza segura de subidas remotas
abandonadas en dos fases, compatible con los borradores locales recuperables:
conserva intactos durante siete días los envíos incompletos (`uploading`/`failed`)
y extiende la ventana cuando hay objetos recientes en Storage; nunca toca
publicaciones confirmadas (`ready` o heredadas sin estado). Tras siete días sin
actividad, retira el documento a un tombstone `abandoned`, bloquea en reglas
nuevas subidas/actualizaciones/borrados de cliente sobre ese ID, purga los
objetos del prefijo en dos pasadas con concesión transaccional (incluida una
segunda pasada tras ocho días para sesiones reanudables preautorizadas) y elimina
el tombstone al concluir. El barrido pagina con cursor (`startAfter` por fecha e
ID) para que las subidas activas o actualizadas recientemente no bloqueen el
retiro de envíos abandonados posteriores. Si el usuario reabre después un
borrador local cuyo ID fue retirado, web e iOS rotan y persisten un nuevo
`postId` antes de subir las copias locales.

La undécima etapa completa los flujos pendientes de creación desde perfil y
grupos, actualización inmediata de listas y apertura de detalle en web e iOS:
en web añade el botón `Publicar` en la cuadrícula del perfil propio, conserva la
ruta `/profile` al publicar desde la cabecera, refresca automáticamente las
publicaciones de perfil y grupo tras publicar, abre `/post/:postId` al tocar
una publicación reciente del grupo y muestra en `PostDetailPage` tanto el cuerpo
multilínea sin título como los adjuntos visuales adicionales. En iOS añade el
botón `Publicar` en `PUBLICACIONES` del perfil propio, propaga `categoryID` al
publicar en grupos, refresca `FeedView`, `ProfileView` y `GroupView` al publicar
y convierte las tarjetas de `Publicaciones recientes` del grupo en enlaces a
`PostDetailView` con su `FeedItem` completo. Con esto queda terminada toda la
implementación y validación automatizada del módulo; la casilla permanece abierta
únicamente a la espera del despliegue coordinado y de las pruebas en iPhone real.

## Perfiles y seguidores: implementación y CI completadas

En el [PR #121](https://github.com/vicenzoscavino1999/vinctus/pull/121) ([detalle técnico](revision-perfiles-seguidores.md)), la implementación y la validación automatizada de **Perfiles y seguidores** quedan cerradas tanto en la web como en la app nativa iOS y el backend compartido:

- **Backend compartido**: reconciliación transaccional por `.count()` en `followers`/`following` (`functions/src/followCounts.ts`), validación de bloqueos y preservación de `createdAt` al aceptar solicitudes, limpieza simétrica en servidor mediante `onUserBlockedCreated`, bloqueo de escritura directa sobre contadores de perfil y límites de campos vinculados en `shared/firestore-contract.json` y `firestore.rules`.
- **Web (`src`)**: limpieza explícita con `null` y reinicio limpio al reabrir `EditProfileModal`, respeto de MIME real al subir avatar, separación de solicitudes entrantes frente a seguimiento saliente y detección de `AppError` (`PERMISSION_DENIED`) en `UserProfilePage` y `UserSearchPage`, comprobación/desbloqueo desde `UserProfilePage`, manejo de `PERMISSION_DENIED`, protección frente a cambios rápidos de pestaña y filtrado de bloqueados en `FollowListPage`, y eliminación de contribuciones con borrado en Storage.
- **App nativa iOS (`ios-native/VinctusNative`)**: lectura de estado en servidor con retry explícito en `FollowButton`, transacciones de seguimiento respetando privacidad y `createdAt`, detección concurrente al cancelar/aceptar solicitudes, aislamiento por sesión/perfil y bloqueo de listas en usuarios bloqueados desde `ProfileView`, saneado `http`/`https` y borrado de adjunto en Storage para contribuciones, y manejo explícito de errores/rollback en `FollowListView` y `EditProfileSheet`.

En el commit `299b764` pasaron completas tanto `CI` (`44111671324`: 518 pruebas web, 81 pruebas API/Functions, 83 pruebas de reglas, 13+13 pruebas reales de contadores/lecturas, build, Lighthouse y 12 flujos E2E en Chromium sin reintentos) como `iOS native` (`44111654860`: compilación `ReleaseProd`, suite unitaria y `passed: 35 failed: 0` de integración con emuladores Firebase). La casilla permanece sin marcar únicamente hasta ejecutar en la etapa final el despliegue coordinado (`staging` + reglas + Cloud Functions + web + TestFlight) y las pruebas en iPhone real.

## Grupos: implementación y CI completadas

En el [PR #122](https://github.com/vicenzoscavino1999/vinctus/pull/122) ([detalle técnico](revision-grupos.md)), la implementación y la validación automatizada de **Grupos** quedan cerradas tanto en la web como en la app nativa iOS y el backend compartido:

- **Backend compartido**: reconciliación transaccional de `memberCount` por `.count()` en `groups/{groupId}/members` (`functions/src/groupCounts.ts`), validación de existencia de grupo y miembro antes de crear conversaciones `grp_{groupId}`, limpieza completa en `onGroupDeleted` (miembros, `users/{uid}/memberships`, `group_requests`, chat grupal y objetos en Storage), lectura de miembros privados restringida a propietario/miembros activos, bloqueo de mutaciones cliente sobre `memberCount`, y reglas endurecidas en `members`, `memberships` y `group_requests` vinculadas en `shared/firestore-contract.json`.
- **Web (`src`)**: eliminación del doble incremento en `addGroupMember`, idempotencia en `joinGroupWithSync`, omisión de lecturas cruzadas sobre `users/{uid}/memberships` ajenos en `addGroupMember` y `acceptGroupJoinRequest`, verificación de membresía real en `sendGroupJoinRequest` para poder volver a solicitar tras salir de un grupo privado, ocultamiento de publicaciones y miembros privados en `GroupDetailView`/`GroupDetailContainer`, filtrado de usuarios bloqueados en miembros destacados, panel de miembros (para no propietarios), selector inicial de `CreateGroupModal` y `NotificationsPage`, tolerancia a fallos individuales en perfiles/invitaciones, apertura de perfil desde miembros destacados, desbloqueo de unión cuando una solicitud `pending` pertenece a un grupo ya público en `GroupDetailContainer`/`DiscoverPage`, scroll en `CreateGroupModal` y estabilidad de edición + `Quitar icono` en `GroupEditPage`.
- **App nativa iOS (`ios-native/VinctusNative`)**: propagación explícita de `permissionDenied` sin fuga de caché en `GroupsRepo`, tolerancia a miembros privados restringidos y perfiles individuales inaccesibles, transacción idempotente en `joinGroup`, validación de membresía previa y límites en `requestToJoin`, reseteo por sesión en ViewModels, desbloqueo de unión directa cuando un grupo con `.pending` cambia a `.public`, bloqueo visual de grupos privados, filtro de bloqueados antes del estado vacío y opción `Quitar ícono` + límite de nombre en `EditGroupSheet`.

En el commit `338ac9d` aprobaron `CI` (`44330224661`: `lint`, `typecheck`, `cost-gates`, `test` 528+84, `rules` 84/84, `post-counts` 14/14+13/13, `build`, `lhci` y `e2e` 13 passed), `iOS native` (`44330224612` PR y `44330211624` push: compilación `ReleaseProd`, suite unitaria y `passed: 36 failed: 0` en emuladores Firebase) e `iOS screenshots` (`44330210645`), revalidándose `CI` sobre el commit documental final. La casilla permanece sin marcar únicamente hasta ejecutar en la etapa final el despliegue coordinado (`staging` + reglas + Cloud Functions + web + TestFlight) y las pruebas en iPhone real.

## Historias: implementación y CI completadas

En el [PR #123](https://github.com/vicenzoscavino1999/vinctus/pull/123) ([detalle técnico](revision-historias.md)), la implementación y la validación automatizada de **Historias** quedan cerradas tanto en la web como en la app nativa iOS y el backend compartido:

- **Backend compartido**: límites de historia vinculados en `shared/firestore-contract.json` (`photoURLMaxLength`, `mediaUrlMaxLength`, `mediaPathMaxLength`), vinculación estricta de rutas y filtro por bloqueo mutuo en `firestore.rules`, paridad de lectura para seguidores y bloqueos en `storage.rules`, limpieza automática de Storage en `onStoryDeleted` (`functions/src/storyCleanup.ts`) y limpieza simétrica de índices `friends` en `cleanupFollowStateOnBlock`.
- **Web (`src`)**: preservación de MIME reales y exportación de `deleteStoryFiles` en Storage, `sanitizeStoryOwnerName`/`sanitizeStoryOwnerPhoto`/`deleteStory` y `createStoryReport`, exclusión de usuarios bloqueados y exposición de errores reales aunque existan Shorts de respaldo en `useStories`, compatibilidad con `<StrictMode>` y limpieza de huérfanos en `StoryComposerModal`, confirmación de borrado, denuncia/bloqueo en visor y bloqueo de interacciones mientras hay diálogos abiertos en `StoryViewerModal`, y estado de apertura/vistas acotado por usuario en `StoriesWidget`.
- **App nativa iOS (`ios-native/VinctusNative`)**: exclusión previa de `blockedUsers`, filtrado de expiradas y limpieza ante fallos de escritura en `StoriesRepo`, `sessionGeneration`/`reset()`/`excludeOwner`/`delete` en `StoriesViewModel`, recarga por cuenta en `StoriesViews`, página en blanco segura en `YouTubeEmbedView`, y reemplazo de gesto de pausa pegajoso + alerta en fallo de eliminación en `ModerationViews`/`StoryViewer`.

En el commit `028766d` aprobaron `CI` (`44389259896`: `lint`, `typecheck`, `cost-gates`, `test` 540+87, `rules` 87/87, `post-counts` 15/15+13/13, `build`, `lhci` y `e2e` 14 passed incluido `e2e/stories.spec.ts`), `iOS native` (`44389260284`: compilación `ReleaseProd`, suite unitaria con `StoriesTests` y `passed: 37 failed: 0` en emuladores Firebase con `StoriesIntegrationTests`) e `iOS screenshots` (`44395674952`), revalidándose `CI` sobre el commit documental final. La casilla permanece sin marcar únicamente hasta ejecutar en la etapa final el despliegue coordinado (`staging` + reglas + Cloud Functions + web + TestFlight) y las pruebas en iPhone real.

## Descubrir y búsqueda: implementación y CI completadas

En el [PR #124](https://github.com/vicenzoscavino1999/vinctus/pull/124) ([detalle técnico](revision-descubrir-busqueda.md)), la implementación y la validación automatizada de **Descubrir y búsqueda** quedan cerradas tanto en la web como en la app nativa iOS y el backend compartido:

- **Backend compartido**: decodificación HTML/XML completa con límite Unicode seguro (`<= 0x10ffff`), validación `http(s)://` en enlaces/fotos/miniaturas, `limit` entero estricto, `Allow: GET` en `405`, `Promise.allSettled` + filtrado de nulos en Hacker News y guarda `cover_id > 0` + respaldo de ID en Open Library dentro de `api/discover.ts`; decodificación de entidades HTML y validación de `limit` en `api/youtube-search.ts`, `api/youtube.ts` y `api/youtube-shorts.ts`; y validación estricta con `createdAt` inmutable en `users/{uid}/savedCategories/{categoryId}` en `firestore.rules`.
- **Web (`src`)**: paridad en `src/shared/lib/api.ts`, `retry()` en `useApiContent`, seguimiento/guardado idempotente en `savedItems.ts`; filtrado conjunto sin acentos de categorías y grupos preservando otros query params + respeto real de `sortBy` + `Promise.allSettled` en estados de grupo + reintentos en previews/grupos/Arena + guardas de secuencia y accesibilidad del modal YouTube en `DiscoverPage`; limpieza de estado al cambiar categoría, reintentos sin `reload()`, filtrado de bloqueados en Biblioteca y validación de URLs en `CategoryPage`; corrección de mojibake, ocultamiento de bloqueados, accesibilidad por teclado, reintentos y resultados de grupos (por nombre, descripción, ID y etiqueta de categoría) en `UserSearchPage`; y validación `http(s)://` de enlaces/imágenes + tecla Espacio en `ApiContentCard`/`CategoryCard`.
- **App nativa iOS (`ios-native/VinctusNative`)**: 6 categorías reales ordenadas por actividad y navegables a `DiscoverCategoryView` (pestañas `En Vivo`, `Comunidades` y `Biblioteca` con `/api/discover`, seguimiento idempotente de categoría y ocultamiento de bloqueados), filtrado sin acentos en `DiscoverView`, `ConnectionsSearchView`, `GroupSuggestionsViewModel` y `GroupsListView`, eliminación del fallback silencioso a caché ante `permission-denied`, guardas de generación y `reset()` de usuarios y grupos sugeridos al cerrar sesión, filtrado de bloqueados antes del estado vacío sin parpadeo durante búsqueda en `ConnectionsSearchView` y refresco de `BlockedUsersStore` por sesión en `MainTabView`.

En el commit `a4a2c60` aprobaron `CI` (`44441136993`: `lint`, `typecheck`, `cost-gates`, `test` 547+93, `rules` 88/88, `post-counts` 15/15+13/13, `build`, `lhci` y `e2e` 15 passed incluido `e2e/discover-search.spec.ts`), `iOS native` (`44441137039` PR y `44441130455` push: compilación `ReleaseProd`, suite unitaria con `GroupSuggestionsViewModelTests`/`DiscoverViewModelTests`/`DiscoverLiveDecodingTests`/`DiscoverCategoryViewModelTests` y `passed: 38 failed: 0` en emuladores Firebase con `DiscoverSearchIntegrationTests`) e `iOS screenshots` (`44441130498`), revalidándose `CI` sobre el commit documental final. La casilla permanece sin marcar únicamente hasta ejecutar en la etapa final el despliegue coordinado (`staging` + reglas + endpoints Vercel + web + TestFlight) y las pruebas en iPhone real.

## Colecciones: implementación y CI completadas

En el [PR #125](https://github.com/vicenzoscavino1999/vinctus/pull/125) ([detalle técnico](revision-colecciones.md)), la implementación y la validación automatizada de **Colecciones** quedan cerradas tanto en la web como en la app nativa iOS y el backend compartido:

- **Backend compartido**: validación estricta de URLs `http(s)` y pertenencia de `storagePath` (`collections/{uid}/{collectionId}/{itemId}/{filename}`) en `firestore.rules`; cierre de la vulnerabilidad de borrado arbitrario en Storage en `onCollectionItemDeleted` mediante `functions/src/collectionCleanup.ts`; reconciliación transaccional de `itemCount` en `onCollectionItemWritten`; purga paginada de ítems + prefijo de Storage en `onCollectionDeleted`; y pruebas en `firestore.rules.cases.ts`, `storage.rules.cases.ts`, `collectionCleanup.test.ts` y `scripts/collection-cleanup.integration.test.mjs`.
- **Web (`src`)**: `deleteCollectionFile` idempotente ante `404`, transacciones con IDs estables en `createCollection`/`createCollectionItem` y clampeo `itemCount >= 0` en `deleteCollectionItem`, borrado paginado de ítems + Storage en `deleteCollection`, reemplazo de `collectionGroup('items')` en `getRecentCollectionItems` por consultas directas con resolución del nombre vivo de carpeta; edición y borrado de carpetas desde `CreateCollectionModal`/`CollectionDetailModal` con confirmación inline, enlaces `Abrir` seguros para `link` y `file`, rechazo de archivos de `0` bytes, búsqueda sin acentos + `Reintentar`, accesibilidad modal y flujo E2E `e2e/collections.spec.ts`.
- **App nativa iOS (`ios-native/VinctusNative`)**: paridad de subida de archivos (`CollectionUploadFile` + `.fileImporter` en `CollectionDetailView`), transacciones en `addItem`/`deleteItem` con clampeo `itemCount >= 0` y borrado paginado + Storage en `deleteCollection`, validación `NewCollectionItem.safeHTTPURL`, búsqueda sin acentos y reseteo por sesión (`@EnvironmentObject authVM`), estado de error con `Reintentar` antes del estado vacío, contador de caracteres y prueba de integración `CollectionsIntegrationTests.testFileUploadDriftedItemCountDeleteAndStorageCleanup` con Storage emulator.

En el commit `1c5d7a9` aprobaron `CI` (`44463638745`: `lint`, `typecheck`, `cost-gates`, `test` 551+97, `rules` 90/90, `post-counts` 16/16+13/13, `build`, `lhci` y `e2e` 16 passed incluido `e2e/collections.spec.ts`), `iOS native` (`44463631948` push y `44463638593` PR: compilación `ReleaseProd`, suite unitaria y `passed: 39 failed: 0` en emuladores Firebase) e `iOS screenshots` (`44463631889`), revalidándose `CI` sobre el commit documental final. La casilla permanece sin marcar únicamente hasta ejecutar en la etapa final el despliegue coordinado (`staging` + reglas + Cloud Functions + web + TestFlight) y las pruebas en iPhone real.

## Inteligencia artificial (chat y Arena): implementación y CI completadas

En el [PR #126](https://github.com/vicenzoscavino1999/vinctus/pull/126) ([detalle técnico](revision-ia-arena.md)), la implementación y la validación automatizada de **Inteligencia artificial: chat y Arena** quedan cerradas tanto en la web como en la app nativa iOS y el backend compartido:

- **Backend compartido**: `Allow: POST` en `405`, recorte `trimChatHistory` en todas las respuestas (20 mensajes / 2000 chars por parte / 12000 totales / inicio en `user`) y reembolso de cuota de imagen acotado al día UTC reservado ante fallo de OpenAI en `api/chat.ts`; guardrails sin diacríticos y bidireccionales en `functions/src/arena/guardrails.ts`; corrección de mojibake y detección Unicode de fuentes/menciones, normalización de turnos cercados, fallback de modelo ante `503`/`overloaded`/timeouts y `classifyDebateGenerationError` en `functions/src/arena/helpers.ts`; validación de `MAX_TOPIC_CHARS` previa al truncado, timeout en Gemini y NVIDIA, verificación de claves/`clientDebateId` antes de descontar cuota, reembolso transaccional `refundRateLimit` ante fallo/colisión y saneado de `arenaDebates/{id}.error` en `createDebate.ts`/`rateLimit.ts`; reconciliación transaccional por `.count()` de `likesCount` en `functions/src/arenaCounts.ts`; y cobertura nueva en `api/chat.test.ts`, `functions/src/arena/arena.test.ts`, `scripts/arena-counts.integration.test.mjs`, `scripts/seed.mjs` y `firestore.rules.cases.ts`.
- **Web (`src`)**: caché de consentimiento IA aislada por usuario (`vinctus:ai-consent:v2:${uid}`), sincronización con servidor sin otorgamiento optimista y botón `Reintentar` en `SettingsPage`, `AIChatPage` y `ArenaPage`; recorte previo del historial y validación estricta de `data:image/*` en `aiChat.ts`; reinicio por cuenta, límite de caracteres, rechazo de imágenes vacías, guarda `imageReadSeqRef`, bloqueo de controles sin consentimiento y botón `Nueva conversación` en `AIChatPage`; transacciones idempotentes con `getDocFromServer` en likes/guardados de Arena, timeout de `300_000 ms` en `createDebate`, preflight `getDoc` antes de `onSnapshot` en `subscribeToDebate` (evitando crash `ca9/b815` de Firebase JS SDK 12.6.0 ante debates privados ajenos), vista explícita de debate no encontrado/privado, selector de visibilidad (`Público` / `Privado`), enlaces `sourceLinks` seguros `http(s)`, `Reintentar` + `savedDebatesSeqRef` en `ProfilePage` y pruebas nuevas (`ArenaPage.test.tsx`, `e2e/ai-arena.spec.ts`).
- **App nativa iOS (`ios-native/VinctusNative`)**: contadores de generación y reinicio al cambiar de cuenta o cerrar sesión en `AIConsentViewModel`, `SettingsViewModel` y `SavedDebatesViewModel`, botón `Reintentar` en `AIConsentGate` y `ProfileSavedDebatesSection`, recorte por parte (`<= 2000`) en `FirebaseAIRepo.trimmedHistory`, decodificación de acción `createGroup` con enlace `Ver grupo` en `AIChatBubble` (sin reenviar `groupID` en el historial), `Nueva conversación` y rollback que respeta nuevo borrador en `AIChatView`, `clientDebateId` estable + longitud mínima de 5 caracteres + captura de personalidades seleccionadas + `Reintentar` en `ArenaView`, guardado idempotente con límite de 80 chars en `saveDebate`, `removingIDs` + rollback seguro + estado vacío y `Reintentar` en `SavedDebateView`, ajustes de timeout en frío en `PostReadClient.swift`/`.github/workflows/ios-native.yml`, y nuevas pruebas unitarias y de integración (`AIIntegrationTests` contra Auth, Firestore y Functions).

En el commit `06dc337` (tras segunda pasada de revisión) aprobaron `CI` (`44587045685`: `lint`, `typecheck`, `cost-gates`, `test` 560+107, `rules` 91/91, `post-counts` 17/17+13/13, `build`, `lhci` y `e2e` 17 passed incluido `e2e/ai-arena.spec.ts`), `iOS native` (`44587031192` push y `44587045553` PR: compilación `ReleaseProd`, suite unitaria y `passed: 42 failed: 0` en emuladores Firebase), `iOS screenshots` (`44587030990`) y `Vercel`, revalidándose `CI` sobre el commit documental final. La casilla permanece sin marcar únicamente hasta ejecutar en la etapa final el despliegue coordinado (`staging` + `api/chat.ts` + Cloud Functions + web + TestFlight) y las pruebas en iPhone real.

## Cuenta y seguridad: implementación y CI completadas

En el [PR #127](https://github.com/vicenzoscavino1999/vinctus/pull/127) ([detalle técnico](revision-cuenta-seguridad.md)), la implementación y la validación automatizada de **Cuenta y seguridad** quedan cerradas tanto en la web como en la app nativa iOS y el backend compartido:

- **Backend compartido**: bloqueo de escritura en `friend_requests`, `collaboration_requests`, `notifications`, `conversations`, `typing` y adjuntos/miniaturas de Storage en DMs bloqueados (`firestore.rules`, `storage.rules`); limpieza adicional de `friend_requests` y `directConversations` en `onUserBlockedCreated`; prohibición de auto-denuncias y límites en `reports`; clasificación de denuncias de perfil (`targetType: 'user'`), preservación de `source: 'auto_moderation'` y escalado de prioridad en `onReportCreatedQueue`; borrado de adjuntos/miniaturas y limpieza de `lastMessage` (incluidos mensajes solo con media) al moderar mensajes; y endurecimiento integral de `deleteAccount.ts` (`timeoutSeconds: 540` + `1GB`, recuperación de jobs `processing` atascados >15 min, saneado de `lastError`, limpieza previa de miembros y `group_requests` en grupos propios, referencias `savedArenaDebates`/`likedArenaDebates`, `directConversations`, `lastMessage` en grupos restantes y `aiImageUsage`), con pruebas nuevas en `deleteAccountHelpers.test.ts`, `followCounts.test.ts`, `moderation.test.ts`, `firestore.rules.cases.ts`, `storage.rules.cases.ts` y `scripts/account-security.integration.test.mjs`.
- **Web (`src`)**: recuperación de contraseña sin enumeración de cuentas (`auth/user-not-found` suprimido), `sendEmailVerification` best-effort en registro, verificación inmediata de `oobCode` en `PasswordResetActionScreen` y guardas/validaciones en `LoginScreen`; propagación de errores en `getUserSettings` con reintento en `SettingsPrivacySecurityPage` y `SettingsNotificationsPage`; gestión completa de **Usuarios bloqueados** y confirmación antes de `revokeUserSessions`; acciones **Bloquear** (con confirmación) y **Reportar** en `UserProfilePage` + estado `"Has bloqueado a este usuario"`; limpieza de iconos/guardas en `ConversationDetailsPage`; preservación de `reviewNote`, filtros por estado, badge `Auto-moderación` y ocultamiento de auto-suspensión en `ModerationQueuePage`; transición limpia a `completed` ante `unauthenticated` y botón `"Actualizar estado"` en `DeleteAccountModal`; y pruebas nuevas (`PasswordResetActionScreen.test.tsx`, `SettingsPrivacySecurityPage.test.tsx`, `DeleteAccountModal.test.tsx`, `ModerationQueuePage.test.tsx`, `AuthContext.test.tsx`, `ProfileAndFollowFlows.test.tsx` y `e2e/account-security.spec.ts`).
- **App nativa iOS (`ios-native/VinctusNative`)**: `AccountSecurityRepo` / `FirebaseAccountSecurityRepo` y soporte en `SettingsViewModel`/`SettingsView` para `Cuenta privada` sincronizada atómicamente (`users` y `users_public`) con rollback y reintento, `Cambiar contraseña`, `Cerrar sesión en otros dispositivos` con confirmación y transición limpia a `.completed` en el polling de eliminación cuando el usuario de Auth ya fue borrado; `isSubmitting`, validación cliente, `sendEmailVerification()` best-effort y supresión de banner falso al cerrar sesión voluntariamente en `AuthViewModel`/`AuthRepo`/`AuthGateView`/`AuthSheets`; guardia `cannotReportSelf`, presupuesto exacto `ReportFields.maxUserDetailsLength(for:)`, y carga/error/reintento en `BlockedUsersStore`/`BlockedUsersView`; y pruebas nuevas (`AccountSecurityTests` y `AccountSecurityIntegrationTests` contra Auth, Firestore, Storage y Functions emulados).

En el commit `6716a88` aprobaron `CI` (`44604170417`: `lint`, `typecheck`, `cost-gates`, `test` 569+112, `rules` 94/94, `post-counts` 21/21+13/13, `build`, `lhci` y `e2e` 20 passed incluidos los 3 flujos de `e2e/account-security.spec.ts`), `iOS native` (`44604170326` PR y `44604064198` push: compilación `ReleaseProd`, suite unitaria y `passed: 45 failed: 0` en emuladores Firebase), `iOS screenshots` (`44604064275`) y `Vercel`, revalidándose la suite completa en el `HEAD` final del PR tras acotar el reintento de Storage en `EmulatorTestCase.swift`. La casilla permanece sin marcar únicamente hasta ejecutar en la etapa final el despliegue coordinado (`staging` + reglas + Cloud Functions + web + TestFlight) y las pruebas en iPhone real.
