# Collections API

Data-access module for personal collections and saved items.

## Goals

- Validate ids, limits, and payloads with `zod`.
- Normalize runtime errors with `AppError`.
- Use `withTimeout` + `withRetry` for read/write operations.
- Keep collection UI contracts unchanged.

## Files

- `types.ts`: public types and validation schemas.
- `queries.ts`: read wrappers for collections and recent items.
- `mutations.ts`: write wrappers for create/delete item workflows.

## Usage

- Consume collection access from `@/features/collections/api`.
- Avoid importing `@/shared/lib/firestore/*` directly from UI.

## Tests

- Unit:
  - `npm run test:run -- src/features/collections/api/queries.test.ts`
  - `npm run test:run -- src/features/collections/api/mutations.test.ts`
