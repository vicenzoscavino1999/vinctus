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
- Comentarios nativos: paginación más allá de los primeros 80 comentarios y orden
  compatible con los comentarios recientes de la web.
- Likes/guardados, contadores de Cloud Functions y creación desde perfil/grupo.
  `onPostCreated` incrementa `postsCount` al crear el documento, incluido el
  estado `uploading`; las listas filtran ese estado. Revisar qué debe contar el
  perfil y las transiciones antes de cerrar este punto.
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
