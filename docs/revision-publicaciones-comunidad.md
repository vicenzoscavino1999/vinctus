# Revisión de Publicaciones y Comunidad

Inicio: 13 de noviembre de 2026. El propietario autorizó avanzar mientras quedan
pendientes la instalación y las pruebas de Conversaciones en un iPhone. Esta
etapa parte de `fix/ios-conversations`; no cambia el build 2 ya subido a TestFlight.

## Primera etapa: comentarios, borradores y respuestas tardías

Problemas encontrados:

- El reintento automático web generaba un comentario nuevo en cada intento. Si
  el servidor había aceptado el primero y su respuesta se perdía, podía duplicarlo.
- La app nativa tampoco conservaba un identificador para reintentar comentarios.
- El panel web aceptaba respuestas de cargas anteriores y se reiniciaba al
  cambiar los contadores del mismo post. También perdía el total optimista al
  recargar la primera página.
- La app nativa limpiaba el texto actual al completar un envío de comentario o
  publicación, aunque el borrador hubiera cambiado durante la petición.
- Una página antigua del feed nativo podía mezclarse con una actualización más
  reciente y reemplazar su cursor. Las recargas de comentarios tenían una carrera
  similar.

Correcciones de esta etapa:

- Identificador estable por intento de comentario en ambas versiones y creación
  mediante transacción: un comentario existente del mismo autor/post/texto se
  reconoce como enviado. Otro autor o texto no puede reutilizarlo.
- El reintento no actualiza el comentario, su fecha ni vuelve a disparar el
  contador. En web, la notificación tiene ID derivado del comentario y se intenta
  solamente cuando se crea el documento.
- Bloqueo inmediato del doble envío. Un borrador editado recibe otro ID; el texto
  nuevo se conserva si termina un envío anterior.
- Panel web con sesión por cuenta/post, descarte de respuestas antiguas, páginas
  sin filas duplicadas y conservación de comentarios ante errores de carga.
- Conservación del total web tras enviar y recargar. El contador no sustituye
  los agregados de Cloud Functions que todavía deben revisarse.
- Generación de peticiones en el feed y los comentarios nativos para que solo
  la actualización vigente cambie el estado.

## Validación

- [x] TypeScript y compilación web de producción.
- [x] 414 pruebas web y cobertura aprobada; 26 pruebas específicas de API,
      transacciones, sesión de comentarios y montaje del panel.
- [x] 65 pruebas de API/backend existentes.
- [x] ESLint del proyecto activo (`--ignore-pattern .claude/**` para excluir otro
      checkout local), contrato generado, dependencias sin ciclos y guardrail de listeners.
- [x] Chromium y Firebase local (Auth, Firestore, Storage y Functions): un comentario
      conserva el borrador sin conexión, se reenvía al reconectar y llega a otra cuenta.
      Se comprobó que solo existe un documento con ese texto y el contador muestra uno.
