# Revisión de Vinctus: app nativa y web

Este archivo conserva el avance por módulos. A partir de conversaciones, revisar cada función en la app de iPhone (`ios-native/VinctusNative`) y en la web (`src`) antes de pasar a la siguiente. Una casilla marcada indica revisión y pruebas automatizadas para el alcance descrito; no implica publicación ni validación completa en un teléfono físico.

## Lista de módulos

- [x] Conversaciones de la app nativa: revisión, correcciones y pruebas automatizadas.
- [x] Conversaciones de la web: correcciones y validación local con Firebase y navegador.
- [ ] Publicaciones / Comunidad — siguiente módulo, en ambas versiones.
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
- [x] 401 pruebas unitarias de la web; umbrales de cobertura aprobados.
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

## Próximo módulo: Publicaciones / Comunidad

Revisar en ambas versiones:

1. Crear una publicación y comprobar el feed, el perfil y el grupo correspondiente.
2. Likes, comentarios y contadores.
3. Paginación, conexión lenta, errores y reintentos.
4. Permisos y visibilidad.
5. Comparar las capacidades de adjuntos. El publicador nativo actual publica texto; concretar las ampliaciones tras revisar el flujo existente.

La revisión de Publicaciones todavía no ha comenzado.
