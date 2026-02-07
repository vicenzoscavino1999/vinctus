# Posts API

Módulo de acceso a datos para `posts` con contratos tipados, validación de inputs y normalización de errores.

## Objetivo

- Mantener una superficie estable para UI (`queries`, `mutations`, `types`).
- Validar parámetros críticos antes de tocar Firestore.
- Unificar manejo de errores con `AppError`.
- Aplicar `timeout + retry` en operaciones transitorias.

## Archivos

- `queries.ts`: lecturas (post, comentarios, likes, guardados, stories).
- `mutations.ts`: escrituras (comentarios, likes, guardados, story, post uploading/update).
- `types.ts`: contratos y esquemas (`zod`) del módulo.

## Reglas de uso

- Consumir siempre desde `@/features/posts/api`.
- No importar `@/shared/lib/firestore/*` desde UI para `posts`.
- Paginación de listas con `safeLimit` en rango `1..50`.
- Errores esperados: `VALIDATION_FAILED`, `TIMEOUT`, `NETWORK`, `PERMISSION_DENIED`, `NOT_FOUND`.

## Índices Firestore usados

Definidos en `firestore.indexes.json` y documentados en `docs/firestore-indexes.md`.

## Tests

- Unit (módulo):  
  `npm run test:run -- src/features/posts/api/queries.test.ts src/features/posts/api/mutations.test.ts`
- Reglas (emulator):  
  `npm run test:rules`
