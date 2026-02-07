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

| Collection Group | Campos                             | Uso principal                                                      |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `groups`         | `categoryId ASC`                   | Descubrir grupos por categoría (`where('categoryId', '==', ...)`). |
| `users_public`   | `displayNameLowercase ASC`         | Búsqueda de usuarios por prefijo (`startAt/endAt`).                |
| `users_public`   | `updatedAt DESC`                   | Listado de usuarios recientes/sugeridos.                           |
| `events`         | `visibility ASC`, `startAt ASC`    | Agenda de eventos futura.                                          |
| `events`         | `visibility ASC`, `startAt DESC`   | Agenda en orden inverso / historial.                               |
| `contributions`  | `categoryId ASC`, `createdAt DESC` | Filtrado de contribuciones por categoría.                          |
| `items`          | `ownerId ASC`, `createdAt DESC`    | Colecciones/items de usuario.                                      |
| `messages`       | `senderId ASC`, `createdAt DESC`   | Búsqueda de mensajes por emisor.                                   |

## Cómo actualizar

1. Editar `firestore.indexes.json`.
2. Desplegar índices: `firebase deploy --only firestore:indexes`.
3. Actualizar este documento si cambia el contrato de queries.
