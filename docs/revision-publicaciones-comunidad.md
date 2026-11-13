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
  detalle web. Los agregados de likes/karma y comentarios todavía aplican deltas
  con mínimo cero: revisar eventos de borrado que lleguen antes que los de creación.
  Descubrir conserva sus controles anteriores del contexto y queda por revisar
  con ese módulo (incluidos el límite de 50 IDs y las preferencias anónimas).
- Reglas y visibilidad: actualmente posts/comentarios tienen lectura pública;
  revisar el alcance esperado para grupos privados y bloqueos antes de cambiarlas.
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
- [ ] Resultado final de cobertura, CI completa y flujo de navegador que pierde la
      respuesta de un commit aceptado, reintenta, comprueba fechas y cambia de cuenta.
- [ ] Compilación, pruebas unitarias y 29 pruebas de integración nativas en CI.

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