- [x] Compilación ReleaseProd, pruebas unitarias y 24 pruebas de integración nativas:
      ejecución
      [43442655918](https://github.com/vicenzoscavino1999/vinctus/actions/runs/43442655918)
      aprobada sobre `dec69db`. Hasta cerrar la primera etapa en `355cb61`, el
      árbol `ios-native` seguía idéntico; la segunda etapa sí lo modifica.
- [x] CI completa (incluye reglas, dos flujos smoke en navegador y Lighthouse):
      ejecución [43443770217](https://github.com/vicenzoscavino1999/vinctus/actions/runs/43443770217)
      aprobada sobre `87c48b3`. El ajuste posterior de sincronización de contadores
      conserva las ocho pruebas del panel/hook aprobadas y se revalidó en
      [43446918133](https://github.com/vicenzoscavino1999/vinctus/actions/runs/43446918133).

Los tests de Swift se ejecutan en una Mac de GitHub; no equivalen a probar en
un iPhone físico. La prueba local usa exclusivamente el proyecto emulado
`vinctus-dev` y no escribe datos de producción.

## Pendiente para cerrar el módulo

- Pruebas de la segunda etapa en un iPhone físico.
- Likes/guardados, contadores de likes/comentarios y creación desde perfil/grupo.
  La tercera etapa corrige `postsCount`; su despliegue y la comprobación de los
  agregados de producción siguen pendientes.
  La cuarta etapa corrige la lectura de likes nativos y los toggles del feed y
  detalle web. La quinta etapa corrige los agregados de likes/karma y comentarios,
  los eventos fuera de orden y la recreación de perfiles borrados. Su despliegue,
  la auditoría de datos históricos y cualquier reparación siguen pendientes.
  Descubrir conserva sus controles anteriores del contexto y queda por revisar
  con ese módulo (incluidos el límite de 50 IDs y las preferencias anónimas).
- Reglas y visibilidad: actualmente posts/comentarios tienen lectura pública;
  revisar el alcance esperado para grupos privados y bloqueos antes de cambiarlas.
  La sexta etapa refuerza la autorización de escrituras, pero no cierra la
  privacidad de lectura del feed, perfiles, comentarios ni enlaces de adjuntos.
- Pruebas en dispositivo, despliegue y versión posterior de TestFlight.
- Recuperación tras cerrar el editor o recargar la app y política de limpieza de
  borradores incompletos y sus objetos de Storage. Esta etapa recupera el envío
  mientras el editor conserva en memoria su selección.

El PR puede generar una vista previa de Vercel automáticamente. Esta etapa no
se ha promovido al dominio de producción ni subido a TestFlight, y el módulo
sigue abierto.

## Segunda etapa: crear publicaciones y recuperar sus adjuntos

La web creaba un ID nuevo en cada intento y usaba la hora para nombrar los objetos
de Storage. Además, una excepción de navegación o actualización de pantalla podía
marcar como fallido un post ya confirmado y borrar sus archivos.

Cambios:

- Cada borrador conserva un ID de post y un ID por archivo. Si una subida falla a
  mitad, el reintento comprueba metadatos y recupera los objetos completos sin
  sobrescribirlos. Las reglas actuales prohíben sobrescrituras y no cambiaron.
- Creación y finalización mediante transacciones en web e iOS: no se reinician
  fechas, contadores ni archivos de un post existente; `ready` es terminal para
  el flujo de subida. Los reintentos comprueban autor, texto, título y grupo.
- Los errores de presentación quedan fuera de la confirmación. No se degradan ni
  borran adjuntos de una publicación que pudo haberse guardado.
- Formulario nativo con título, fotos, videos, documentos y enlace de YouTube;
  hasta diez elementos en total y límites del contrato de Storage para posts
  (imagen <10 MB, video <100 MB y documento <25 MB). Los videos no incluyen el
  campo opcional `size` de Firestore, cuyo límite es menor que el de Storage.
- Fotos convertidas a JPEG, archivos temporales propios, importación de videos por
  archivo y progreso de envío. La selección se conserva ante fallos del envío.
- El detalle nativo lee los adjuntos de la web, abre fotos/video/documentos y
  ofrece YouTube mediante un enlace a su URL canónica. Los videos tienen también
  enlace al archivo original. Feed/perfil muestran título y vista previa.
- Feed, perfil y resúmenes de grupos nativos omiten posts `uploading`/`failed`.
  El cursor se conserva sobre los documentos originales y las listas vacías con
  páginas pendientes permiten continuar. Esto es filtrado de presentación, no un
  cambio de las reglas de lectura pública pendientes de revisar.
- La web admite posts de solo título, adjunto o YouTube y normaliza el título
  opcional vacío. Los modales se montan en `document.body` para evitar que un
  contenedor transformado los recorte; el panel de comentarios tiene altura de
  ventana y contenido desplazable.

Validación de esta etapa:

- [x] Pruebas de reintento, doble envío, borradores modificados, cierre del editor,
      errores de presentación, MIME/tamaños, objetos parciales y transacciones.
- [x] Chromium/Firebase local: fallo 403 provocado al iniciar el video después
      de subir una imagen, conservación del formulario y reintento. Se verifica una
      sola publicación, su fecha original, tres adjuntos y una única subida de imagen;
      otra cuenta recibe la foto, el MP4 reproducible y el enlace al documento.
- [x] Repetición del navegador con la corrección de posición de los modales y
      comprobación de que el panel queda dentro de la ventana.
- [x] Reproducción real del MP4 (avanza su tiempo) y descarga del PDF con bytes
      idénticos desde otra cuenta. El flujo de publicación se incorpora a `@smoke`.
- [x] TypeScript, compilación web, 438 pruebas con cobertura y 65 pruebas de API/
      backend. Incluyen posts de solo título y normalización de título vacío.
- [x] ESLint de archivos cambiados, contrato generado, ciclos y listeners.
- [x] CI nativa: ReleaseProd, pruebas unitarias y 26 pruebas de integración con
      Firebase aprobadas en
      [43463134003](https://github.com/vicenzoscavino1999/vinctus/actions/runs/43463134003)
      sobre `1d2cbc5`. La integración empieza con una imagen ya subida y comprueba
      que su generación no cambie al recuperar el post; también descarga los bytes y
      verifica cuatro adjuntos en feed/perfil. El import del overlay SwiftUI que
      define `PhotosPickerItem` quedó corregido antes de esta ejecución.
- [x] CI web completa aprobada en
      [43463154984](https://github.com/vicenzoscavino1999/vinctus/actions/runs/43463154984),
      incluido el nuevo flujo smoke: 438 pruebas web, 65 de API/backend, tres flujos
      smoke, build, reglas, lint, tipos, Lighthouse y cost gates.

La simulación valida transporte y permisos de archivos. El fixture de video de
la integración nativa no valida códecs; el MP4 real se comprueba en el navegador.
La selección y reproducción en un iPhone físico siguen pendientes.

## Tercera etapa: historial de comentarios y contador de publicaciones

La app nativa cargaba únicamente los 80 comentarios más antiguos. Ahora consulta
primero los recientes, en páginas de 20, y ofrece cargar los anteriores. El cursor
conserva la precisión de `Timestamp` y el ID para separar comentarios con la misma
fecha, incluso si se borra el documento que servía de referencia. La web ya usa
el mismo orden descendente.

Una carga fallida conserva las filas y el cursor para reintentar. La actualización
o el envío de un comentario invalida las páginas anteriores pendientes; no pueden
mezclarse con los resultados nuevos. Los comentarios se deduplican por ID y la
interfaz distingue una carga inicial de una carga de anteriores. El contador del
detalle suma los envíos confirmados aunque haya más comentarios que filas cargadas.

El servidor incrementaba `postsCount` al crear cualquier documento, incluido
`uploading`, y no lo corregía al completar o fallar la subida. La reconciliación
nueva cuenta los datos actuales dentro de una transacción: total del autor menos
estados distintos de `ready`. Conserva posts antiguos sin estado o con estado
nulo. Se ejecuta al crear, borrar o cambiar estado/autor; los cambios de likes o
texto no vuelven a contar. Los eventos repetidos o fuera de orden no aplican deltas.
Si falta la cuenta no se recrea; tampoco se recrea un perfil público eliminado.
Los contadores iguales no se vuelven a escribir y los errores permiten reintentar
el evento.

Validación de esta etapa:

- [x] Compilación TypeScript de Cloud Functions y 65 pruebas API/backend.
- [x] Tres pruebas nuevas con Cloud Functions y Firebase locales: estados de
      subida/fallo/listo, posts antiguos, eventos tardíos/repetidos, autores distintos,
      borrados y cuentas eliminadas. Se ejecutan con `npm run test:post-counts` y
      se incorporan como job obligatorio de CI.
- [x] Compilación ReleaseProd, pruebas unitarias y 27 pruebas de integración
      nativas aprobadas en
      [43495734828](https://github.com/vicenzoscavino1999/vinctus/actions/runs/43495734828)
      sobre `c65e5f4`. Incluyen tres pruebas de estado y una integración con
      105 comentarios de la misma fecha, seis páginas, borrado del cursor e
      inserción concurrente. El total usa una base estable para no duplicar el
      incremento al actualizar el feed.
- [x] Chromium con Functions locales: recuperación de una subida parcial y
      reenvío de comentarios, ambos flujos aprobados.
- [x] CI completa aprobada en
      [43495734877](https://github.com/vicenzoscavino1999/vinctus/actions/runs/43495734877)
      sobre `c65e5f4`: 438 pruebas web, 65 API/backend, tres pruebas nuevas del
      contador, tres flujos smoke, reglas, tipos, lint, build, Lighthouse y cost gates.

La primera CI de esta etapa falló antes de abrir el navegador: `ubuntu-latest`
pasó a 26.04 y Playwright 1.57 del lockfile no soporta esa imagen. Los jobs de
navegador y Lighthouse quedan fijados a Ubuntu 24.04 para ejecutar la versión
ya instalada del proyecto.

Despliegue posterior: crear primero el índice `posts(authorId ASC, status ASC)`
y esperar a que esté listo antes de publicar `onPostCreated`, `onPostDeleted` y
`onPostUpdatedCount`. Cada reconciliación
usa dos agregados `count` por autor y dos lecturas de perfil, con hasta dos escrituras;
el coste de los agregados crece con las entradas del índice del autor. No se hace
un barrido de cuentas: el siguiente evento de publicación corrige el autor afectado.
Una reparación general de contadores existentes necesita su propia comprobación.
No se desplegaron Functions, índices ni una versión nueva de la app en esta etapa.

## Cuarta etapa: likes y publicaciones guardadas en ambas versiones

La app nativa convertía errores al consultar un like en `false` y permitía cambiarlo
antes de conocer el estado. El feed y el detalle web permitían escrituras simultáneas
y podían deshacer una selección más reciente al fallar una solicitud antigua. La
tarjeta web también sumaba uno a un total que ya podía incluir el like del usuario.

Cambios de esta etapa:

- Lecturas de estado desde el servidor, con estado sin confirmar, carga y reintento
  explícitos. Una consulta fallida no significa que el like/guardado no exista.
- Flujo por cuenta/publicación en web y en los botones nativos: una operación por
  reacción, bloqueo de doble toque y conservación del valor deseado si falla la
  confirmación. Reintentar repite ese valor; no lo invierte. El rollback visual
  restaura el total exacto anterior, incluso cero.
- Creación de likes y guardados mediante transacciones que conservan `createdAt`.
  Se repara un índice privado de likes ausente sin sobrescribir el like original.
  No se añaden reacciones a posts inexistentes o pendientes. Quitar sigue siendo
  una operación idempotente sobre el documento y su índice.
- Feed, detalle y tarjetas web usan el mismo flujo. Las confirmaciones actualizan
  el contexto compartido de la cuenta y sobreviven a una consulta de arranque que
  termine tarde. Las solicitudes de otra cuenta/publicación no alteran la sesión nueva.
- La app nativa permite guardar/quitar desde el feed y el detalle. El perfil propio
  abre una lista paginada de publicaciones guardadas. La web incorpora esa lista
  en su perfil: antes solo mostraba debates guardados de Arena.
- Ambas listas avanzan sobre el índice original aunque los posts referidos se hayan
  borrado o sigan pendientes; una página vacía puede tener páginas posteriores.
  Conservan las filas y el cursor al fallar, descartan respuestas de una ventana
  anterior y filtran los autores bloqueados en la presentación.

Validación:

- [x] TypeScript y lint de los archivos modificados; pruebas de estados, sesiones,
      reintentos, fechas, índices incompletos y páginas vacías de guardados.
- [x] 462 pruebas web con cobertura aprobada: statements 93,03 %, ramas 89,10 %,
      funciones 90,72 % y líneas 94,67 % sobre `75350cc`.
- [x] Navegador con Functions locales: se pierde la respuesta de commits de like
      y guardado ya aceptados; el reintento conserva fechas y selección. Se comprueban
      el perfil, la recarga, otra cuenta y la eliminación de ambas reacciones. El
      recorrido final sobre `c63c4bf` pasó sin reintentos; el ajuste posterior de
      contadores tiene pruebas específicas en ambas versiones.
- [x] CI completa aprobada en
      [43513648601](https://github.com/vicenzoscavino1999/vinctus/actions/runs/43513648601)
      sobre `75350cc`: 462 pruebas web, 65 API/backend, tres pruebas de contadores,
      cuatro flujos smoke sin reintentos, reglas, lint, tipos, build, Lighthouse y
      cost gates. Incluye el recorrido nuevo de likes/guardados.
- [x] ReleaseProd, pruebas unitarias y 29 pruebas de integración nativas aprobadas en
      [43513648513](https://github.com/vicenzoscavino1999/vinctus/actions/runs/43513648513)
      sobre `75350cc`. Incluyen consulta fallida, doble toque, confirmación perdida,
      reintento de guardado, contador actualizado, reparación del índice, fechas
      inmutables, paginación sobre posts borrados y aislamiento de los guardados por cuenta.

El escenario de navegador provoca el error después de que Firestore haya aceptado
el commit. Comprueba por REST local que el documento existe y que el reintento no
cambia su fecha. Las transacciones necesitan conexión; sin confirmación se conserva
la elección en la pantalla para reintentar. Cerrar la pantalla aún pierde ese estado
en memoria; la lectura siguiente consulta el estado que realmente tiene el servidor.

Coste de lectura: dos consultas de documento por post visible para conocer like y
guardado (24 para una página web de 12 posts), sin listeners nuevos. Una página web
de guardados consulta hasta 13 entradas del índice, hasta 12 posts y los bloqueos;
iOS usa 21 entradas y hasta 20 posts. Los cursores evitan recorrer todo el historial.
No se modifican en esta etapa los agregados de likes/karma/comentarios ni sus reglas
de visibilidad pública. Tampoco se publica producción ni otra versión de TestFlight.

Prueba física pendiente cuando esté disponible la versión nueva:

- Dar/quitar like, esperar la actualización del contador y recargar ambas versiones.
- Guardar desde web, abrirlo en la lista del iPhone y quitarlo desde allí; repetir
  el recorrido empezando en iOS y comprobar que solo aparezca en la cuenta correcta.
- Cambiar una reacción sin conexión, reconectar y reintentar: debe conservar la
  elección original. Cerrar/reabrir consulta el estado real del servidor.
- Cambiar de cuenta con una petición pendiente y comprobar que su respuesta no
  cambie la nueva cuenta ni permita consultar los guardados de la anterior.

## Quinta etapa: contadores compartidos y karma por categoría

Se reprodujo un error del servidor anterior: entregar primero el borrado y después
la creación dejaba un like y un comentario contados, y dos puntos de karma, aunque
las dos subcolecciones estuvieran vacías. Además, el karma por categoría se guardaba
como un campo literal `karmaByInterest.science`, en lugar del mapa anidado que leen
la web y la app nativa. Un evento tardío podía recrear perfiles eliminados.

Correcciones:

- Los cuatro triggers existentes de likes/comentarios consultan el total actual
  dentro de una transacción y mantienen ambos nombres de cada contador. Repetir
  una entrega o recibirla tarde no vuelve a aplicar el incremento del evento.
- El karma cambia en la misma transacción que el contador de likes, únicamente por
  la diferencia respecto a la contribución ya aplicada al post. Conserva otros
  puntos y las categorías no afectadas; la reputación sigue limitada a 100.
- Los perfiles privado y público se actualizan solo si existen. Un post borrado
  no se recrea. Se conserva la política anterior de mantener el karma histórico
  cuando se elimina toda la publicación.
- Los campos literales antiguos pasan al mapa real durante la reconciliación del
  autor, sin sumarlos otra vez si ya existe la categoría anidada. Se eliminan las
  claves literales mediante `FieldPath`, también para categorías que contienen puntos.
- Un error transitorio se propaga y los cuatro triggers habilitan reintentos.
  Las entregas sin cambios no reescriben contadores ni perfiles.
- La CI de navegador también inicia Functions en los PR. El recorrido de like con
  confirmación perdida comprueba los contadores por REST y la reputación/categoría
  en el perfil público de otra cuenta, además del estado de los botones.

Hay una auditoría acotada de solo lectura en
[`scripts/audit-post-engagement.mjs`](../scripts/audit-post-engagement.mjs). Requiere
proyecto y autor explícitos; consulta hasta 100 posts por defecto (máximo 1000),
incluye los totales reales de likes/comentarios, los alias almacenados, ambos
perfiles, los campos antiguos y las diferencias de karma conocidas. Indica si
el recorrido quedó incompleto. No es una instantánea transaccional ni aplica cambios.

Ejemplo, después de instalar y compilar Functions y configurar las credenciales
del proyecto que se quiera inspeccionar:

```powershell
node scripts/audit-post-engagement.mjs --project PROYECTO --uid AUTOR --max-posts 100 --output informe.json
```

El archivo de salida no se sobrescribe. Para usar emuladores hay que configurar
`FIRESTORE_EMULATOR_HOST`; el informe identifica ese destino. Las pruebas de esta
etapa solo consultan `vinctus-dev` local. No se ejecutó una auditoría de producción.

Los errores antiguos pueden haber sobrescrito puntos por categoría. El historial
de publicaciones eliminadas tampoco permite reconstruirlos exactamente. Por eso
el informe compara los datos conocidos y conserva los valores históricos en vez de
presentar un recálculo total como fiable; una reparación general necesita evidencia
y una decisión separadas.

Validación local de esta etapa:

- [x] Compilación de Functions, TypeScript, lint de los archivos modificados y
      contrato generado actualizado; 70 pruebas API/backend aprobadas.
- [x] Once pruebas con Functions reales en emuladores: las tres de publicaciones
      y ocho de interacciones/auditoría. Incluyen entregas fuera de orden y
      repetidas, concurrencia entre autores/categorías, moderación, migración de
      campos literales, conservación histórica y perfiles/publicaciones borrados.
- [x] Cuatro recorridos Chromium sin reintentos con Auth, Firestore, Storage y
      Functions locales. El de reacciones comprueba el contador y ambos perfiles,
      reputación y categoría visibles desde otra cuenta, confirmaciones perdidas,
      fechas estables y eliminación posterior del like/guardado.
- [x] La auditoría detecta discrepancias y recorridos parciales sin cambiar la
      fecha de actualización de ningún documento inspeccionado.
- [x] El árbol `ios-native` sigue idéntico a `75350cc`; se conserva la prueba
      ReleaseProd, unitaria y de 29 integraciones de la cuarta etapa. Esta
      ampliación no supone una nueva prueba nativa ni una prueba en iPhone físico.

Coste por evento de like: lectura inicial del post para conocer el autor, hasta dos
lecturas de perfil, lectura transaccional del post y un agregado de likes. Por evento
de comentario: lectura del post y un agregado de comentarios. El coste del agregado
crece con las entradas del índice. Solo se escriben los documentos que cambian;
la migración de campos antiguos añade una actualización por perfil afectado.
Los autores con muchas reacciones comparten el bloqueo de su perfil y pueden
necesitar reintentos ante contención.

Antes del despliegue deben comprobarse en staging los cuatro triggers juntos
(`onPostLikeCreated`, `onPostLikeDeleted`, `onPostCommentCreated`,
`onPostCommentDeleted`), los eventos pendientes del código anterior y los informes
históricos. Esta etapa no requiere reglas ni índices nuevos. El índice y los
triggers de `postsCount` de la tercera etapa conservan sus requisitos de despliegue.
Quedan la prueba física, staging y su periodo de observación. No se publicaron
Functions, una versión web de producción ni otro build de TestFlight.

## Sexta etapa: autorización de escrituras de publicaciones e interacciones

Las reglas anteriores aceptaban publicaciones en un `groupId` arbitrario,
incluidos grupos privados sin membresía. También aceptaban likes, índices
personales, guardados y comentarios de posts inexistentes, pendientes o fallidos.
Los bloqueos entre el autor y quien interactúa solo se comprobaban en la interfaz
de algunas pantallas. Los índices y likes permitían cambiar fechas o añadir campos.

Se añadieron reglas comunes que exigen:

- Para crear, editar o terminar de publicar en un grupo: grupo existente y
  propiedad o membresía en `groups/{groupId}/members/{uid}`. El índice personal
  `users/{uid}/memberships` no concede acceso. Un grupo público tampoco permite
  publicar sin unirse primero.
- Para nuevas interacciones y sus índices: post existente y publicado (`ready`
  o sin estado, incluidos los antiguos con estado nulo), sin bloqueo en ninguna
  dirección entre autor y usuario. En grupos privados se exige propiedad o
  membresía; en grupos públicos se permiten interacciones de visitantes.
- Likes e índices con estructura exacta, identidad vinculada a la ruta y fecha
  del servidor al crearse. Un reenvío idéntico conserva los datos; no permite
  cambiar fecha, post ni añadir campos. Los clientes actuales usan transacciones
  que no vuelven a escribir una reacción existente.

Se permite quitar likes, sus índices, guardados y comentarios propios aunque
el post se borre o cambien los permisos. Un autor expulsado puede marcar como
fallida una subida incompleta y borrar su post; no puede publicarlo, editarlo ni
usar esa excepción para degradar a `failed` una publicación ya confirmada.

Validación local: 75 pruebas de reglas aprobadas, incluidas 27 nuevas de
autorización. Antes del cambio, 16 de los 24 casos iniciales aceptaban escrituras
que debían denegar. Los casos cubren grupos públicos/privados, propietario sin
índice de miembro, índice personal falsificado, expulsión, grupo eliminado,
estados de publicación, bloqueos en ambas direcciones, identidad, fechas,
reenvíos y limpieza propia. El lote normal de like/índice/guardado se prueba
con las reglas activas para comprobar el presupuesto de accesos.

Se añaden pruebas de integración con los repositorios reales de iOS para
publicar antes/después de la membresía y rechazar like/guardado/comentario tras
un bloqueo. El caso de guardados huérfanos ahora guarda posts reales y después
los elimina: crear un índice que apunta a un post inexistente ya no es válido.

Alcance pendiente de privacidad: las lecturas de posts, likes, comentarios y
archivos siguen públicas en las reglas actuales. El feed global, las categorías
y los perfiles consultan todos los posts y los filtran después; es necesario
adaptar esas consultas y los consumidores web/iOS antes de imponer acceso privado
en el servidor. Las reglas de Firestore no filtran resultados de una consulta.
También hay que revisar los enlaces de descarga existentes y las transiciones
de visibilidad/membresía para no dejar acceso por otra ruta. Esta etapa no afirma
que un post de un grupo privado sea confidencial.

Las nuevas comprobaciones leen el post y los dos documentos de bloqueo; cuando
hay un grupo, también comprueban su documento y la membresía. No añaden listeners
ni campos o índices nuevos. Deben desplegarse tras validar juntos los clientes
web/iOS y los casos de grupo en staging. No se desplegaron reglas ni otra versión
de producción o TestFlight.

## Séptima etapa: privacidad de lecturas y adjuntos

`readPosts` aplica la misma política a feed, categorías, perfil, grupo, guardados,
post individual, comentarios y resumen semanal. Una publicación debe estar
publicada, tener un perfil de autor existente y cumplir **ambas** restricciones:
una cuenta privada requiere autor o seguidor aprobado; un grupo privado exige
propietario o documento real de miembro. Los perfiles eliminados no conservan
permisos privados. Los bloqueos se comprueban en ambas direcciones para la cuenta
autenticada. El contenido de cuentas y grupos públicos conserva lectura anónima;
un bloqueo no puede ocultar contenido público a alguien que cierre sesión.

Las reglas deniegan listas directas de posts, comentarios y likes. Las lecturas
individuales aplican la política; se conservan las lecturas propias necesarias
para reintentos y limpieza de publicaciones/comentarios/reacciones. Los índices
personales de guardados siguen siendo privados. Esta etapa protege el contenido
de publicaciones: no cambia el directorio de grupos, perfiles públicos ni fotos
de perfil. YouTube sigue siendo contenido alojado por un tercero.

Los listados web e iOS usan el callable, sin recurrir a la caché Firestore si el
servidor falla. El cambio de cuenta reinicia pantallas y descarta respuestas
tardías. Los cursores son identificadores aleatorios, guardados solo en el servidor
en `_post_read_cursors`, vinculados a usuario, vista, filtro y tamaño de página.
Caducan a los 30 minutos y tienen TTL configurado. No exponen IDs ni fechas de filas
ocultas. Pueden avanzar sobre páginas sin contenido visible; el cliente debe
conservar el cursor aunque la página esté vacía. Los guardados avanzan por su
índice original aunque se hayan eliminado los posts.

Los archivos nuevos se guardan como `post-media:posts/...` y las reglas rechazan
URLs de descarga persistidas, excepto los embeds canónicos de YouTube. La respuesta
del servidor reconstruye esos marcadores desde rutas del mismo autor/post; omite
medios sin una ruta válida. `readPostMedia` exige que la ruta esté listada en el
post y reautoriza cada HEAD y GET. Usa bearer en cabecera, ETag, generación fija,
rangos máximos de 8 MiB, comprobación de tamaño y `private,no-store`. No entrega
URLs firmadas ni tokens de Storage. Las lecturas directas de objetos de posts se
limitan al autor; los demás lectores pasan por el proxy. Los tokens de cuentas
suspendidas o revocados se rechazan. La web cancela descargas y revoca Blob URLs
al cambiar de cuenta/salir; iOS usa archivos temporales, los elimina al cerrar y
pausa el video al salir o pasar a segundo plano. Las notificaciones nuevas de
interacciones llevan `postSnippet` y `commentText` nulos.

Coste: una página devuelve hasta 50 elementos y recorre como máximo 150 filas
(guardados: tamaño solicitado más una fila de sondeo). Cada petición reutiliza
sus lecturas de perfiles, bloqueos, grupos y membresías, nunca entre peticiones.
Las comprobaciones se realizan en lotes de diez. Un cursor añade una escritura y
una lectura en la página siguiente; TTL añade su eliminación. El resumen semanal
inspecciona hasta 200 posts, por lo que es un conteo acotado, no un agregado exacto
para grupos con mayor actividad. Cada fragmento multimedia vuelve a leer permisos
y metadatos y consume transferencia de Functions/Storage. Descargar videos completos
antes de reproducirlos aumenta latencia y memoria temporal; el máximo es 100 MiB.

Validación local: 474 pruebas web, 70 API/backend, 77 reglas y ocho pruebas nuevas
con Auth/Firestore/Storage/Functions reales en emuladores. Cubren privacidad
combinada, revocación, bloqueos, cuentas suspendidas, cursores caducados/cruzados,
105 comentarios con fechas iguales y borrado del cursor, guardados huérfanos,
denegación de consultas directas, descargas de 9 MiB, ETag/rangos y revocación entre
fragmentos. Se incorporan pruebas del decodificador Swift, lectura nativa tras
expulsión y un recorrido Chromium de privacidad; consultar el PR para el resultado
final de CI y de esas plataformas.

### Despliegue coordinado pendiente

No desplegar solo las reglas ni solo uno de los clientes: los clientes antiguos
consultan directamente Firestore y usan URLs públicas. Preparar staging aislado,
compilar Functions, crear índices/TTL y actualizar juntos web/iOS, Functions y
reglas. Los triggers nuevos `onPostMediaFinalized` y `onPostMediaMetadataUpdated`
eliminan `firebaseStorageDownloadTokens` y marcan objetos nuevos con no-store.
Un trigger es asíncrono: no corrige por sí solo los objetos anteriores.

Auditar explícitamente el proyecto y bucket antes de declarar confidencialidad:

```sh
node scripts/migrate-post-read-privacy.mjs --project PROJECT --bucket BUCKET
```

El comando es de solo lectura por defecto, requiere credenciales del proyecto,
rechaza IAM o ACL públicos (incluidos ACL de objetos si el bucket no usa acceso uniforme) y muestra solo contadores. Recorre objetos (incluidas versiones anteriores) y
documentos en páginas de 200. El modo de aplicación requiere `--apply
--acknowledge-client-upgrade`; revoca tokens anteriores, cambia caché, convierte
URLs válidas en marcadores y borra fragmentos antiguos de notificaciones. Las
escrituras usan precondiciones para no pisar cambios concurrentes. No se ha
ejecutado contra producción. Un resultado `unsupportedMedia > 0` sale con código
2: resolver esos registros antes de publicar. Repetir la auditoría tras aplicar
y comprobar con otra cuenta que los enlaces viejos no sirven y que perder el
seguimiento/membresía impide nuevas lecturas y descargas. Verificar además las
políticas de acceso y versiones antiguas de objetos del bucket, si existen.

El emulador de Storage conserva tokens en un campo interno y regenera el último
al borrarlo. Solo en loopback y `vinctus-dev`, el trigger rota una vez y marca la
operación para evitar recursión. Las pruebas confirman la revocación del token
anterior; la ausencia total de tokens debe verificarse en staging/producción.
El código de producción aplica una eliminación de metadatos con precondición.

Las copias ya descargadas, capturas y cachés de contenido que antes era público
no pueden revocarse retroactivamente. La retirada se aplica a nuevas peticiones;
no se promete borrar de una pantalla contenido ya autorizado. Falta staging y su
periodo de observación, despliegue coordinado, nuevo TestFlight y prueba física.
