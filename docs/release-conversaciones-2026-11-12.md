# Candidato de publicación de Conversaciones

Registro iniciado el 12 de noviembre de 2026 (America/Lima).
Última actualización: 13 de noviembre de 2026.

## Web

- Código de aplicación: `4dba726c96499e5711e437ba9641fbe4b9c0a40c`, PR #119.
- Equipo Vercel: `vicenzo-teams-projects`.
- Proyecto: `vinctus` (`prj_VXWFXunu4QBPeUcUgzTkpmrzzcRS`).
- Candidato: [vinctus-op68wfb1y](https://vinctus-op68wfb1y-vicenzo-teams-projects.vercel.app).
- Deployment: `dpl_2pKz3uswkTJ1TPjKA5qiMV3NUiMN`, estado `READY`.
- Compilado con variables de producción y `--skip-domain`.
- TypeScript y compilación Vite/PWA aprobados en Vercel.
- `/discover`, `/feed`, `/messages`, `/profile`, `/privacy` y `/support`: HTTP 200,
  comprobados mediante `vercel curl` con acceso autenticado.
- Consulta de errores del candidato desde su creación: sin entradas devueltas.
- Dominio público conservado en el deployment anterior
  `dpl_aLp6qnyQ9abLQFpVH2QRwuqYnPWx`, commit `996a7d9`.

Los HTTP 200 comprueban disponibilidad de las rutas y no sustituyen pruebas de
conversaciones autenticadas. La CI general del código de aplicación pasó en
[43342023027](https://github.com/vicenzoscavino1999/vinctus/actions/runs/43342023027).

### Bloqueo de promoción pública

`DEPLOYMENT.md` exige un mínimo de 24 horas de observación en staging antes de
aprobar producción. `STAGING_MONITORING.md` exige un Firebase aislado. No se
encontró un registro de observación completo ni un proyecto Firebase de staging
de Vinctus entre los proyectos accesibles. Preview y Production comparten la
configuración Firebase productiva; el candidato preparado tampoco es un entorno
aislado. El período de observación no se ha iniciado.

Siguiente paso: configurar ese staging, desplegar el candidato allí, completar el
registro de observación y aprobar las comprobaciones indicadas en el runbook.
Después, verificar que este candidato sigue siendo el commit que se quiere
publicar y promover el deployment probado. No fusionar el PR antes de resolver
este requisito: la integración de `main` publica automáticamente.

## iOS

- App Firebase verificada: `VinctusNative`, Bundle ID `app.vinctus.social`,
  proyecto `vinctus-daf32`.
- Configuración Prod y cliente Google preparados localmente y excluidos de Git.
- Las comprobaciones nativas del código de aplicación estaban canceladas. Se
  relanzó [43342022231](https://github.com/vicenzoscavino1999/vinctus/actions/runs/43342022231)
  y pasaron ReleaseProd, las pruebas unitarias y la integración con Firebase.
- Preparada la subida manual a TestFlight en el workflow **iOS native**, después
  de las pruebas del mismo commit y del entorno protegido `ios-release`.
- Entorno `ios-release` creado en GitHub con revisión del propietario y ramas
  restringidas a `main` y `fix/ios-conversations`. Configuración Firebase cargada
  como secreto del entorno. Los cuatro valores de Apple también se configuraron;
  la autenticación reconoce la app Vinctus en App Store Connect.
- Sintaxis Bash, actionlint y rechazo de secretos ausentes comprobados localmente.
- Apple confirmó por API que el contrato actualizado ya permite acceder a
  certificados e identificadores. La ficha de Vinctus no tenía builds previos.
- Iniciada la subida del build 2 en
  [43363559194](https://github.com/vicenzoscavino1999/vinctus/actions/runs/43363559194),
  commit `7f62ad2`. En el primer intento pasaron compilación y pruebas unitarias;
  la integración tuvo 22 pruebas aprobadas y un fallo de disponibilidad inicial
  del emulador Firestore. Se relanzó solo la parte fallida y la integración pasó
  en el intento 2. La ejecución continuó al entorno protegido `ios-release` con
  aprobación para el build 2 del commit revisado. El archivo falló porque Xcode
  buscó un perfil de desarrollo y la cuenta no tenía dispositivos registrados.
- Preparados certificado Apple Distribution y perfil `Vinctus AppStore CI`,
  exclusivamente para la distribución de `app.vinctus.social`. Se verificaron la
  coincidencia de clave/certificado, equipo, Bundle ID, permisos de Sign in with
  Apple y Declared Age Range, y ausencia de dispositivos en el perfil App Store.
- Certificado, contraseña y perfil guardados como secretos de `ios-release`.
  El workflow usa firma manual de distribución para no depender de un iPhone
  registrado en Apple Developer. Pendiente verificar el archivo y la subida.
- Todavía no se ha confirmado una nueva versión en TestFlight ni App Store.

Configuración y ejecución: [TestFlight sin Mac](testflight-sin-mac.md).
La prueba de audio, videos reales, interrupciones y permisos en iPhone permanece
pendiente en `revision-app-nativa.md`.
