# Revisión de Vinctus: app nativa y web

Este archivo conserva el avance por módulos. A partir de conversaciones, revisar cada función en la app de iPhone (`ios-native/VinctusNative`) y en la web (`src`) antes de pasar a la siguiente. Una casilla marcada indica revisión y pruebas automatizadas para el alcance descrito; no implica publicación ni validación completa en un teléfono físico.

## Lista de módulos

- [x] Conversaciones de la app nativa: revisión, correcciones y pruebas automatizadas.
- [x] Conversaciones de la web: correcciones y validación local con Firebase y navegador.
- [ ] Publicaciones / Comunidad — revisión en curso en ambas versiones.
- [ ] Perfiles y seguidores — ambas versiones.
- [ ] Grupos — ambas versiones.
- [ ] Historias — ambas versiones.
- [ ] Descubrir y búsqueda — ambas versiones.
- [ ] Colecciones — ambas versiones.
- [ ] Inteligencia artificial: chat y Arena — ambas versiones.
- [ ] Cuenta y seguridad: acceso, recuperación, bloqueos, denuncias y eliminación de cuenta — ambas versiones.

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
