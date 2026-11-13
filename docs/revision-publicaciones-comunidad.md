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
      aprobada sobre `dec69db`. Los commits siguientes de esta etapa no cambian
      el árbol `ios-native` que se verificó.
- [x] CI completa (incluye reglas, dos flujos smoke en navegador y Lighthouse):
      ejecución [43443770217](https://github.com/vicenzoscavino1999/vinctus/actions/runs/43443770217)
      aprobada sobre `87c48b3`. El ajuste posterior de sincronización de contadores
      conserva las ocho pruebas del panel/hook aprobadas y se vuelve a comprobar en CI.

Los tests de Swift se ejecutan en una Mac de GitHub; no equivalen a probar en
un iPhone físico. La prueba local usa exclusivamente el proyecto emulado
`vinctus-dev` y no escribe datos de producción.

## Pendiente para cerrar el módulo

- Creación web: reintentos de publicación completa y recuperación de cargas de
  adjuntos, incluidos errores después de confirmar el estado `ready`.
- Comparación de las capacidades de fotos, videos, documentos y enlaces de ambas
  versiones: el publicador nativo todavía crea texto y su detalle no muestra todos
  los adjuntos que publica la web.
- Comentarios nativos: paginación más allá de los primeros 80 comentarios y orden
  compatible con los comentarios recientes de la web.
- Likes/guardados, contadores de Cloud Functions y creación desde perfil/grupo.
- Reglas y visibilidad: actualmente posts/comentarios tienen lectura pública;
  revisar el alcance esperado para grupos privados y bloqueos antes de cambiarlas.
- Pruebas en dispositivo, despliegue y versión posterior de TestFlight.

El PR puede generar una vista previa de Vercel automáticamente. Esta etapa no
se ha promovido al dominio de producción ni subido a TestFlight, y el módulo
sigue abierto.
