# Firestore Indexes

Referencia de índices compuestos de `firestore.indexes.json` usados por la app.

## Posts

| Collection Group | Campos                             | Uso principal                                                             |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `posts`          | `groupId ASC`, `createdAt DESC`    | Feed de grupo (más reciente primero).                                     |
| `posts`          | `groupId ASC`, `createdAt ASC`     | Feed de grupo en orden ascendente / compatibilidad de queries históricas. |
| `posts`          | `authorId ASC`, `createdAt DESC`   | Perfil: posts por autor paginados.                                        |
| `posts`          | `categoryId ASC`, `createdAt DESC` | Descubrir por categoría.                                                  |

## Stories

| Collection Group | Campos                                            | Uso principal                          |
| ---------------- | ------------------------------------------------- | -------------------------------------- |
| `stories`        | `ownerId ASC`, `visibility ASC`, `expiresAt DESC` | Historias activas por dueños visibles. |

## Notifications / Requests

| Collection Group         | Campos                                        | Uso principal                                       |
| ------------------------ | --------------------------------------------- | --------------------------------------------------- |
| `notifications`          | `toUid ASC`, `createdAt DESC`                 | Bandeja de actividad por usuario.                   |
| `friend_requests`        | `toUid ASC`, `status ASC`, `createdAt DESC`   | Solicitudes recibidas por estado.                   |
| `friend_requests`        | `fromUid ASC`, `status ASC`, `createdAt DESC` | Solicitudes enviadas por estado.                    |
| `follow_requests`        | `toUid ASC`, `status ASC`, `createdAt DESC`   | Solicitudes de seguimiento recibidas.               |
| `follow_requests`        | `fromUid ASC`, `status ASC`, `createdAt DESC` | Solicitudes de seguimiento enviadas.                |
| `group_requests`         | `toUid ASC`, `status ASC`, `createdAt DESC`   | Solicitudes de grupo recibidas.                     |
| `group_requests`         | `groupId ASC`, `fromUid ASC`, `status ASC`    | Validación/consulta de solicitud por grupo+usuario. |
| `collaboration_requests` | `toUid ASC`, `status ASC`, `createdAt DESC`   | Solicitudes de colaboración recibidas.              |
| `collaboration_requests` | `fromUid ASC`, `collaborationId ASC`          | Solicitudes de colaboración enviadas por recurso.   |

## Otros módulos

| Collection Group                | Campos                             | Uso principal                                                                         |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| `groups`                        | `categoryId ASC`                   | Descubrir grupos por categoría (`where('categoryId', '==', ...)`).                    |
| `users_public`                  | `displayNameLowercase ASC`         | Búsqueda de usuarios por prefijo (`startAt/endAt`).                                   |
| `users_public`                  | `updatedAt DESC`                   | Listado de usuarios recientes/sugeridos.                                              |
| `events`                        | `visibility ASC`, `startAt ASC`    | Agenda de eventos futura.                                                             |
| `events`                        | `visibility ASC`, `startAt DESC`   | Agenda en orden inverso / historial.                                                  |
| `contributions`                 | `categoryId ASC`, `createdAt DESC` | Filtrado de contribuciones por categoría.                                             |
| `items`                         | `ownerId ASC`, `createdAt DESC`    | Colecciones/items de usuario.                                                         |
| `messages` (`COLLECTION_GROUP`) | `senderId ASC`, `createdAt DESC`   | Actualización de metadatos de emisor al editar perfil (`onUserPublicProfileUpdated`). |

## Field Overrides (`COLLECTION_GROUP` y TTL)

Los siguientes índices de campo único en `fieldOverrides` son obligatorios en producción para la eliminación de cuenta (`functions/src/deleteAccount.ts`) y expiración TTL:

| Collection Group     | Campo         | Scope / TTL              | Uso principal                                                   |
| -------------------- | ------------- | ------------------------ | --------------------------------------------------------------- |
| `_dedup_events`      | `processedAt` | TTL                      | Limpieza automática de deduplicación de triggers.               |
| `stories`            | `expiresAt`   | TTL                      | Expiración automática de historias a las 24 h.                  |
| `_post_read_cursors` | `expiresAt`   | TTL                      | Expiración de cursores opacos de `readPosts`.                   |
| `followers`          | `uid`         | `COLLECTION_GROUP` `ASC` | Borrado de aristas de seguidores al eliminar cuenta.            |
| `following`          | `uid`         | `COLLECTION_GROUP` `ASC` | Borrado de aristas de seguidos al eliminar cuenta.              |
| `friends`            | `uid`         | `COLLECTION_GROUP` `ASC` | Borrado de índices de amistad al eliminar cuenta.               |
| `blockedUsers`       | `blockedUid`  | `COLLECTION_GROUP` `ASC` | Limpieza de bloqueos recibidos al eliminar cuenta.              |
| `members`            | `uid`         | `COLLECTION_GROUP` `ASC` | Salida de grupos y chats al eliminar cuenta.                    |
| `attendees`          | `uid`         | `COLLECTION_GROUP` `ASC` | Limpieza de asistencia a eventos al eliminar cuenta.            |
| `likes`              | `uid`         | `COLLECTION_GROUP` `ASC` | Limpieza de likes emitidos al eliminar cuenta.                  |
| `likes`              | `postId`      | `COLLECTION_GROUP` `ASC` | Limpieza de likes ajenos sobre posts del usuario eliminado.     |
| `savedPosts`         | `postId`      | `COLLECTION_GROUP` `ASC` | Limpieza de guardados ajenos sobre posts del usuario eliminado. |
| `comments`           | `authorId`    | `COLLECTION_GROUP` `ASC` | Borrado de comentarios propios al eliminar cuenta.              |
| `messages`           | `senderId`    | `COLLECTION_GROUP` `ASC` | Borrado de mensajes propios en grupos al eliminar cuenta.       |
| `savedArenaDebates`  | `debateId`    | `COLLECTION_GROUP` `ASC` | Limpieza de debates guardados ajenos al eliminar cuenta.        |
| `likedArenaDebates`  | `debateId`    | `COLLECTION_GROUP` `ASC` | Limpieza de likes ajenos a debates propios al eliminar cuenta.  |

## Cómo actualizar

1. Editar `firestore.indexes.json`.
2. Desplegar índices: `firebase deploy --only firestore:indexes`.
3. Actualizar este documento si cambia el contrato de queries.
