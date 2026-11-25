# Plan de despliegue coordinado y pruebas en iPhone real (Módulos 1–10)

Guía operativa única para integrar, desplegar con orden seguro y validar físicamente en iPhone los cambios acumulados en los **10 módulos** revisados ([índice de revisión](revision-app-nativa.md)).

> [!IMPORTANT]
> No fusionar los PRs a `main` antes de aprobar `staging`: la integración con `main` dispara despliegue automático en Vercel. Mantener la secuencia de despliegue indicada abajo para evitar cortar lecturas/escrituras a clientes activos.

## 1. Estado de la pila de PRs apilados (`#119 → #128`)

| Orden | PR                                                             | Rama (`head` -> `base`)                            | Módulo                     | Detalle                                                                    |
| ----- | -------------------------------------------------------------- | -------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| 1     | [#119](https://github.com/vicenzoscavino1999/vinctus/pull/119) | `fix/ios-conversations` -> `main`                  | Conversaciones (iOS y web) | [revision-app-nativa.md](revision-app-nativa.md)                           |
| 2     | [#120](https://github.com/vicenzoscavino1999/vinctus/pull/120) | `fix/posts-community` -> `fix/ios-conversations`   | Publicaciones / Comunidad  | [revision-publicaciones-comunidad.md](revision-publicaciones-comunidad.md) |
| 3     | [#121](https://github.com/vicenzoscavino1999/vinctus/pull/121) | `fix/profiles-followers` -> `fix/posts-community`  | Perfiles y seguidores      | [revision-perfiles-seguidores.md](revision-perfiles-seguidores.md)         |
| 4     | [#122](https://github.com/vicenzoscavino1999/vinctus/pull/122) | `fix/groups` -> `fix/profiles-followers`           | Grupos                     | [revision-grupos.md](revision-grupos.md)                                   |
| 5     | [#123](https://github.com/vicenzoscavino1999/vinctus/pull/123) | `fix/stories` -> `fix/groups`                      | Historias                  | [revision-historias.md](revision-historias.md)                             |
| 6     | [#124](https://github.com/vicenzoscavino1999/vinctus/pull/124) | `fix/discover-search` -> `fix/stories`             | Descubrir y búsqueda       | [revision-descubrir-busqueda.md](revision-descubrir-busqueda.md)           |
| 7     | [#125](https://github.com/vicenzoscavino1999/vinctus/pull/125) | `fix/collections` -> `fix/discover-search`         | Colecciones                | [revision-colecciones.md](revision-colecciones.md)                         |
| 8     | [#126](https://github.com/vicenzoscavino1999/vinctus/pull/126) | `fix/ai-arena` -> `fix/collections`                | IA: Chat y Arena           | [revision-ia-arena.md](revision-ia-arena.md)                               |
| 9     | [#127](https://github.com/vicenzoscavino1999/vinctus/pull/127) | `fix/account-security` -> `fix/ai-arena`           | Cuenta y seguridad         | [revision-cuenta-seguridad.md](revision-cuenta-seguridad.md)               |
| 10    | [#128](https://github.com/vicenzoscavino1999/vinctus/pull/128) | `fix/pre-prod-hardening` -> `fix/account-security` | Hardening pre-producción   | [revision-pre-produccion.md](revision-pre-produccion.md)                   |

### Cómo integrar sin conflictos cuando se apruebe el lanzamiento

`fix/pre-prod-hardening` (`#128`) contiene el código acumulado de toda la pila `#119 → #128` (los 10 PRs están verificados como `MERGEABLE` / `CLEAN` y `0` checks fallidos). Al momento de pasar a `main` tras aprobar `staging`:

- **Opción recomendada (merge ordenado de abajo hacia arriba)**: quitar estado `draft` y hacer **Merge commit** (**no** squash, para no reescribir SHAs base) en orden estricto `#119 → #120 → #121 → #122 → #123 → #124 → #125 → #126 → #127 → #128` — GitHub re-apunta automáticamente la base del siguiente PR al fusionar el anterior.
- **Opción alternativa (rama única a `main`)**: cambiar la base de `#128` a `main`, validar CI completa contra `main`, fusionar `#128` con merge commit y cerrar `#119..#127` como absorbidos.
- **PRs antiguos fuera de esta pila**: no incluir `#118` (`refactor/split-discover-page`), `#110` (conflictivo) ni `#71` (conflictivo) en esta ventana de lanzamiento.

## 2. Prerrequisitos antes de tocar `staging` o producción

1. **Proyecto Firebase aislado de `staging` (`vinctus-staging`)**: requerido por [DEPLOYMENT.md](../DEPLOYMENT.md) y [STAGING_MONITORING.md](../STAGING_MONITORING.md) antes de promover a producción (`vinctus-daf32`).
2. **Secretos y variables de entorno**:
   - **Cloud Functions**: `createDebate` declara `secrets: ['GEMINI_API_KEY']` en Secret Manager; antes de desplegar Functions en producción (`vinctus-daf32`), ejecutar `firebase functions:secrets:set GEMINI_API_KEY --project vinctus-daf32` (y confirmar también en `vinctus-staging`; añadir `NVIDIA_API_KEY` si se usa como respaldo), verificar `storageBucket` y región `us-central1`.
   - **App Check (modo monitoreo)**: mantener Enforcement **desactivado** durante el lanzamiento inicial. Registrar la clave `.p8` de Apple DeviceCheck (y una clave de reCAPTCHA Enterprise de tipo puntuación en web; App Check ya no admite registros nuevos con reCAPTCHA v3) en Firebase Console > App Check para recoger métricas verificadas de iOS + web durante 24–48 h antes de considerar Enforcement (ver [ios-app-check-rollout-plan.md](ios-app-check-rollout-plan.md)). Ejecutar `npm.cmd run preflight:appcheck` (y `--production` al preparar `vinctus-daf32`).
   - **Vercel (web + APIs)**: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `NVIDIA_API_KEY`, `YOUTUBE_API_KEY` (si aplica), `FIREBASE_SERVICE_ACCOUNT`, `VITE_FIREBASE_*` (incluyendo `VITE_FIREBASE_AUTH_DOMAIN` del host propio si se usa proxy `/__/auth/*`), `VITE_ENABLE_APPLE_SIGN_IN` y `VITE_ENABLE_FIREBASE_APP_CHECK` + `VITE_FIREBASE_APP_CHECK_SITE_KEY` (sin `VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN` en producción).
   - **GitHub Environment `ios-release`**: verificado con ramas autorizadas `main`, `testflight/vinctus-staging` y `fix/ios-conversations` (ver [testflight-sin-mac.md](testflight-sin-mac.md)).
3. **Respaldo de reglas activas**: exportar copia de `firestore.rules` y `storage.rules` actualmente desplegadas en Firebase Console antes de aplicar cambios.

## 3. Orden exacto de despliegue (Fase A: `staging` → Fase B: merge a `main` y producción)

> [!CAUTION]
> **No cambiar el orden de los pasos**: desplegar primero índices + Functions + clientes nuevos, y **solo después** reglas estrictas + migración de lectura de posts, para evitar `PERMISSION_DENIED` a usuarios con clientes viejos.

### Fase A — Preparación de rama `testflight/vinctus-staging` y despliegue en `vinctus-staging`

Antes de desplegar a `vinctus-staging`, sincronizar la rama `testflight/vinctus-staging` con el `HEAD` de `fix/pre-prod-hardening` manteniendo únicamente los 2 rewrites de `vercel.json` apuntando a `https://vinctus-staging.firebaseapp.com/__/auth/$1` y `https://vinctus-staging.firebaseapp.com/__/firebase/$1` (los demás cambios de `testflight/vinctus-staging` ya fueron rescatados en `#128`).

Ejecutar los pasos **1 a 7** abajo usando:

- `<PROJECT_ID>` = `vinctus-staging`
- `<BUCKET_NAME>` = bucket de `vinctus-staging` (ej. `vinctus-staging.firebasestorage.app`)
- TestFlight staging: `--ref testflight/vinctus-staging -f upload_to_testflight=true -f release_target=staging -f build_number=<NUEVO_BUILD>`

### Fase B — Merge de la pila `#119 → #128` a `main` y despliegue en producción (`vinctus-daf32`)

Solo tras completar **24–48 h de observación en `staging`** y aprobar el checklist de la sección 4:

1. Verificar `firebase functions:secrets:set GEMINI_API_KEY --project vinctus-daf32` y respaldo de reglas activas en `vinctus-daf32`.
2. Ejecutar **Pasos 1, 2 y 3** en `vinctus-daf32` **antes** de fusionar a `main` (para que índices y Functions ya estén activos cuando Vercel publique `main` automáticamente).
3. Fusionar la pila `#119 → #128` a `main` (esto despliega automáticamente la web de producción en Vercel con `vercel.json` apuntando a `vinctus-daf32.firebaseapp.com`).
4. Lanzar build de TestFlight de producción desde `main` (`-f release_target=production -f build_number=<SIGUIENTE_BUILD>`, mayor al usado en staging) y confirmar disponibilidad para los usuarios/testers.
5. Ejecutar **Pasos 5 y 6** (`firestore:rules,storage` y migración `--apply --acknowledge-client-upgrade`) una vez confirmados clientes actualizados.

---

### Paso 1 — Índices y políticas TTL de Firestore

```powershell
firebase deploy --project <PROJECT_ID> --only firestore:indexes
```

- Esperar en **Firebase Console > Firestore > Indexes** hasta que **todos** los índices estén en estado **Enabled/Ready** antes de pasar al paso 2.
- Verificar en particular:
  - El índice compuesto `COLLECTION_GROUP` de `messages` (`senderId ASC`, `createdAt DESC`).
  - Los **13 `fieldOverrides` de `COLLECTION_GROUP`** añadidos en `firestore.indexes.json` para `deleteAccount.ts` (`followers.uid`, `following.uid`, `friends.uid`, `blockedUsers.blockedUid`, `members.uid`, `attendees.uid`, `likes.uid`, `likes.postId`, `savedPosts.postId`, `comments.authorId`, `messages.senderId`, `savedArenaDebates.debateId`, `likedArenaDebates.debateId`).
  - Los 3 campos TTL (`_dedup_events.processedAt`, `stories.expiresAt`, `_post_read_cursors.expiresAt`).

### Paso 2 — Cloud Functions

```powershell
npm.cmd run functions:build
firebase deploy --project <PROJECT_ID> --only functions
```

- Confirmar despliegue sin errores de las funciones nuevas y actualizadas (`readPosts`, `readPostMedia`, `cleanupAbandonedPosts`, `onUserBlockedCreated`, `onGroupDeleted`, `onStoryDeleted`, `onCollectionItemDeleted`, `onCollectionItemWritten`, `onCollectionDeleted`, `onArenaDebateLikeCreated`, `onArenaDebateLikeDeleted`, `createDebate`, `getArenaUsage`, `getArenaPersonas`, `onReportCreatedQueue`, `onMessageCreatedModeration`, `moderationTakeAction`, `revokeUserSessions`, `requestAccountDeletion`, `getAccountDeletionStatus`, `onDeletionJobCreated`, `onDeletionJobUpdated`, `deleteUserAccount`).
- Verificar en Cloud Logging que `onDeletionJobCreated` y `onDeletionJobUpdated` quedaron con `timeoutSeconds: 540` y `1GB`.

### Paso 3 — Auditoría previa y dry-run de migración (sin escribir aún)

```powershell
node scripts/migrate-post-read-privacy.mjs --project <PROJECT_ID> --bucket <BUCKET_NAME>
```

- Revisar el conteo de publicaciones, objetos Storage y notificaciones afectadas antes de aplicar nada.

### Paso 4 — Despliegue de clientes (Web/Vercel + build de TestFlight)

1. **Web y endpoints `/api/*` en Vercel**: desplegar candidato y comprobar HTTP 200 + cabeceras (`Content-Security-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, `Cache-Control: private, no-store, max-age=0` en `/api/chat`) en `/`, `/feed`, `/discover`, `/messages`, `/notifications`, `/projects`, `/profile`, `/settings`, `/privacy`, `/support`, además de comprobar que `/__/auth/handler` no recibe la CSP de la SPA.
2. **App nativa iOS a TestFlight**: lanzar build nuevo con número estrictamente mayor al anterior (siguiendo [testflight-sin-mac.md](testflight-sin-mac.md)):

```powershell
# En staging (Vinctus QA -> vinctus-staging)
gh workflow run ios-native.yml --repo vicenzoscavino1999/vinctus --ref testflight/vinctus-staging -f upload_to_testflight=true -f release_target=staging -f build_number=<N>

# En producción (Vinctus -> vinctus-daf32, solo tras merge a main)
gh workflow run ios-native.yml --repo vicenzoscavino1999/vinctus --ref main -f upload_to_testflight=true -f release_target=production -f build_number=<N+1>
```

- Aprobar la puerta del entorno `ios-release` y confirmar estado `READY_FOR_BETA_TESTING` en **Vinctus QA** (el script valida automáticamente post-archive `VINCTUS_ENV`, `VINCTUS_API_BASE_URL`, `VINCTUS_ENABLE_APP_CHECK`, plist exclusivo y `PROJECT_ID`).

### Paso 5 — Reglas de Firestore y Storage

> [!WARNING]
> Solo activar las reglas estrictas de lectura de publicaciones y Storage **cuando tanto la web como los probadores de iOS ya estén usando la versión nueva con `readPosts`/`readPostMedia`**.

```powershell
firebase deploy --project <PROJECT_ID> --only firestore:rules,storage
```

### Paso 6 — Migración de privacidad de lecturas (solo tras confirmar clientes actualizados)

```powershell
node scripts/migrate-post-read-privacy.mjs --project <PROJECT_ID> --bucket <BUCKET_NAME> --apply --acknowledge-client-upgrade
```

- Revoca tokens públicos heredados en `posts/` de Storage, limpia URLs heredadas y sanea fragmentos de notificaciones.

### Paso 7 — Ventana de observación en `staging` (24–48 h)

- Monitorear errores en Vercel Logs, Cloud Functions Logs y cuota de Firestore/Storage según [STAGING_MONITORING.md](../STAGING_MONITORING.md).
- Ejecutar el checklist físico de la sección 4.
- Si surge una regresión crítica, aplicar [ROLLBACK.md](../ROLLBACK.md) y [ios-rollback-playbook.md](ios-rollback-playbook.md) (restaurando primero la copia de respaldo de `firestore.rules` / `storage.rules` y promoviendo el deployment previo de Vercel).

## 4. Checklist consolidado de pruebas en iPhone real (y web real)

Centrado en los comportamientos que los emuladores y el simulador no pueden validar:

### A. Acceso, recuperación y seguridad (Módulo 10)

- [ ] Registro con email real: llegada del correo de verificación y entrada limpia al perfil.
- [ ] Recuperación de contraseña con correo existente e inexistente: mensaje sin enumeración, llegada del correo real y apertura del enlace `oobCode` en web (`PasswordResetActionScreen`).
- [ ] Inicio de sesión con Google y con **Sign in with Apple** en iPhone físico.
- [ ] Verificación de edad `DeclaredAgeRange` en iOS 26.2+ (si el dispositivo corre esa versión).
- [ ] Toggle `Cuenta privada` desde iOS y desde web, comprobando sincronización cruzada en ambos clientes.
- [ ] Bloquear un usuario de prueba desde perfil/chat, confirmar que desaparece de búsquedas/historias/DMs y desbloquearlo desde `Ajustes > Privacidad y seguridad > Usuarios bloqueados`.
- [ ] `Cerrar sesión en otros dispositivos` (`revokeUserSessions`): verificar en un segundo dispositivo/navegador que la sesión se cierra limpiamente.
- [ ] **Eliminación de cuenta de prueba** (idealmente con una cuenta que tenga post, historia, colección, mensaje y debate, y otra con Sign in with Apple): confirmar `ELIMINAR`, verificar revocación del token de Apple, estado `completed`, borrado real en Auth/Firestore/Storage y cero errores `FAILED_PRECONDITION` en Cloud Logging.
- [ ] Acceso por SMS con reCAPTCHA real en web (si está habilitado en Firebase Auth).

### B. Conversaciones y multimedia (Módulos 1 y 2)

- [ ] Grabación y reproducción audible de notas de voz entre iPhone y web (Safari/Chrome).
- [ ] Envío y reproducción de videos reales de la fototeca iOS (**MOV/HEVC**) en ambos clientes.
- [ ] Comportamiento ante llamadas entrantes, cambio de salida de audio (altavoz/audífonos) y paso a segundo plano.
- [ ] Permisos de micrófono, cámara y selección de archivos en iOS y Safari móvil.

### C. Publicaciones, perfiles, grupos, historias, descubrir y colecciones (Módulos 3–8)

- [ ] Publicación con foto/video/documento y recuperación de borrador tras pérdida real de red (modo avión) en iPhone y web.
- [ ] Verificación de carga de adjuntos protegidos (`readPosts` / `readPostMedia`) en cuentas privadas y grupos privados.
- [ ] Subida, reproducción y eliminación de historias (foto y video) en iPhone físico y reproducción de Shorts en `WKWebView`.
- [ ] Creación/edición de grupo con cambio y eliminación de ícono, ingreso a grupo privado y apertura del chat grupal.
- [ ] Búsqueda con tildes, apertura de categorías en `Descubrir` con `/api/discover` real y subida/apertura/borrado de archivos en `Colecciones` (`.fileImporter` en iPhone y navegador en web).

### D. Inteligencia artificial: Chat y Arena (Módulo 9)

- [ ] Conceder y retirar consentimiento IA en Ajustes y puerta de acceso con dos cuentas distintas en el mismo dispositivo/navegador (verificando aislamiento total).
- [ ] Conversación multi-turno larga en Chat IA con claves reales (Gemini/OpenAI/NVIDIA), generación de imagen y acción `createGroup` abriendo `Ver grupo`.
- [ ] Creación, guardado, like y lectura de turnos de un debate en Arena IA (público y privado) con claves reales.

### E. Hardening pre-producción: Notificaciones, App Check monitoreo y Web/PWA (PR #128)

- [ ] **Notificaciones web (`/notifications` + badge en cabecera)**: probar recepción de like/comentario/follow y solicitudes (colaboración, seguimiento, grupo), marcar una como leída, **Marcar todo como leído**, eliminar notificación, quitar y volver a dar "Me gusta" (`re-like`) sobre un post ya leído, y verificar actualización inmediata del contador del icono de campana y aislamiento al cambiar de cuenta.
- [ ] **Proyectos, colaboraciones y eventos (`/projects`)**: recargar tras enviar una solicitud de colaboración y confirmar persistencia de `"Solicitud enviada"`, probar aforo completo y confirmación inline al eliminar evento.
- [ ] **Seguridad Web/PWA y OAuth**: abrir DevTools en producción/staging y confirmar **0 errores de CSP** al iniciar sesión con Google/Apple (incluido modo PWA standalone con `/__/auth/*`), grabar nota de voz (`Permissions-Policy: microphone=(self)`), subir foto HEIC (`heic2any` con SRI), abrir `/privacy`, `/terms`, `/community-guidelines`, `/support` y verificar `Cache-Control: private, no-store, max-age=0` en `/api/chat`.
- [ ] **App Check en modo monitoreo (sin Enforcement)**: confirmar en **Firebase Console > App Check** la llegada de solicitudes verificadas tanto de **web (reCAPTCHA Enterprise)** como de **iOS real (DeviceCheck)** durante 24–48 h antes de planificar cualquier activación de Enforcement.

## 5. Cierre de casillas

Una vez completado el despliegue coordinado a producción y verificado el checklist de iPhone real en la sección 4, marcar como `[x]` los módulos 3 a 10 y el hardening pre-producción en [revision-app-nativa.md](revision-app-nativa.md).
