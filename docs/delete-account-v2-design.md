# Delete Account v2 - Gap Analysis y Diseno

Fecha: 2026-02-11

## Objetivo

Cumplir requerimiento de App Store para borrado de cuenta desde la app, incluyendo:

- borrado o anonimizado de datos personales del usuario
- ejecucion consistente e idempotente
- trazabilidad operativa para soporte y auditoria

## Estado actual (v1 implementado)

Existe callable `deleteUserAccount` en `functions/src/deleteAccount.ts` y cliente en:

- `src/features/settings/api/deleteAccount.ts`
- `src/features/settings/components/DeleteAccountModal.tsx`

La funcion actual ya elimina gran parte del grafo de datos y finalmente elimina Auth user.

## Inventario de datos cubiertos hoy

Colecciones/subcolecciones y recursos que hoy se limpian:

1. Relaciones sociales
   - `users/*/followers`, `users/*/following`, `users/*/friends`
   - `users/*/blockedUsers` (bloqueos hacia/desde el usuario)
2. Solicitudes/notificaciones/reportes
   - `notifications`
   - `follow_requests`, `friend_requests`, `group_requests`, `collaboration_requests`
   - `reports`
   - `support_tickets`
3. Contenido social
   - `posts` (autor)
   - `posts/*/comments` (autor)
   - `stories`
   - `events` (creados por usuario)
   - `groups` (propios, con cleanup recursivo)
   - `collaborations`
   - `arenaDebates`
4. Chat/mensajeria
   - conversaciones directas detectadas por indice y por `memberIds`
   - `collectionGroup(messages)` por `senderId`
   - adjuntos y thumbnails de mensajes
5. Archivos / Storage
   - prefijos: `profiles/`, `posts/`, `stories/`, `collections/`, `contributions/`, `groups/`
   - archivos de contribuciones por `filePath`
6. Perfil y Auth
   - `users/{uid}` (recursive delete)
   - `users_public/{uid}`
   - `arenaUsage/{uid}`
   - `admin.auth().deleteUser(uid)`

## Gaps detectados para v2

1. Escalabilidad/timeouts en cuentas grandes
   - Riesgo: un callable de 540s puede agotar tiempo en cuentas con mucho volumen.
   - v2: mover a job asincrono (`deletionJobs/{uid}`) + worker por etapas.
2. Idempotencia total entre etapas
   - Hoy hay idempotencia parcial por consultas repetidas, pero no hay estado por fase.
   - v2: checkpoint por fase (`status`, `step`, `attempt`, `lastError`).
3. Evidencia de borrado para soporte
   - Hoy solo logs y stats en respuesta.
   - v2: `deletionAudits/{uid_hash}` con resumen no sensible y timestamps.
4. Politica de anonimizado para contenido historico
   - Decidir por dominio si se elimina completo o se anonimiza (ej. mensajes historicos).
   - v2: matriz por entidad con criterio legal/producto.
5. UX de estado en app
   - Hoy modal simple sin progreso ni estado de post-procesamiento.
   - v2: pantalla de estado (solicitud, procesando, completado, error recuperable).
6. Validacion de consistencia post-delete
   - Falta verificacion automatica de residuos.
   - v2: checker final por `uid` + alerta si quedan documentos.

## Estrategia v2 propuesta

1. `requestAccountDeletion` (callable)
   - Crea `deletionJobs/{uid}` con estado `queued`.
   - Revoca sesiones y bloquea nuevas escrituras sensibles.
2. Worker de borrado por fases (functions/event-driven)
   - `phase_1_relations`
   - `phase_2_social_content`
   - `phase_3_chat_and_files`
   - `phase_4_profile_and_auth`
3. Finalizacion
   - Marca `completedAt`, `deletedCounts`, `durationMs`.
   - Deja rastro de auditoria no sensible.
4. Reintentos seguros
   - Cada fase debe ser re-ejecutable sin efectos duplicados.

## Matriz inicial: eliminar vs anonimizar

1. Eliminar completo
   - perfil, stories, contribuciones, archivos privados, relaciones y requests
2. Eliminar o anonimizar segun politica final
   - posts/comentarios propios (recomendado eliminar en v2 inicial)
   - mensajes historicos (opcion A eliminar; opcion B anonimizar autor)
3. Mantener solo agregado no personal
   - metricas globales anonimas (si aplica)

## Pruebas requeridas (Dia 6)

1. Integracion con emuladores por caso
   - usuario con posts, comentarios, grupos, chats, archivos
2. Idempotencia
   - ejecutar borrado 2-3 veces y verificar estado final estable
3. Residuales
   - query por `uid` en colecciones criticas debe retornar 0 docs
4. Fallos parciales
   - inyectar error en fase intermedia y verificar reintento

## Harness implementado (Dia 6)

Se agrego un harness de integracion para emuladores:

- Script: `scripts/delete-account-v2-harness.mjs`
- Comando: `npm run test:delete-account:harness`

El harness valida:

1. alta de usuario real en Auth emulator
2. siembra de grafo de datos (users, posts, comments, stories, chat, contributions, storage)
3. ejecucion de `requestAccountDeletion`
4. espera de estado `completed` en `getAccountDeletionStatus`
5. verificacion de borrado efectivo en Firestore/Auth
6. idempotencia (segunda solicitud mantiene estado `completed`)

## Criterios de aceptacion App Store (delete account)

1. Flujo visible en app: Settings -> Delete Account (ya existe)
2. Accion efectiva sin salir de la app
3. Datos personales eliminados o anonimizados segun politica declarada
4. Mensaje de confirmacion final claro para el usuario
