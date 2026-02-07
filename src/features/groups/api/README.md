# Groups API

Data-access module for groups domain (`queries` + `mutations`) with:

- Input contracts validated with `zod`.
- Typed errors through `AppError`.
- Read/write hardening with `withTimeout` and `withRetry`.
- Safe limits for pagination and list endpoints.

## Files

- `types.ts`: domain types and validation schemas.
- `queries.ts`: all read operations.
- `mutations.ts`: all write operations.

## Rules

- Consume groups data from `@/features/groups/api`.
- Do not call `@/shared/lib/firestore/*` directly from groups UI.
- Keep pagination limits bounded through `safeLimit`.

## Tests

- Unit:
  - `npm run test:run -- src/features/groups/api/queries.test.ts src/features/groups/api/mutations.test.ts`
- Rules emulator:
  - `npm run test:rules`

## Indexes

This module relies on indexes already documented in `docs/firestore-indexes.md`.
