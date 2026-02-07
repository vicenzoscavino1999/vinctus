# Chat API

Módulo de acceso a datos para mensajería (`queries`, `mutations`, `subscriptions`) con validación de contratos, `timeout/retry` y errores tipados.

## Objetivo

- Mantener una interfaz estable para páginas de chat.
- Validar IDs y payloads críticos antes de operar en Firestore.
- Normalizar fallos con `AppError`.
- Evitar listeners colgados con `unsubscribe` seguro e idempotente.

## Archivos

- `queries.ts`: lecturas de perfil, grupo, bloqueos y estado de conversación.
- `mutations.ts`: escrituras (mensajes, mute, bloqueos, reportes, group conversation).
- `subscriptions.ts`: wrappers de listeners con cleanup seguro.
- `types.ts`: tipos y esquemas `zod` del dominio.

## Reglas de uso

- Consumir siempre desde `@/features/chat/api`.
- No llamar directo `@/shared/lib/firestore/*` desde UI para chat.
- Para subscriptions, guardar y ejecutar siempre el `unsubscribe` retornado.

## Tests

- Unit (módulo):  
  `npm run test:run -- src/features/chat/api/queries.test.ts src/features/chat/api/mutations.test.ts src/features/chat/api/subscriptions.test.ts`
- Reglas (emulator):  
  `npm run test:rules`
